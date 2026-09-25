import type { Plugin, ViteDevServer } from 'vite'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  DriveInfo,
  QuickFolderInfo,
  ScanOptions,
  ScanProgress,
  FileNode,
  DuplicateScanOptions,
} from '../shared/types'
import { isProtectedSystemPath } from '../shared/pathSecurity'
import { runScanDirectly, cancelDirectScan } from '../electron/workers/scanner.worker'
import { scanSystemJunk, cleanSystemJunk } from '../electron/services/cleanerService'
import {
  scanLeftoverCandidates,
  cleanLeftoverDirectories,
  queryInstalledApps,
  parseUninstallCommand,
} from '../electron/services/appsService'
import { loadScanCache } from '../electron/services/scanCache'
import { getRealSystemSpecs, getFastSystemStats } from '../electron/services/monitorService'
import { findDuplicateFiles } from '../electron/services/duplicateService'
import { searchDiskFiles } from '../electron/services/searchService'

const execAsync = promisify(exec)

let activeScanCancelled = false
let activeScanProgress: ScanProgress = {
  status: 'idle',
  currentPath: '',
  scannedFiles: 0,
  scannedBytes: 0,
  percentage: 0,
}
let activeScanResult: FileNode | null = null
let activePartialResult: FileNode | null = null
let scanListeners: Array<(event: string, data: unknown) => void> = []

function broadcastScanEvent(event: string, data: unknown) {
  scanListeners.forEach((fn) => {
    try {
      fn(event, data)
    } catch {
      // ignore
    }
  })
}

export function devApiServerPlugin(): Plugin {
  return {
    name: 'fernum-dev-api-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next()
        }

        const url = new URL(req.url, 'http://localhost')
        const pathname = url.pathname

        // Health check
        if (pathname === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'ok', server: 'fernum-vite-dev-api' }))
          return
        }

        // Get Logical Drives
        if (pathname === '/api/drives') {
          // 1. Ultra-fast native path: Query available drives via fs.statfsSync (< 1ms vs ~2500ms PowerShell)
          try {
            const detectedDrives: DriveInfo[] = []
            for (let charCode = 67; charCode <= 90; charCode++) {
              const letter = String.fromCharCode(charCode)
              const driveRoot = `${letter}:\\`
              try {
                if (fs.existsSync(driveRoot)) {
                  const st = fs.statfsSync(driveRoot)
                  const total = (st.blocks || 0) * (st.bsize || 4096)
                  const free = (st.bavail || 0) * (st.bsize || 4096)
                  if (total > 0) {
                    const used = Math.max(0, total - free)
                    const isSystem = letter === 'C'
                    detectedDrives.push({
                      id: `${letter}:`,
                      name: isSystem ? 'Local Disk (C:) (System)' : `Local Disk (${letter}:)`,
                      path: driveRoot,
                      totalBytes: total,
                      freeBytes: free,
                      usedBytes: used,
                      filesystem: 'NTFS',
                      isSystem,
                    })
                  }
                }
              } catch {
                // Inaccessible or non-existent drive letter
              }
            }

            if (detectedDrives.length > 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(detectedDrives))
              return
            }
          } catch {
            // Fallback to PowerShell
          }

          // 2. PowerShell query fallback
          try {
            const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-CimInstance -ClassName Win32_LogicalDisk | Select-Object DeviceID, VolumeName, Size, FreeSpace, FileSystem | ConvertTo-Json -Compress
`
            const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
            const { stdout } = await execAsync(
              `powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`,
              { windowsHide: true }
            )
            if (stdout && stdout.trim()) {
              const firstChar = stdout.search(/[{\[]/)
              const jsonStr = firstChar !== -1 ? stdout.slice(firstChar).trim() : stdout.trim()
              const parsed = JSON.parse(jsonStr)
              const disks = Array.isArray(parsed) ? parsed : [parsed]
              const drives: DriveInfo[] = disks
                .filter((d) => d && d.DeviceID && d.Size)
                .map((d) => {
                  const total = Number(d.Size) || 0
                  const free = Number(d.FreeSpace) || 0
                  const used = Math.max(0, total - free)
                  const id = String(d.DeviceID)
                  const isSystem = id.toUpperCase().startsWith('C')
                  return {
                    id,
                    name: d.VolumeName || (isSystem ? 'Local Disk (System)' : 'Local Disk'),
                    path: `${id}\\`,
                    totalBytes: total,
                    freeBytes: free,
                    usedBytes: used,
                    filesystem: d.FileSystem || 'NTFS',
                    isSystem,
                  }
                })
              if (drives.length > 0) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(drives))
                return
              }
            }
          } catch (error) {
            console.error('[DevApi] Failed to query logical drives:', error)
          }

          // 3. Guaranteed Fallback: Never return 500 error, always return at least the primary system drive
          const systemDriveLetter = (process.env.SystemDrive || 'C:').replace(/[\\\/]/g, '').toUpperCase()
          const fallbackPath = `${systemDriveLetter}\\`
          let fallbackTotal = 512 * 1024 * 1024 * 1024
          let fallbackFree = 120 * 1024 * 1024 * 1024
          try {
            const st = fs.statfsSync(fallbackPath)
            if (st && st.blocks && st.blocks > 0) {
              fallbackTotal = (st.blocks || 0) * (st.bsize || 4096)
              fallbackFree = (st.bavail || 0) * (st.bsize || 4096)
            }
          } catch {
            // Ignored
          }

          const fallbackDrives: DriveInfo[] = [
            {
              id: systemDriveLetter,
              name: `Local Disk (${systemDriveLetter}) (System)`,
              path: fallbackPath,
              totalBytes: fallbackTotal,
              freeBytes: fallbackFree,
              usedBytes: Math.max(0, fallbackTotal - fallbackFree),
              filesystem: 'NTFS',
              isSystem: true,
            },
          ]
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(fallbackDrives))
          return
        }

        // Get Quick Access / File Manager Folders
        if (pathname === '/api/quick-folders') {
          const userProfile = process.env.USERPROFILE || 'C:\\Users\\hardi'
          const folders: QuickFolderInfo[] = [
            {
              id: 'user-profile',
              name: `User Home (${path.basename(userProfile)})`,
              path: userProfile,
              category: 'user',
              exists: fs.existsSync(userProfile),
            },
            {
              id: 'downloads',
              name: 'Downloads',
              path: path.join(userProfile, 'Downloads'),
              category: 'downloads',
              exists: fs.existsSync(path.join(userProfile, 'Downloads')),
            },
            {
              id: 'documents',
              name: 'Documents',
              path: path.join(userProfile, 'Documents'),
              category: 'documents',
              exists: fs.existsSync(path.join(userProfile, 'Documents')),
            },
            {
              id: 'desktop',
              name: 'Desktop',
              path: path.join(userProfile, 'Desktop'),
              category: 'desktop',
              exists: fs.existsSync(path.join(userProfile, 'Desktop')),
            },
            {
              id: 'videos',
              name: 'Videos',
              path: path.join(userProfile, 'Videos'),
              category: 'videos',
              exists: fs.existsSync(path.join(userProfile, 'Videos')),
            },
            {
              id: 'pictures',
              name: 'Pictures',
              path: path.join(userProfile, 'Pictures'),
              category: 'pictures',
              exists: fs.existsSync(path.join(userProfile, 'Pictures')),
            },
            {
              id: 'music',
              name: 'Music',
              path: path.join(userProfile, 'Music'),
              category: 'music',
              exists: fs.existsSync(path.join(userProfile, 'Music')),
            },
          ]

          const projectsPath = path.join(userProfile, 'Projects')
          if (fs.existsSync(projectsPath)) {
            folders.push({
              id: 'projects',
              name: 'Projects',
              path: projectsPath,
              category: 'custom',
              exists: true,
            })
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(folders.filter((f) => f.exists)))
          return
        }

        // Real-Time System Hardware Specs (Monitor)
        if (pathname === '/api/specs') {
          try {
            const specs = await getRealSystemSpecs()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(specs))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // Real-Time System Stats (Monitor - sub-millisecond fast telemetry)
        if (pathname === '/api/stats') {
          try {
            const stats = await getFastSystemStats()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(stats))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // Real Installed Apps
        if (pathname === '/api/apps') {
          try {
            const apps = await queryInstalledApps(false)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(apps))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }

        // Start Real Scan
        if (pathname === '/api/scan/start' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', async () => {
            try {
              const options: ScanOptions = body ? JSON.parse(body) : { targetPath: 'C:\\' }
              let targetPath = options.targetPath || process.env.USERPROFILE || 'C:\\'
              if (/^[a-zA-Z]:$/.test(targetPath)) {
                targetPath = `${targetPath}\\`
              }
              const excludedSet = new Set((options.excludePaths || []).map((p) => p.toLowerCase()))
              const maxDepth = options.maxDepth !== undefined ? options.maxDepth : (options.deepScan ? 35 : 6)

              activeScanCancelled = false
              activeScanResult = null
              activePartialResult = null
              activeScanProgress = {
                status: 'scanning',
                currentPath: targetPath,
                scannedFiles: 0,
                scannedBytes: 0,
                percentage: 0,
              }
              broadcastScanEvent('progress', activeScanProgress)

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true, targetPath }))

              // Run robust scanner engine asynchronously in background
              try {
                const rootNode = await runScanDirectly(
                  {
                    targetPath,
                    excludePaths: Array.from(excludedSet),
                    maxDepth,
                    deepScan: Boolean(options.deepScan),
                    isPro: Boolean(options.isPro),
                    maxBytes: options.maxBytes,
                  },
                  {
                    onProgress: (progress) => {
                      activeScanProgress = progress
                      broadcastScanEvent('progress', progress)
                    },
                    onPartial: (partialNode) => {
                      activePartialResult = partialNode
                      broadcastScanEvent('partial', partialNode)
                    },
                  }
                )

                if (activeScanCancelled) {
                  activeScanProgress.status = 'cancelled'
                  broadcastScanEvent('progress', activeScanProgress)
                  return
                }

                if (rootNode) {
                  activeScanResult = rootNode
                  activePartialResult = rootNode
                  activeScanProgress = {
                    status: 'completed',
                    currentPath: targetPath,
                    scannedFiles: activeScanProgress.scannedFiles || 1,
                    scannedBytes: rootNode.size,
                    percentage: 100,
                  }
                  broadcastScanEvent('progress', activeScanProgress)
                  broadcastScanEvent('complete', rootNode)
                } else {
                  activeScanProgress.status = 'error'
                  broadcastScanEvent('error', `Could not access ${targetPath}`)
                }
              } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err)
                if (errMsg.includes('cancelled')) {
                  activeScanProgress.status = 'cancelled'
                  broadcastScanEvent('progress', activeScanProgress)
                } else {
                  activeScanProgress.status = 'error'
                  broadcastScanEvent('error', errMsg)
                }
              }
            } catch (err) {
              broadcastScanEvent('error', String(err))
            }
          })
          return
        }

        // Cancel Scan
        if (pathname === '/api/scan/cancel') {
          cancelDirectScan()
          activeScanCancelled = true
          activeScanProgress.status = 'cancelled'
          broadcastScanEvent('progress', activeScanProgress)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
          return
        }

        // Get Latest Scan Progress / Complete Result
        if (pathname === '/api/scan/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              progress: activeScanProgress,
              result: activeScanProgress.status === 'completed' ? activeScanResult : null,
              partial: activePartialResult,
            })
          )
          return
        }

        // Server-Sent Events (SSE) for live scan progress
        if (pathname === '/api/scan/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          res.write(`data: ${JSON.stringify({ type: 'init', data: activeScanProgress })}\n\n`)

          const listener = (event: string, data: unknown) => {
            res.write(`data: ${JSON.stringify({ type: event, data })}\n\n`)
          }
          scanListeners.push(listener)

          req.on('close', () => {
            scanListeners = scanListeners.filter((l) => l !== listener)
          })
          return
        }

        // Reveal in File Explorer
        if (pathname === '/api/reveal' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            const { targetPath } = JSON.parse(body || '{}')
            if (!targetPath || isProtectedSystemPath(targetPath)) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Protected system path cannot be targeted.' }))
              return
            }
            if (targetPath) {
              try {
                if (/^[a-zA-Z]:[\\/]*$/.test(targetPath.trim())) {
                  await execAsync(`explorer.exe "${targetPath.trim()}"`)
                } else {
                  await execAsync(`explorer.exe /select,"${targetPath.trim()}"`)
                }
              } catch {
                // ignore
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, path: targetPath }))
          })
          return
        }

        // Move to Recycle Bin
        if (pathname === '/api/trash' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            const { targetPath } = JSON.parse(body || '{}')
            if (!targetPath || isProtectedSystemPath(targetPath)) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Protected system paths or drive roots cannot be deleted.' }))
              return
            }
            if (targetPath) {
              // Pass the path as data, not PowerShell source, so a filename cannot alter this script.
              const targetPathBase64 = Buffer.from(targetPath, 'utf8').toString('base64')
              const psScript = `
Add-Type -AssemblyName Microsoft.VisualBasic
$targetPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${targetPathBase64}'))
if (Test-Path -LiteralPath $targetPath -PathType Container) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($targetPath, 'OnlyErrorDialogs', 'SendToRecycleBin')
} else {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($targetPath, 'OnlyErrorDialogs', 'SendToRecycleBin')
}
`
              try {
                const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
                await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`)
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, error: String(err) }))
                return
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, path: targetPath }))
          })
          return
        }

        // Permanent Delete
        if (pathname === '/api/delete' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            const { targetPath } = JSON.parse(body || '{}')
            if (!targetPath || isProtectedSystemPath(targetPath)) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Protected system paths or drive roots cannot be permanently deleted.' }))
              return
            }
            try {
              await fsPromises.rm(targetPath, { recursive: true, force: true })
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true, path: targetPath }))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: String(err) }))
            }
          })
          return
        }

        // Native Uninstall App
        if (pathname === '/api/apps/uninstall' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            const { appId } = JSON.parse(body || '{}')
            try {
              const apps = await queryInstalledApps(false)
              const matched = apps.find((app) => app.id === appId || app.name === appId)
              if (matched && matched.uninstallString) {
                const command = parseUninstallCommand(matched.uninstallString)
                if (command) {
                  const { spawn } = await import('node:child_process')
                  const child = spawn('cmd.exe', ['/c', 'start', '""', command.filePath, ...command.args], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true,
                  })
                  child.unref()
                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: true, message: `Uninstaller launched for "${matched.name}". Follow the on-screen prompts.` }))
                  return
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: 'Application uninstaller command was not found.' }))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: String(err) }))
            }
          })
          return
        }

        // Live Real File Search
        if (pathname === '/api/search' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const options = JSON.parse(body || '{}')
              const results = await searchDiskFiles(options)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(results))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
          return
        }

        // Deep Duplicate File Search
        if (pathname === '/api/duplicates/scan' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const options: DuplicateScanOptions = JSON.parse(body || '{}')
              const result = await findDuplicateFiles(options)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
          return
        }

        // Native Folder Picker Dialog via PowerShell Forms
        if (pathname === '/api/select-folder') {
          try {
            const psScript = `
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Select Folder to Scan'
$f.ShowNewFolderButton = $false
$top = New-Object System.Windows.Forms.Form
$top.TopMost = $true
if ($f.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $f.SelectedPath
}
`
            const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
            const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, {
              windowsHide: false,
            })
            const selectedPath = stdout ? stdout.trim() : null
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ selectedPath }))
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ selectedPath: null }))
          }
          return
        }

        // Persistent Scan Cache
        if (pathname === '/api/scan/cache') {
          const targetPath = url.searchParams.get('path') || ''
          try {
            const cached = await loadScanCache(targetPath)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(cached))
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(null))
          }
          return
        }

        // Real Junk Cleaner: Scan
        if (pathname === '/api/cleaner/scan' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const { categories, forceRescan } = JSON.parse(body || '{}')
              const result = await scanSystemJunk(categories, forceRescan)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
          return
        }

        // Real Junk Cleaner: Clean
        if (pathname === '/api/cleaner/clean' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const { categoryIds } = JSON.parse(body || '{}')
              const result = await cleanSystemJunk(categoryIds || [])
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
          return
        }

        // Real Leftovers: Scan
        if (pathname === '/api/apps/leftovers' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const { appName, publisher } = JSON.parse(body || '{}')
              const result = await scanLeftoverCandidates(appName || '', publisher)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
          return
        }

        // Real Leftovers: Clean
        if (pathname === '/api/apps/clean-leftovers' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const { paths } = JSON.parse(body || '{}')
              const result = await cleanLeftoverDirectories(paths || [])
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
          return
        }

        // Batch Trash
        if (pathname === '/api/trash-many' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const { paths } = JSON.parse(body || '{}')
              const list: string[] = paths || []
              const succeeded: string[] = []
              const failed: Array<{ path: string; error: string }> = []
              for (const p of list) {
                if (!p || isProtectedSystemPath(p)) {
                  failed.push({ path: p, error: 'Protected system path.' })
                  continue
                }
                try {
                  const b64 = Buffer.from(p, 'utf8').toString('base64')
                  const psScript = `
Add-Type -AssemblyName Microsoft.VisualBasic
$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))
if (Test-Path -LiteralPath $p -PathType Container) {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin')
} else {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin')
}
`
                  const psB64 = Buffer.from(psScript, 'utf16le').toString('base64')
                  await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${psB64}`)
                  succeeded.push(p)
                } catch (e) {
                  failed.push({ path: p, error: String(e) })
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                success: failed.length === 0,
                totalRequested: list.length,
                deletedCount: succeeded.length,
                succeeded,
                failed,
              }))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
          return
        }

        // Batch Delete
        if (pathname === '/api/delete-many' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            try {
              const { paths } = JSON.parse(body || '{}')
              const list: string[] = paths || []
              const succeeded: string[] = []
              const failed: Array<{ path: string; error: string }> = []
              for (const p of list) {
                if (!p || isProtectedSystemPath(p)) {
                  failed.push({ path: p, error: 'Protected system path.' })
                  continue
                }
                try {
                  await fsPromises.rm(p, { recursive: true, force: true })
                  succeeded.push(p)
                } catch (e) {
                  failed.push({ path: p, error: String(e) })
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                success: failed.length === 0,
                totalRequested: list.length,
                deletedCount: succeeded.length,
                succeeded,
                failed,
              }))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
          return
        }

        next()
      })
    },
  }
}
