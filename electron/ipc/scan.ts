import { ipcMain, BrowserWindow } from 'electron'
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ScanOptions, ScanProgress, FileNode } from '../../shared/types'
import { loadScanCache, saveScanCache, clearScanCache } from '../services/scanCache'
import { startScanWatcher, stopScanWatcher } from '../services/scanWatcher'

import { runScanDirectly, cancelDirectScan } from '../workers/scanner.worker'

let activeWorker: Worker | null = null
let currentProgress: ScanProgress = {
  status: 'idle',
  currentPath: '',
  scannedFiles: 0,
  scannedBytes: 0,
  percentage: 0,
}

function resolveWorkerPath(): string | null {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))

  // 1. If running inside app.asar, check app.asar.unpacked first
  if (currentDir.includes('app.asar')) {
    const unpacked = currentDir.replace('app.asar', 'app.asar.unpacked')
    const unpackedPath = path.join(unpacked, 'workers', 'scanner.worker.js')
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath
    }
  }

  // 2. Check process.resourcesPath for packaged app
  if (process.resourcesPath) {
    const resourcesUnpacked = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'dist-electron',
      'workers',
      'scanner.worker.js'
    )
    if (fs.existsSync(resourcesUnpacked)) {
      return resourcesUnpacked
    }
  }

  // 3. Development / unpackaged paths (cannot run directly from inside app.asar via Node Worker)
  const candidate1 = path.join(currentDir, 'workers', 'scanner.worker.js')
  if (fs.existsSync(candidate1) && !candidate1.includes('app.asar')) {
    return candidate1
  }

  const candidate2 = path.resolve(process.cwd(), 'dist-electron', 'workers', 'scanner.worker.js')
  if (fs.existsSync(candidate2) && !candidate2.includes('app.asar')) {
    return candidate2
  }

  return null
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
    // Terminate any previous worker or cancel direct scan
    cancelDirectScan()
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
    cancelDirectScan()

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

async function runDirectScan(
  options: ScanOptions,
  getWindow: () => BrowserWindow | null,
  isIncremental = false
): Promise<boolean> {
  try {
    const win = getWindow()
    const rootNode = await runScanDirectly(options, {
      onProgress: (progress) => {
        currentProgress = progress
        if (!isIncremental) {
          notifyScanProgress(getWindow(), progress)
        }
      },
      onPartial: (partialNode) => {
        notifyScanPartial(getWindow(), partialNode)
      },
    })

    // Save fresh scan to persistent cache
    await saveScanCache(options.targetPath, rootNode)

    // Attach / update real-time file watcher
    startScanWatcher(options.targetPath, rootNode, (updatedRoot) => {
      const currentWin = getWindow()
      notifyScanComplete(currentWin, updatedRoot)
    })

    notifyScanComplete(win, rootNode)
    return true
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (!isIncremental && !errorMsg.includes('cancelled')) {
      const win = getWindow()
      notifyScanError(win, errorMsg)
    }
    return false
  }
}

function runWorkerScan(
  options: ScanOptions,
  getWindow: () => BrowserWindow | null,
  isIncremental = false
): boolean {
  const workerPath = resolveWorkerPath()

  if (!workerPath) {
    // Fall back to direct in-process scan engine immediately
    runDirectScan(options, getWindow, isIncremental)
    return true
  }

  try {
    const worker = new Worker(workerPath)
    activeWorker = worker
    let hasReceivedMessage = false

    worker.on('message', async (msg: { type: string; data?: unknown; error?: string }) => {
      hasReceivedMessage = true
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
      if (activeWorker === worker) {
        activeWorker = null
      }
      // If worker failed immediately before sending any message, fallback to direct scan
      if (!hasReceivedMessage) {
        runDirectScan(options, getWindow, isIncremental)
        return
      }
      const currentWin = getWindow()
      if (!isIncremental) {
        notifyScanError(currentWin, err.message)
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
  } catch {
    // Worker failed to instantiate (e.g. sandbox restriction or module path issue)
    // Fall back to direct in-process scan engine immediately
    runDirectScan(options, getWindow, isIncremental)
    return true
  }
}

export function cleanupScanIpc(): void {
  stopScanWatcher()
  cancelDirectScan()
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
