import { ipcMain, BrowserWindow } from 'electron'
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ScanOptions, ScanProgress, FileNode } from '../../shared/types'
import { loadScanCache, saveScanCache, clearScanCache } from '../services/scanCache'
import { startScanWatcher, stopScanWatcher } from '../services/scanWatcher'

let activeWorker: Worker | null = null
let currentProgress: ScanProgress = {
  status: 'idle',
  currentPath: '',
  scannedFiles: 0,
  scannedBytes: 0,
  percentage: 0,
}

function resolveWorkerPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const candidate1 = path.join(currentDir, 'workers', 'scanner.worker.js')
  if (fs.existsSync(candidate1)) {
    return candidate1
  }

  const candidate2 = path.resolve(process.cwd(), 'dist-electron', 'workers', 'scanner.worker.js')
  if (fs.existsSync(candidate2)) {
    return candidate2
  }

  return candidate1
}

export function registerScanIpc(getWindow: () => BrowserWindow | null): void {
  // Query persistent cache
  ipcMain.handle('scan:get-cache', async (_event, targetPath: string): Promise<FileNode | null> => {
    if (!targetPath) return null
    return loadScanCache(targetPath)
  })

  // Clear cache if requested
  ipcMain.handle('scan:clear-cache', async (_event, targetPath?: string): Promise<boolean> => {
    await clearScanCache(targetPath)
    return true
  })

  ipcMain.handle('scan:start', async (_event, options: ScanOptions): Promise<boolean> => {
    // Terminate any previous worker
    if (activeWorker) {
      try {
        activeWorker.terminate()
      } catch {
        // Ignored
      }
      activeWorker = null
    }

    const win = getWindow()
    const targetPath = options.targetPath

    // 1. FAST WARM PATH: Check persistent scan cache first
    let cachedRoot: FileNode | null = null
    if (!options.forceRescan) {
      cachedRoot = await loadScanCache(targetPath)
      if (cachedRoot) {
        // Instantly notify renderer in < 20ms with full interactive treemap!
        notifyScanProgress(win, {
          status: 'completed',
          currentPath: targetPath,
          scannedFiles: cachedRoot.children?.length || 0,
          scannedBytes: cachedRoot.size,
          percentage: 100,
        })
        notifyScanComplete(win, cachedRoot)

        // Attach real-time file system watcher to track any additions/deletions
        startScanWatcher(targetPath, cachedRoot, (updatedRoot) => {
          const currentWin = getWindow()
          notifyScanComplete(currentWin, updatedRoot)
        })

        // Run fast incremental verification in background to pick up any changes
        // that occurred while the app was closed
        runWorkerScan({ ...options, cachedRoot }, getWindow, true)
        return true
      }
    }

    // 2. COLD SCAN PATH: No cache available, perform full scan
    currentProgress = {
      status: 'scanning',
      currentPath: targetPath,
      scannedFiles: 0,
      scannedBytes: 0,
      percentage: 0,
    }
    notifyScanProgress(win, currentProgress)

    return runWorkerScan(options, getWindow, false)
  })

  ipcMain.handle('scan:cancel', async (): Promise<boolean> => {
    stopScanWatcher()

    if (activeWorker) {
      activeWorker.postMessage({ command: 'cancel' })
      setTimeout(() => {
        if (activeWorker) {
          try {
            activeWorker.terminate()
          } catch {
            // Ignored
          }
          activeWorker = null
        }
      }, 300)
    }

    currentProgress = {
      ...currentProgress,
      status: 'cancelled',
    }

    const win = getWindow()
    notifyScanProgress(win, currentProgress)
    return true
  })
}

function runWorkerScan(
  options: ScanOptions,
  getWindow: () => BrowserWindow | null,
  isIncremental = false
): boolean {
  const workerPath = resolveWorkerPath()

  try {
    const worker = new Worker(workerPath)
    activeWorker = worker

    worker.on('message', async (msg: { type: string; data?: unknown; error?: string }) => {
      const currentWin = getWindow()
      if (msg.type === 'progress') {
        currentProgress = msg.data as ScanProgress
        if (!isIncremental) {
          notifyScanProgress(currentWin, currentProgress)
        }
      } else if (msg.type === 'partial') {
        const partialNode = msg.data as FileNode
        notifyScanPartial(currentWin, partialNode)
      } else if (msg.type === 'complete') {
        const rootNode = msg.data as FileNode

        // Save fresh scan to persistent cache
        await saveScanCache(options.targetPath, rootNode)

        // Attach / update real-time file watcher
        startScanWatcher(options.targetPath, rootNode, (updatedRoot) => {
          const win = getWindow()
          notifyScanComplete(win, updatedRoot)
        })

        notifyScanComplete(currentWin, rootNode)
        if (activeWorker === worker) {
          worker.terminate()
          activeWorker = null
        }
      } else if (msg.type === 'error') {
        if (!isIncremental) {
          notifyScanError(currentWin, msg.error || 'Scan error occurred')
        }
        if (activeWorker === worker) {
          worker.terminate()
          activeWorker = null
        }
      }
    })

    worker.on('error', (err) => {
      const currentWin = getWindow()
      if (!isIncremental) {
        notifyScanError(currentWin, err.message)
      }
      if (activeWorker === worker) {
        activeWorker = null
      }
    })

    worker.on('exit', () => {
      if (activeWorker === worker) {
        activeWorker = null
      }
    })

    // Send start command with cached root if incremental
    worker.postMessage({ command: 'start', options })
    return true
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (!isIncremental) {
      const win = getWindow()
      notifyScanError(win, `Failed to spawn scanner worker: ${errorMsg}`)
    }
    return false
  }
}

export function cleanupScanIpc(): void {
  stopScanWatcher()
  if (activeWorker) {
    try {
      activeWorker.terminate()
    } catch {
      // Ignored
    }
    activeWorker = null
  }
}

export function notifyScanProgress(win: BrowserWindow | null, progress: ScanProgress): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scan:progress', progress)
  }
}

export function notifyScanComplete(win: BrowserWindow | null, rootNode: FileNode): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scan:complete', rootNode)
  }
}

export function notifyScanPartial(win: BrowserWindow | null, partialNode: FileNode): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scan:partial', partialNode)
  }
}

export function notifyScanError(win: BrowserWindow | null, error: string): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scan:error', error)
  }
}
