import { ipcMain } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  JunkCategoryType,
  JunkScanResult,
  JunkCleanResult,
} from '../../shared/types'
import { normalizeWindowsPath } from '../../shared/pathSecurity'

const execFileAsync = promisify(execFile)

interface CategoryConfig {
  id: JunkCategoryType
  name: string
  description: string
  icon: string
  safeToClean: boolean
  getPaths: () => string[]
}

/**
 * Returns allowed root folders for each category.
 */
function getCategoryConfigs(): CategoryConfig[] {
  const localAppData = process.env.LOCALAPPDATA || ''
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData'
  const tempDir =
    process.env.TEMP ||
    (localAppData
      ? path.win32.join(localAppData, 'Temp')
      : 'C:\\Users\\Default\\AppData\\Local\\Temp')

  return [
    {
      id: 'userTemp',
      name: 'User Temporary Files',
      description: 'Temporary files, log files, and caches created by active applications.',
      icon: 'Trash2',
      safeToClean: true,
      getPaths: () => [tempDir].filter(Boolean),
    },
    {
      id: 'systemTemp',
      name: 'System Temporary Files',
      description: 'Temporary files and service work buffers created by Windows OS services.',
      icon: 'HardDrive',
      safeToClean: true,
      getPaths: () => [path.win32.join(systemRoot, 'Temp')],
    },
    {
      id: 'recycleBin',
      name: 'Windows Recycle Bin',
      description: 'Files previously deleted by the user across all connected local drives.',
      icon: 'Archive',
      safeToClean: true,
      getPaths: () => ['C:\\$Recycle.Bin'],
    },
    {
      id: 'windowsUpdate',
      name: 'Windows Update Cache',
      description: 'Downloaded updates and patch installer packages that have already been applied.',
      icon: 'Download',
      safeToClean: true,
      getPaths: () => [path.win32.join(systemRoot, 'SoftwareDistribution', 'Download')],
    },
    {
      id: 'crashDumps',
      name: 'Crash Dumps & Error Reports',
      description: 'Crash dumps, memory diagnostics, and Windows Error Reporting (WER) queue files.',
      icon: 'ShieldAlert',
      safeToClean: true,
      getPaths: () => [
        path.win32.join(localAppData, 'CrashDumps'),
        path.win32.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportArchive'),
        path.win32.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportQueue'),
      ],
    },
    {
      id: 'shaderCache',
      name: 'DirectX & Shader Caches',
      description: 'Pre-compiled GPU shader caches for DirectX, NVIDIA, and AMD that regenerate automatically.',
      icon: 'Zap',
      safeToClean: true,
      getPaths: () => [
        path.win32.join(localAppData, 'D3DSCache'),
        path.win32.join(localAppData, 'NVIDIA', 'DXCache'),
        path.win32.join(localAppData, 'AMD', 'DxCache'),
      ],
    },
    {
      id: 'thumbnailCache',
      name: 'File Explorer Thumbnails',
      description: 'Cached preview thumbnails for pictures, videos, and folders in File Explorer.',
      icon: 'Image',
      safeToClean: true,
      getPaths: () => [path.win32.join(localAppData, 'Microsoft', 'Windows', 'Explorer')],
    },
    {
      id: 'browserCache',
      name: 'Web Browser Caches',
      description: 'Cached websites, images, and script assets from Google Chrome, Edge, and Brave.',
      icon: 'Globe',
      safeToClean: true,
      getPaths: () => [
        path.win32.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
        path.win32.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
        path.win32.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache'),
      ],
    },
  ]
}

/**
 * Validates whether a file/directory is safely within an allowed junk folder.
 * Crucial security guard: Prevents deleting outside allowed junk paths.
 */
export function isAllowedJunkPath(targetPath: string): boolean {
  const normalized = normalizeWindowsPath(targetPath)
  if (!normalized) return false

  // Absolute drive roots: "c:", "d:", etc.
  if (/^[a-z]:$/i.test(normalized)) {
    return false
  }

  // Explicitly protect core Windows and program roots
  const forbiddenExact = [
    'c:\\windows',
    'c:\\windows\\system32',
    'c:\\windows\\syswow64',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\users',
    'c:\\programdata',
  ]

  if (forbiddenExact.includes(normalized)) {
    return false
  }

  // Never allow deleting within System32 or SysWOW64 under any circumstances
  if (normalized.startsWith('c:\\windows\\system32\\') || normalized.startsWith('c:\\windows\\syswow64\\')) {
    return false
  }

  // Never allow deleting inside Program Files
  if (normalized.startsWith('c:\\program files\\') || normalized.startsWith('c:\\program files (x86)\\')) {
    return false
  }

  const configs = getCategoryConfigs()
  const allowedRoots: string[] = []
  for (const cfg of configs) {
    for (const p of cfg.getPaths()) {
      const normRoot = normalizeWindowsPath(p)
      if (normRoot) allowedRoots.push(normRoot)
    }
  }

  // Target must be a child/descendant of one of the allowed roots, NEVER the root itself
  return allowedRoots.some((root) => {
    return normalized !== root && normalized.startsWith(`${root}\\`)
  })
}

/**
 * Calculates size and file count of a directory safely skipping locked/unreadable files.
 */
export async function inspectDirectoryJunk(dirPath: string): Promise<{ sizeBytes: number; fileCount: number }> {
  let sizeBytes = 0
  let fileCount = 0

  if (!fs.existsSync(dirPath)) {
    return { sizeBytes: 0, fileCount: 0 }
  }

  const stack: string[] = [dirPath]
  let inspectedDirs = 0
  const MAX_DIRS = 5000

  while (stack.length > 0 && inspectedDirs < MAX_DIRS) {
    const current = stack.pop()!
    inspectedDirs++

    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    const files: string[] = []

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const fullPath =
        process.platform === 'win32' || /^[a-zA-Z]:/.test(current) || current.includes('\\')
          ? path.win32.join(current, entry.name)
          : path.join(current, entry.name)

      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        files.push(fullPath)
      }
    }

    if (files.length > 0) {
      const BATCH_SIZE = 64
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE)
        const stats = await Promise.allSettled(batch.map((f) => fs.promises.stat(f)))
        for (const st of stats) {
          if (st.status === 'fulfilled' && st.value) {
            sizeBytes += st.value.size
            fileCount++
          }
        }
      }
    }
  }

  return { sizeBytes, fileCount }
}

/**
 * Queries Recycle Bin size safely across drives using the Windows Shell COM API.
 */
async function inspectRecycleBin(): Promise<{ sizeBytes: number; fileCount: number }> {
  try {
    const psScript = `
      $s = New-Object -ComObject Shell.Application
      $rb = $s.Namespace(10)
      $count = $rb.Items().Count
      $size = 0
      foreach ($i in $rb.Items()) { $size += $i.Size }
      "$size,$count"
    `
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      psScript,
    ], { timeout: 6000 })
    const [sumStr, countStr] = stdout.trim().split(',')
    const sizeBytes = parseInt(sumStr, 10) || 0
    const fileCount = parseInt(countStr, 10) || 0
    return { sizeBytes, fileCount }
  } catch {
    return { sizeBytes: 0, fileCount: 0 }
  }
}

let cachedJunkScan: { result: JunkScanResult; timestamp: number } | null = null

export function invalidateJunkScanCache(): void {
  cachedJunkScan = null
}

/**
 * Scans system junk categories.
 */
export async function scanSystemJunk(
  categoriesFilter?: JunkCategoryType[],
  forceRescan = false
): Promise<JunkScanResult> {
  if (!categoriesFilter && !forceRescan && cachedJunkScan && (Date.now() - cachedJunkScan.timestamp < 30000)) {
    return cachedJunkScan.result
  }

  const allConfigs = getCategoryConfigs()
  const activeConfigs = categoriesFilter && categoriesFilter.length > 0
    ? allConfigs.filter((c) => categoriesFilter.includes(c.id))
    : allConfigs

  // Run all categories concurrently
  const categories = await Promise.all(
    activeConfigs.map(async (cfg) => {
      let catSize = 0
      let catFiles = 0
      const existingPaths: string[] = []

      if (cfg.id === 'recycleBin') {
        const rbInfo = await inspectRecycleBin()
        catSize = rbInfo.sizeBytes
        catFiles = rbInfo.fileCount
        existingPaths.push('C:\\$Recycle.Bin')
      } else {
        const pathResults = await Promise.all(
          cfg.getPaths().map(async (p) => {
            try {
              if (fs.existsSync(p)) {
                const res = await inspectDirectoryJunk(p)
                return { path: p, sizeBytes: res.sizeBytes, fileCount: res.fileCount }
              }
            } catch {
              // Ignore path inspect failures
            }
            return null
          })
        )

        for (const pr of pathResults) {
          if (pr) {
            existingPaths.push(pr.path)
            catSize += pr.sizeBytes
            catFiles += pr.fileCount
          }
        }
      }

      return {
        id: cfg.id,
        name: cfg.name,
        description: cfg.description,
        icon: cfg.icon,
        sizeBytes: catSize,
        fileCount: catFiles,
        safeToClean: cfg.safeToClean,
        paths: existingPaths,
      }
    })
  )

  const totalSizeBytes = categories.reduce((acc, c) => acc + c.sizeBytes, 0)
  const totalFileCount = categories.reduce((acc, c) => acc + c.fileCount, 0)

  const result: JunkScanResult = {
    totalSizeBytes,
    totalFileCount,
    categories,
  }

  if (!categoriesFilter) {
    cachedJunkScan = { result, timestamp: Date.now() }
  }

  return result
}

/**
 * Empties Windows Recycle Bin.
 */
async function clearRecycleBinNative(): Promise<{ success: boolean; bytesReclaimed: number }> {
  try {
    const before = await inspectRecycleBin()
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Clear-RecycleBin -Confirm:$false -ErrorAction SilentlyContinue',
    ], { timeout: 8000 })
    return { success: true, bytesReclaimed: before.sizeBytes }
  } catch {
    return { success: false, bytesReclaimed: 0 }
  }
}

/**
 * Cleans the contents of an allowed directory safely.
 * Never deletes the directory itself; only deletes its contents.
 */
async function cleanDirectoryContents(dirPath: string): Promise<{
  cleanedBytes: number
  deletedCount: number
  skippedCount: number
  failed: Array<{ path: string; reason: string }>
}> {
  let cleanedBytes = 0
  let deletedCount = 0
  let skippedCount = 0
  const failed: Array<{ path: string; reason: string }> = []

  if (!fs.existsSync(dirPath)) {
    return { cleanedBytes: 0, deletedCount: 0, skippedCount: 0, failed: [] }
  }

  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  } catch (err: unknown) {
    return {
      cleanedBytes: 0,
      deletedCount: 0,
      skippedCount: 1,
      failed: [{ path: dirPath, reason: err instanceof Error ? err.message : String(err) }],
    }
  }

  for (const entry of entries) {
    const itemPath =
      process.platform === 'win32' || /^[a-zA-Z]:/.test(dirPath) || dirPath.includes('\\')
        ? path.win32.join(dirPath, entry.name)
        : path.join(dirPath, entry.name)

    // Security check: Must strictly be an allowed junk path
    if (!isAllowedJunkPath(itemPath)) {
      skippedCount++
      continue
    }

    try {
      if (entry.isDirectory()) {
        // Accurately inspect files and sizes inside the folder before removing it
        const subInfo = await inspectDirectoryJunk(itemPath)
        await fs.promises.rm(itemPath, { recursive: true, force: true })
        cleanedBytes += subInfo.sizeBytes
        deletedCount += Math.max(1, subInfo.fileCount)
      } else {
        const stats = await fs.promises.stat(itemPath)
        await fs.promises.unlink(itemPath)
        cleanedBytes += stats.size
        deletedCount++
      }
    } catch (err: unknown) {
      // In-use or access denied files are safely skipped without aborting
      skippedCount++
      const reason = err instanceof Error ? err.message : String(err)
      if (!reason.includes('EBUSY') && !reason.includes('EPERM')) {
        failed.push({ path: itemPath, reason })
      }
    }
  }

  return { cleanedBytes, deletedCount, skippedCount, failed }
}

/**
 * Cleans selected junk categories.
 */
export async function cleanSystemJunk(
  categoryIds: JunkCategoryType[]
): Promise<JunkCleanResult> {
  const configs = getCategoryConfigs().filter((c) => categoryIds.includes(c.id))

  let reclaimedBytes = 0
  let deletedFileCount = 0
  let skippedCount = 0
  const failed: Array<{ path: string; reason: string }> = []

  for (const cfg of configs) {
    if (cfg.id === 'recycleBin') {
      const rbRes = await clearRecycleBinNative()
      if (rbRes.success) {
        reclaimedBytes += rbRes.bytesReclaimed
        deletedFileCount += 1
      }
      continue
    }

    for (const targetPath of cfg.getPaths()) {
      if (!fs.existsSync(targetPath)) continue

      const res = await cleanDirectoryContents(targetPath)
      reclaimedBytes += res.cleanedBytes
      deletedFileCount += res.deletedCount
      skippedCount += res.skippedCount
      failed.push(...res.failed)
    }
  }

  invalidateJunkScanCache()

  return {
    success: failed.length === 0,
    reclaimedBytes,
    deletedFileCount,
    skippedCount,
    failed,
  }
}

/**
 * Registers Cleaner IPC handlers.
 */
export function registerCleanerIpc(): void {
  ipcMain.handle('cleaner:scan', async (_event, categories?: JunkCategoryType[], forceRescan?: boolean) => {
    return scanSystemJunk(categories, forceRescan)
  })

  ipcMain.handle('cleaner:clean', async (_event, categoryIds: JunkCategoryType[]) => {
    return cleanSystemJunk(categoryIds)
  })
}
