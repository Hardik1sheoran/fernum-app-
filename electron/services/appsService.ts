import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { CleanLeftoversResult, InstalledApp, LeftoverResidue, ScanLeftoversResult } from '../../shared/types'
import {
  getAllowedCleanupRoots,
  isProtectedSystemPath,
  isWithinAllowedCleanupRoot,
} from '../../shared/pathSecurity'
import {
  parseRegistryApps,
  extractKeywords,
  isResidueMatch,
} from '../../shared/appsUtils'

const execAsync = promisify(exec)

let cachedApps: InstalledApp[] = []
let lastAppsFetch = 0
const APPS_CACHE_TTL = 8000 // 8 second TTL

export function clearAppsCache(): void {
  cachedApps = []
  lastAppsFetch = 0
}

/**
 * Verifies that an app entry actually exists on the filesystem and is not an uninstalled ghost.
 */
export function isAppPhysicallyPresent(item: InstalledApp): boolean {
  const loc = item.installLocation ? item.installLocation.trim() : ''
  const un = item.uninstallString ? item.uninstallString.trim() : ''

  let hasLoc = false
  if (loc) {
    try {
      hasLoc = fs.existsSync(loc)
    } catch {}
  }

  let hasUninstaller = false
  let isMsi = false
  if (un) {
    if (/\bmsiexec(\.exe)?\b/i.test(un)) {
      isMsi = true
    } else {
      const parsed = parseUninstallCommand(un)
      if (parsed && parsed.filePath) {
        hasUninstaller = true
      }
    }
  }

  // 1. If install location was explicitly registered and missing from disk, it was deleted:
  if (loc && !hasLoc) {
    return false
  }

  // If install location exists, but the folder is completely empty and has no uninstaller:
  if (loc && hasLoc) {
    try {
      const entries = fs.readdirSync(loc)
      if (entries.length === 0 && !hasUninstaller) {
        return false
      }
    } catch {}
  }

  // 2. If an executable uninstaller was explicitly specified on disk and does not exist, and no valid install location:
  if (un && !isMsi && !hasUninstaller && !hasLoc) {
    return false
  }

  // 3. If neither location nor uninstaller was provided or both are empty:
  if (!loc && !un) {
    return false
  }

  return true
}

/**
 * Fast directory size calculation for installed apps without blocking.
 */
export async function getFastDirectorySize(dirPath: string, maxDepth = 2): Promise<number> {
  let total = 0
  async function walk(d: string, depth: number) {
    if (depth > maxDepth) return
    try {
      const entries = await fs.promises.readdir(d, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const full = path.join(d, entry.name)
        if (entry.isFile()) {
          try {
            const st = await fs.promises.stat(full)
            total += st.size
          } catch {}
        } else if (entry.isDirectory() && depth < maxDepth) {
          await walk(full, depth + 1)
        }
      }
    } catch {}
  }
  await walk(dirPath, 0)
  return total
}

/**
 * Queries Windows registry for installed applications across 32-bit, 64-bit, and user scopes.
 * Filters out ghost/deleted applications whose files have been removed from disk.
 */
export async function queryInstalledApps(forceRefresh = false): Promise<InstalledApp[]> {
  const now = Date.now()
  if (!forceRefresh && cachedApps.length > 0 && now - lastAppsFetch < APPS_CACHE_TTL) {
    return cachedApps
  }
  const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$keys = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$items = Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and -not $_.SystemComponent } |
  Select-Object PSChildName, DisplayName, DisplayVersion, Publisher, InstallDate, EstimatedSize, InstallLocation, UninstallString
$items | ConvertTo-Json -Compress
`

  try {
    const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
    const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, {
      maxBuffer: 1024 * 1024 * 16, // 16MB buffer for large registries
      windowsHide: true,
    })

    if (!stdout || !stdout.trim()) {
      return []
    }

    // Isolate JSON starting token to strip CLIXML or progress warnings
    const firstChar = stdout.search(/[{\[]/)
    const jsonStr = firstChar !== -1 ? stdout.slice(firstChar).trim() : stdout.trim()
    const rawApps = parseRegistryApps(jsonStr)

    // Filter out apps that have been physically deleted from disk
    const apps = rawApps.filter(isAppPhysicallyPresent)

    // Enrich apps missing estimatedSizeBytes with real filesystem directory size
    for (const app of apps) {
      if ((!app.estimatedSizeBytes || app.estimatedSizeBytes === 0) && app.installLocation) {
        try {
          if (fs.existsSync(app.installLocation)) {
            const realSize = await getFastDirectorySize(app.installLocation)
            if (realSize > 0) {
              app.estimatedSizeBytes = realSize
            }
          }
        } catch {}
      }
    }

    // Sort descending by size, then alphabetically by name
    apps.sort((a, b) => {
      const sizeA = a.estimatedSizeBytes || 0
      const sizeB = b.estimatedSizeBytes || 0
      if (sizeB !== sizeA) return sizeB - sizeA
      return a.name.localeCompare(b.name)
    })

    cachedApps = apps
    lastAppsFetch = Date.now()
    return apps
  } catch (err) {
    console.error('[AppsService] Failed to query installed applications:', err)
    return []
  }
}

/**
 * Calculates the total size of a directory recursively in bytes.
 */
export async function getDirectorySizeBytes(dirPath: string): Promise<number> {
  let totalBytes = 0
  try {
    const entries = await fs.promises.readdir(dirPath)
    for (const name of entries) {
      const fullPath = path.join(dirPath, name)
      try {
        const stats = await fs.promises.lstat(fullPath)
        if (stats.isSymbolicLink()) continue
        if (stats.isDirectory()) {
          totalBytes += await getDirectorySizeBytes(fullPath)
        } else if (stats.isFile()) {
          totalBytes += stats.size
        }
      } catch {
        // Ignore individual file stat failures (locked files / access denied)
      }
    }
  } catch {
    // Ignore directory read failures (permission denied)
  }
  return totalBytes
}

export interface EnvironmentRoots {
  localAppData?: string
  appData?: string
  programData?: string
  userProfile?: string
}

/**
 * Scans standard Windows directories for leftover residue of an application.
 */
export async function scanLeftoverCandidates(
  appName: string,
  publisher?: string,
  customRoots?: EnvironmentRoots
): Promise<ScanLeftoversResult> {
  const roots = customRoots || {
    localAppData: process.env.LOCALAPPDATA,
    appData: process.env.APPDATA,
    programData: process.env.PROGRAMDATA || 'C:\\ProgramData',
    userProfile: process.env.USERPROFILE,
  }

  const keywords = extractKeywords(appName, publisher)
  if (keywords.length === 0) {
    return { appName, totalSizeBytes: 0, residues: [] }
  }

  const scanTargets: Array<{
    root: string | undefined
    category: LeftoverResidue['category']
    description: string
  }> = [
    {
      root: roots.localAppData,
      category: 'localappdata',
      description: 'Local AppData caches & user settings',
    },
    {
      root: roots.appData,
      category: 'appdata',
      description: 'Roaming AppData profiles & configurations',
    },
    {
      root: roots.programData,
      category: 'programdata',
      description: 'Shared machine caches & installation data',
    },
    {
      root: roots.localAppData ? path.join(roots.localAppData, 'Programs') : undefined,
      category: 'localappdata',
      description: 'Per-user program installation leftovers',
    },
  ]

  const residues: LeftoverResidue[] = []
  const checkedPaths = new Set<string>()

  for (const target of scanTargets) {
    if (!target.root) continue

    try {
      if (!fs.existsSync(target.root)) continue
      const entries = await fs.promises.readdir(target.root)

      for (const name of entries) {
        const fullPath = path.join(target.root, name)
        const normalized = fullPath.toLowerCase()

        if (checkedPaths.has(normalized)) continue
        checkedPaths.add(normalized)

        // Ensure path is not protected or root
        if (isProtectedSystemPath(fullPath)) continue

        try {
          const stats = await fs.promises.lstat(fullPath)
          if (stats.isSymbolicLink() || !stats.isDirectory()) continue
        } catch {
          continue
        }

        if (isResidueMatch(name, keywords)) {
          const sizeBytes = await getDirectorySizeBytes(fullPath)
          residues.push({
            path: fullPath,
            sizeBytes,
            category: target.category,
            description: target.description,
          })
        }
      }
    } catch {
      // Continue next target on read failure
    }
  }

  const totalSizeBytes = residues.reduce((acc, r) => acc + r.sizeBytes, 0)
  return {
    appName,
    totalSizeBytes,
    residues,
  }
}

/**
 * Trashes or deletes leftover residue directories.
 */
export async function cleanLeftoverDirectories(
  pathsToClean: string[],
  trashFn?: (p: string) => Promise<void>
): Promise<CleanLeftoversResult> {
  let cleanedBytes = 0
  const successfullyCleaned: string[] = []
  const failed: CleanLeftoversResult['failed'] = []
  const allowedRoots = getAllowedCleanupRoots()

  for (const targetPath of pathsToClean) {
    if (!targetPath || !fs.existsSync(targetPath)) {
      failed.push({ path: targetPath, reason: 'Path does not exist.' })
      continue
    }

    if (!isWithinAllowedCleanupRoot(targetPath, allowedRoots)) {
      const reason = 'Path is outside the allowed AppData or ProgramData cleanup roots.'
      console.warn(`[AppsService] Refusing to clean unsafe path: ${targetPath}`)
      failed.push({ path: targetPath, reason })
      continue
    }

    if (isProtectedSystemPath(targetPath)) {
      const reason = 'Path is protected by the system safety policy.'
      console.warn(`[AppsService] Refusing to clean protected path: ${targetPath}`)
      failed.push({ path: targetPath, reason })
      continue
    }

    try {
      const size = await getDirectorySizeBytes(targetPath)
      if (trashFn) {
        await trashFn(targetPath)
      } else {
        // Safe PowerShell Recycle Bin fallback
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
        const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
        await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`)
      }
      cleanedBytes += size
      successfullyCleaned.push(targetPath)
    } catch (trashErr) {
      console.warn(`[AppsService] Trash failed for ${targetPath}, attempting rm:`, trashErr)
      try {
        const size = await getDirectorySizeBytes(targetPath)
        await fs.promises.rm(targetPath, { recursive: true, force: true })
        cleanedBytes += size
        successfullyCleaned.push(targetPath)
      } catch (rmErr) {
        console.error(`[AppsService] Failed to remove leftover directory: ${targetPath}`, rmErr)
        failed.push({
          path: targetPath,
          reason: rmErr instanceof Error ? rmErr.message : String(rmErr),
        })
      }
    }
  }

  clearAppsCache()
  return {
    success: failed.length === 0,
    cleanedBytes,
    paths: successfullyCleaned,
    failed,
  }
}

/**
 * Extracts a registry uninstall command without invoking a shell.
 */
export function parseUninstallCommand(uninstallString?: string): { filePath: string; args: string[] } | null {
  const command = uninstallString
    ?.trim()
    .replace(/%([^%]+)%/g, (match, name: string) => process.env[name] || match)
  if (!command || /[&|;`<>$]/.test(command)) return null

  // Support MSI installers
  const guidMatch = command.match(/\{[0-9a-fA-F-]{36}\}/)
  if (/\bmsiexec(?:\.exe)?\b/i.test(command)) {
    return guidMatch ? { filePath: 'msiexec.exe', args: ['/x', guidMatch[0]] } : null
  }

  // Support winget packages
  if (/^winget(?:\.exe)?\b/i.test(command)) {
    const rawArgs = command.replace(/^winget(?:\.exe)?\s*/i, '').trim()
    const tokens = rawArgs.match(/(?:"[^"]*"|[^\s"])+/g) || []
    const args = tokens.map((arg) => (arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg))
    return { filePath: 'winget.exe', args }
  }

  const match = command.match(/^(?:"([^"]+)"|(.+?\.exe))(?:\s+(.*))?$/i)
  if (!match) return null

  let filePath = match[1] || match[2]
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  if (!path.win32.isAbsolute(filePath)) {
    const sys32Path = path.win32.join(systemRoot, 'System32', filePath)
    if (fs.existsSync(sys32Path)) {
      filePath = sys32Path
    } else if (fs.existsSync(`${sys32Path}.exe`)) {
      filePath = `${sys32Path}.exe`
    }
  }
  if (!path.win32.isAbsolute(filePath) || !fs.existsSync(filePath)) return null
  const rawArgs = match[3] || ''
  const tokens = rawArgs.match(/(?:"[^"]*"|[^\s"])+/g) || []
  const args = tokens.map((arg) => (arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg))
  return { filePath, args }
}
