import type { Plugin, ViteDevServer } from 'vite'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import si from 'systeminformation'
import type {
  DriveInfo,
  QuickFolderInfo,
  ScanOptions,
  ScanProgress,
  FileNode,
  FileCategory,
  InstalledApp,
  SearchResultItem,
  SystemStats,
} from '../shared/types'
import { isProtectedSystemPath } from '../shared/pathSecurity'

const execAsync = promisify(exec)

const EXT_CATEGORY_MAP: Record<string, FileCategory> = {
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video', flv: 'video', webm: 'video',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', m4a: 'audio',
  pdf: 'document', doc: 'document', docx: 'document', xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document', txt: 'document', csv: 'document', md: 'document',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', iso: 'archive',
  js: 'code', ts: 'code', tsx: 'code', jsx: 'code', py: 'code', java: 'code', cpp: 'code', c: 'code', cs: 'code', go: 'code', rs: 'code', html: 'code', css: 'code', json: 'code',
  exe: 'system', dll: 'system', sys: 'system', msi: 'system',
  tmp: 'cache', temp: 'cache', log: 'cache', cache: 'cache',
}

function getCategory(ext: string): FileCategory {
  const cleanExt = ext.toLowerCase().replace(/^\./, '')
  return EXT_CATEGORY_MAP[cleanExt] || 'other'
}

let activeScanCancelled = false
let activeScanProgress: ScanProgress = {
  status: 'idle',
  currentPath: '',
  scannedFiles: 0,
  scannedBytes: 0,
  percentage: 0,
}
let activeScanResult: FileNode | null = null
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

async function scanDirectory(
  dirPath: string,
  depth: number,
  maxDepth: number,
  excludedSet: Set<string>,
  onProgress: (scannedFiles: number, scannedBytes: number, current: string) => void,
  counters: { totalFiles: number; totalBytes: number; lastReport: number }
): Promise<FileNode | null> {
  if (activeScanCancelled) return null

  const baseName = path.basename(dirPath) || dirPath
  const lowerName = baseName.toLowerCase()

  if (['$recycle.bin', 'system volume information', 'config.msi', 'recovery'].includes(lowerName)) {
    return null
  }
  if (excludedSet.has(dirPath.toLowerCase())) return null

  const dirNode: FileNode = {
    id: dirPath,
    name: baseName,
    path: dirPath,
    size: 0,
    type: 'directory',
    category: 'other',
    children: [],
  }

  let entries: fs.Dirent[] = []
  try {
    entries = await fsPromises.readdir(dirPath, { withFileTypes: true })
  } catch {
    return null
  }

  const childNodes: FileNode[] = []
  const fileEntries: fs.Dirent[] = []
  const dirEntries: fs.Dirent[] = []

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const lower = entry.name.toLowerCase()
    if (['pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'dumpstack.log.tmp'].includes(lower)) continue

    if (entry.isDirectory()) {
      dirEntries.push(entry)
    } else if (entry.isFile()) {
      fileEntries.push(entry)
    }
  }

  // Concurrent stats in batches of 32
  const BATCH_SIZE = 32
  for (let i = 0; i < fileEntries.length; i += BATCH_SIZE) {
    if (activeScanCancelled) return null
    const batch = fileEntries.slice(i, i + BATCH_SIZE)
    const statsResults = await Promise.all(
      batch.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name)
        if (excludedSet.has(fullPath.toLowerCase())) return null
        try {
          const stats = await fsPromises.stat(fullPath)
          const fileSize = stats.size || 0
          const ext = path.extname(entry.name)
          const fileNode: FileNode = {
            id: fullPath,
            name: entry.name,
            path: fullPath,
            size: fileSize,
            type: 'file',
            category: getCategory(ext),
            extension: ext,
            lastModified: stats.mtimeMs,
          }
          return fileNode
        } catch {
          return null
        }
      })
    )

    for (const node of statsResults) {
      if (node) {
        childNodes.push(node)
        dirNode.size += node.size
        counters.totalFiles++
        counters.totalBytes += node.size
      }
    }

    const now = Date.now()
    if (now - counters.lastReport > 150) {
      counters.lastReport = now
      onProgress(counters.totalFiles, counters.totalBytes, dirPath)
    }
  }

  for (const entry of dirEntries) {
    if (activeScanCancelled) return null
    const fullPath = path.join(dirPath, entry.name)
    if (excludedSet.has(fullPath.toLowerCase())) continue
    if (maxDepth > 0 && depth >= maxDepth) continue

    const subDirNode = await scanDirectory(
      fullPath,
      depth + 1,
      maxDepth,
      excludedSet,
      onProgress,
      counters
    )
    if (subDirNode && (subDirNode.size > 0 || (subDirNode.children && subDirNode.children.length > 0))) {
      childNodes.push(subDirNode)
      dirNode.size += subDirNode.size
    }
  }

  childNodes.sort((a, b) => b.size - a.size)
  dirNode.children = childNodes

  return dirNode
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
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(drives))
              return
            }
          } catch (error) {
            console.error('[DevApi] Failed to query logical drives:', error)
          }

          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Could not read logical drive information from Windows.' }))
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

        // Real-Time System Stats (Monitor)
        if (pathname === '/api/stats') {
          try {
            const [cpuSpeed, cpuLoad, mem, netStats, procs] = await Promise.all([
              si.cpuCurrentSpeed(),
              si.currentLoad(),
              si.mem(),
              si.networkStats(),
              si.processes(),
            ])

            const primaryNet = netStats[0] || { rx_sec: 0, tx_sec: 0 }

            const topProcs = (procs.list || [])
              .sort((a, b) => (b.memRss || 0) - (a.memRss || 0))
              .slice(0, 10)
              .map((p) => ({
                pid: p.pid,
                name: p.name,
                cpuPercent: Math.round(p.cpu || 0),
                memoryBytes: (p.memRss || 0),
              }))

            const stats: SystemStats = {
              timestamp: Date.now(),
              cpu: {
                usagePercent: Math.round(cpuLoad.currentLoad || 0),
                model: 'Windows CPU',
                cores: cpuLoad.cpus ? cpuLoad.cpus.length : 8,
                speedGhz: Number((cpuSpeed.avg || 2.4).toFixed(2)),
              },
              memory: {
                totalBytes: mem.total,
                usedBytes: mem.active || mem.used,
                freeBytes: mem.free,
                usagePercent: Math.round(((mem.active || mem.used) / mem.total) * 100),
              },
              disk: {
                readSpeedBytesPerSec: 0,
                writeSpeedBytesPerSec: 0,
              },
              network: {
                rxSpeedBytesPerSec: Math.max(0, primaryNet.rx_sec || 0),
                txSpeedBytesPerSec: Math.max(0, primaryNet.tx_sec || 0),
              },
              topProcesses: topProcs,
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(stats))
            return
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
            return
          }
        }

        // Real Installed Apps
        if (pathname === '/api/apps') {
          try {
            const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$paths = @(
    'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$items = Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -and -not $_.SystemComponent -and ($_.UninstallString -or $_.QuietUninstallString) } |
    Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, InstallLocation, UninstallString, EstimatedSize |
    Sort-Object DisplayName -Unique
$items | ConvertTo-Json -Compress -Depth 2
`
            const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
            const { stdout } = await execAsync(
              `powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`,
              { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
            )

            if (stdout && stdout.trim()) {
              const firstChar = stdout.search(/[{\[]/)
              const jsonStr = firstChar !== -1 ? stdout.slice(firstChar).trim() : stdout.trim()
              const raw = JSON.parse(jsonStr)
              const list = Array.isArray(raw) ? raw : [raw]
              const apps: InstalledApp[] = list
                .filter((item) => item && item.DisplayName)
                .map((item, idx) => ({
                  id: `app-${idx}-${(item.DisplayName || '').replace(/\s+/g, '-').toLowerCase()}`,
                  name: item.DisplayName,
                  publisher: item.Publisher || 'Unknown',
                  version: item.DisplayVersion,
                  installDate: item.InstallDate,
                  installLocation: item.InstallLocation,
                  uninstallString: item.UninstallString,
                  estimatedSizeBytes: item.EstimatedSize ? Number(item.EstimatedSize) * 1024 : undefined,
                }))

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(apps))
              return
            }
          } catch {
            // fallback
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify([]))
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
              const options: ScanOptions = body ? JSON.parse(body) : { targetPath: 'C:\\Users\\hardi' }
              const targetPath = options.targetPath || process.env.USERPROFILE || 'C:\\Users\\hardi'
              const excludedSet = new Set((options.excludePaths || []).map((p) => p.toLowerCase()))
              const maxDepth = options.maxDepth || 20

              activeScanCancelled = false
              activeScanResult = null
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

              // Run scan asynchronously in background
              const counters = { totalFiles: 0, totalBytes: 0, lastReport: Date.now() }
              const rootNode = await scanDirectory(
                targetPath,
                0,
                maxDepth,
                excludedSet,
                (scannedFiles, scannedBytes, current) => {
                  activeScanProgress = {
                    status: 'scanning',
                    currentPath: current,
                    scannedFiles,
                    scannedBytes,
                    percentage: 0,
                  }
                  broadcastScanEvent('progress', activeScanProgress)
                },
                counters
              )

              if (activeScanCancelled) {
                activeScanProgress.status = 'cancelled'
                broadcastScanEvent('progress', activeScanProgress)
                return
              }

              if (rootNode) {
                activeScanResult = rootNode
                activeScanProgress = {
                  status: 'completed',
                  currentPath: targetPath,
                  scannedFiles: counters.totalFiles,
                  scannedBytes: counters.totalBytes,
                  percentage: 100,
                }
                broadcastScanEvent('progress', activeScanProgress)
                broadcastScanEvent('complete', rootNode)
              } else {
                activeScanProgress.status = 'error'
                broadcastScanEvent('error', `Could not access ${targetPath}`)
              }
            } catch (err) {
              broadcastScanEvent('error', String(err))
            }
          })
          return
        }

        // Cancel Scan
        if (pathname === '/api/scan/cancel') {
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
              const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$paths = @(
    'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$items = Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -and -not $_.SystemComponent -and ($_.UninstallString -or $_.QuietUninstallString) } |
    Select-Object DisplayName, UninstallString, InstallLocation
$items | ConvertTo-Json -Compress
`
              const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
              const { stdout } = await execAsync(
                `powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`,
                { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
              )
              if (stdout && stdout.trim()) {
                const firstChar = stdout.search(/[{\[]/)
                const jsonStr = firstChar !== -1 ? stdout.slice(firstChar).trim() : stdout.trim()
                const raw = JSON.parse(jsonStr)
                const list = Array.isArray(raw) ? raw : [raw]
                const matched = list.find((item: any, idx: number) => {
                  const id = `app-${idx}-${(item.DisplayName || '').replace(/\\s+/g, '-').toLowerCase()}`
                  return id === appId || item.DisplayName === appId
                })
                if (matched && matched.UninstallString) {
                  const { spawn } = await import('node:child_process')
                  const child = spawn('cmd.exe', ['/c', 'start', '""', matched.UninstallString], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true,
                  })
                  child.unref()
                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: true, message: `Uninstaller launched for "${matched.DisplayName}". Follow the on-screen prompts.` }))
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
              const searchRoot = options.targetPath || process.env.USERPROFILE || 'C:\\Users\\hardi'
              const query = (options.query || '').toLowerCase().trim()
              const minSize = options.minSizeBytes || 0
              const categoryFilter = options.category
              const limit = options.limit || 100

              const results: SearchResultItem[] = []

              async function crawlSearch(dir: string, depth: number) {
                if (results.length >= limit || depth > 8) return
                try {
                  const items = await fsPromises.readdir(dir, { withFileTypes: true })
                  for (const item of items) {
                    if (results.length >= limit) break
                    if (item.isSymbolicLink()) continue
                    const full = path.join(dir, item.name)
                    if (['$recycle.bin', 'system volume information', 'node_modules'].includes(item.name.toLowerCase())) continue

                    if (item.isFile()) {
                      const lower = item.name.toLowerCase()
                      if (query && !lower.includes(query)) continue
                      const ext = path.extname(item.name)
                      const cat = getCategory(ext)
                      if (categoryFilter && cat !== categoryFilter) continue

                      try {
                        const st = await fsPromises.stat(full)
                        if (st.size < minSize) continue
                        results.push({
                          id: full,
                          name: item.name,
                          path: full,
                          sizeBytes: st.size,
                          category: cat,
                          extension: ext,
                          lastModified: st.mtimeMs,
                        })
                      } catch {
                        // ignore
                      }
                    } else if (item.isDirectory()) {
                      await crawlSearch(full, depth + 1)
                    }
                  }
                } catch {
                  // ignore
                }
              }

              await crawlSearch(searchRoot, 0)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(results))
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
