import { ipcMain, shell } from 'electron'
import { exec, spawn } from 'node:child_process'
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

/**
 * Queries Windows registry for installed applications across 32-bit, 64-bit, and user scopes.
 */
export async function queryInstalledApps(forceRefresh = false): Promise<InstalledApp[]> {
  if (!forceRefresh && cachedApps.length > 0) {
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
    const apps = parseRegistryApps(jsonStr)
    cachedApps = apps
    return apps
  } catch (err) {
    console.error('[AppsIPC] Failed to query installed applications:', err)
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
  pathsToClean: string[]
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
      console.warn(`[AppsIPC] Refusing to clean unsafe path: ${targetPath}`)
      failed.push({ path: targetPath, reason })
      continue
    }

    if (isProtectedSystemPath(targetPath)) {
      const reason = 'Path is protected by the system safety policy.'
      console.warn(`[AppsIPC] Refusing to clean protected path: ${targetPath}`)
      failed.push({ path: targetPath, reason })
      continue
    }

    try {
      const size = await getDirectorySizeBytes(targetPath)
      // Safely move to Recycle Bin
      await shell.trashItem(targetPath)
      cleanedBytes += size
      successfullyCleaned.push(targetPath)
    } catch (trashErr) {
      console.warn(`[AppsIPC] shell.trashItem failed for ${targetPath}, attempting rm:`, trashErr)
      try {
        const size = await getDirectorySizeBytes(targetPath)
        await fs.promises.rm(targetPath, { recursive: true, force: true })
        cleanedBytes += size
        successfullyCleaned.push(targetPath)
      } catch (rmErr) {
        console.error(`[AppsIPC] Failed to remove leftover directory: ${targetPath}`, rmErr)
        failed.push({
          path: targetPath,
          reason: rmErr instanceof Error ? rmErr.message : String(rmErr),
        })
      }
    }
  }

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

/**
 * Launches a registry-backed uninstaller using Windows ShellExecute semantics.
 * Handles UAC elevation, detached execution, and unquoted/quoted paths with spaces.
 */
export async function launchNativeUninstaller(
  app: InstalledApp
): Promise<{ success: boolean; message?: string }> {
  if (!app.uninstallString) {
    if (app.installLocation && fs.existsSync(app.installLocation) && !isProtectedSystemPath(app.installLocation)) {
      try {
        await shell.trashItem(app.installLocation)
        return {
          success: true,
          message: `Moved "${app.name}" installation folder to Recycle Bin.`,
        }
      } catch (err: unknown) {
        return {
          success: false,
          message: `No uninstaller registered and could not delete installation folder: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }
    return {
      success: false,
      message: `No uninstaller is registered for "${app.name}". You can clean its residual leftover files below.`,
    }
  }

  const command = parseUninstallCommand(app.uninstallString)
  if (!command) {
    if (app.installLocation && fs.existsSync(app.installLocation) && !isProtectedSystemPath(app.installLocation)) {
      try {
        await shell.trashItem(app.installLocation)
        return {
          success: true,
          message: `Moved "${app.name}" installation folder to Recycle Bin.`,
        }
      } catch {
        // continue
      }
    }
    return {
      success: false,
      message: `The registered uninstaller command for "${app.name}" could not be parsed safely.`,
    }
  }

  return new Promise((resolve) => {
    try {
      // Use cmd.exe start to trigger Windows ShellExecuteEx.
      // This ensures standard desktop behavior:
      // 1. Desktop UAC elevation prompts appear seamlessly if required by the installer.
      // 2. The uninstaller runs detached without blocking or depending on the Electron process.
      // 3. System binaries (msiexec, winget) and complex paths with spaces execute reliably.
      const cmdArgs = ['/c', 'start', '""', command.filePath, ...command.args]
      const child = spawn('cmd.exe', cmdArgs, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })

      child.on('error', (err) => {
        resolve({
          success: false,
          message: `Failed to launch uninstaller: ${err.message}`,
        })
      })

      child.unref()
      resolve({
        success: true,
        message: `Uninstaller launched for "${app.name}". Follow the on-screen prompts to complete removal.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      resolve({ success: false, message: `Could not launch uninstaller: ${msg}` })
    }
  })
}

/**
 * Registers all application management IPC channels.
 */
export function registerAppsIpc(): void {
  ipcMain.handle('apps:list', async (_event, forceRefresh?: boolean): Promise<InstalledApp[]> => {
    return queryInstalledApps(forceRefresh)
  })

  ipcMain.handle(
    'apps:uninstall',
    async (_event, appId: string): Promise<{ success: boolean; message?: string }> => {
      let installedApp = cachedApps.find((app) => app.id === appId || app.name === appId)
      if (!installedApp) {
        const freshApps = await queryInstalledApps()
        installedApp = freshApps.find((app) => app.id === appId || app.name === appId)
      }
      if (!installedApp) {
        return { success: false, message: 'Application was not found in the current registry snapshot.' }
      }
      return launchNativeUninstaller(installedApp)
    }
  )

  ipcMain.handle(
    'apps:scan-leftovers',
    async (_event, appName: string, publisher?: string): Promise<ScanLeftoversResult> => {
      return scanLeftoverCandidates(appName, publisher)
    }
  )

  ipcMain.handle(
    'apps:clean-leftovers',
    async (
      _event,
      paths: string[]
    ): Promise<CleanLeftoversResult> => {
      return cleanLeftoverDirectories(paths)
    }
  )
}
