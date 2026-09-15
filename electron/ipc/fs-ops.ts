import { ipcMain, shell, dialog } from 'electron'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import type { DriveInfo, FsOperationResult, QuickFolderInfo } from '../../shared/types'
import { isProtectedSystemPath } from '../../shared/pathSecurity'

const execAsync = promisify(exec)

export function registerFsOpsIpc(): void {
  ipcMain.handle('fs:select-folder', async (): Promise<string | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Folder to Scan',
      properties: ['openDirectory'],
    })
    if (canceled || !filePaths || filePaths.length === 0) return null
    return filePaths[0]
  })

  ipcMain.handle('fs:get-drives', async (): Promise<DriveInfo[]> => {
    // 1. ULTRA-FAST NATIVE PATH: Query available drives via fs.statfsSync (< 1ms vs ~2500ms PowerShell)
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
        return detectedDrives
      }
    } catch {
      // Fallback to PowerShell below if statfs is unavailable
    }

    try {
      // Fallback: On Windows, query logical drives with PowerShell safely
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

        return disks
          .filter((disk) => disk && disk.DeviceID && disk.Size)
          .map((disk) => {
            const total = Number(disk.Size) || 0
            const free = Number(disk.FreeSpace) || 0
            const used = Math.max(0, total - free)
            const id = String(disk.DeviceID)
            const isSystem = id.toUpperCase().startsWith('C')

            return {
              id,
              name: disk.VolumeName || (isSystem ? 'Local Disk (System)' : 'Local Disk'),
              path: `${id}\\`,
              totalBytes: total,
              freeBytes: free,
              usedBytes: used,
              filesystem: disk.FileSystem || 'NTFS',
              isSystem,
            }
          })
      }
    } catch (err) {
      console.warn('[FsOps] Failed to query logical drives with PowerShell:', err)
    }

    throw new Error('Could not read logical drive information from Windows.')
  })

  ipcMain.handle('fs:get-quick-folders', async (): Promise<QuickFolderInfo[]> => {
    const userProfile = process.env.USERPROFILE || 'C:\\Users\\hardi'
    const folders: QuickFolderInfo[] = [
      {
        id: 'user-profile',
        name: `User Profile (${path.basename(userProfile)})`,
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

    return folders.filter((f) => f.exists)
  })

  ipcMain.handle('fs:reveal', async (_event, targetPath: string): Promise<FsOperationResult> => {
    if (!targetPath || !targetPath.trim()) {
      return { success: false, path: '', error: 'No target path provided.' }
    }

    try {
      const trimmed = targetPath.trim()
      // Drive roots have no parent folder to show item in
      if (/^[a-zA-Z]:[\\/]*$/.test(trimmed)) {
        await shell.openPath(trimmed)
      } else {
        shell.showItemInFolder(trimmed)
      }
      return { success: true, path: trimmed }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, path: targetPath, error: message }
    }
  })

  ipcMain.handle('fs:trash', async (_event, targetPath: string): Promise<FsOperationResult> => {
    try {
      if (isProtectedSystemPath(targetPath)) {
        return {
          success: false,
          path: targetPath,
          error: 'Cannot delete protected system paths or drive roots.',
        }
      }
      await shell.trashItem(targetPath)
      return { success: true, path: targetPath }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, path: targetPath, error: message }
    }
  })

  ipcMain.handle('fs:delete', async (_event, targetPath: string): Promise<FsOperationResult> => {
    try {
      if (isProtectedSystemPath(targetPath)) {
        return {
          success: false,
          path: targetPath,
          error: 'Cannot permanently delete protected system paths or drive roots.',
        }
      }
      const fs = await import('node:fs/promises')
      await fs.rm(targetPath, { recursive: true, force: true })
      return { success: true, path: targetPath }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, path: targetPath, error: message }
    }
  })
}
