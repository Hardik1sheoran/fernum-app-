import { ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import type { CleanLeftoversResult, InstalledApp, ScanLeftoversResult } from '../../shared/types'
import { isProtectedSystemPath } from '../../shared/pathSecurity'
import {
  queryInstalledApps,
  getDirectorySizeBytes,
  scanLeftoverCandidates,
  cleanLeftoverDirectories,
  parseUninstallCommand,
  clearAppsCache,
} from '../services/appsService'

export {
  queryInstalledApps,
  getDirectorySizeBytes,
  scanLeftoverCandidates,
  cleanLeftoverDirectories,
  parseUninstallCommand,
}

let cachedApps: InstalledApp[] = []

/**
 * Launches a registry-backed uninstaller using Windows ShellExecute semantics.
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
    const apps = await queryInstalledApps(forceRefresh)
    cachedApps = apps
    return apps
  })

  ipcMain.handle(
    'apps:uninstall',
    async (_event, appId: string): Promise<{ success: boolean; message?: string }> => {
      let installedApp = cachedApps.find((app) => app.id === appId || app.name === appId)
      if (!installedApp) {
        const freshApps = await queryInstalledApps()
        cachedApps = freshApps
        installedApp = freshApps.find((app) => app.id === appId || app.name === appId)
      }
      if (!installedApp) {
        return { success: false, message: 'Application was not found in the current registry snapshot.' }
      }
      clearAppsCache()
      cachedApps = []
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
      return cleanLeftoverDirectories(paths, (p) => shell.trashItem(p))
    }
  )
}
