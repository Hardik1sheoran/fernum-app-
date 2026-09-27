import { ipcMain, BrowserWindow } from 'electron'
import si from 'systeminformation'
import os from 'node:os'
import type { SystemStats, ProcessStats, SystemSpecs } from '../../shared/types'
import { sortProcesses } from '../../shared/monitorUtils'
import {
  getRealSystemSpecs,
  calculateCpuUsage,
  startTelemetrySampling,
  stopTelemetrySampling,
  getLiveDiskRead,
  getLiveDiskWrite,
  getLiveNetRx,
  getLiveNetTx,
} from '../services/monitorService'

let statsInterval: NodeJS.Timeout | null = null
let processInterval: NodeJS.Timeout | null = null
let cachedCpuInfo: { model: string; cores: number; speedGhz: number } | null = null
let isCollectingFast = false
let isCollectingProcesses = false
let activeSubscribers = 0
let lastKnownProcesses: ProcessStats[] = []

export function startDiskIoSampling(): void {
  startTelemetrySampling()
}

export function stopDiskIoSampling(): void {
  stopTelemetrySampling()
}

export function getActiveSubscribers(): number {
  return activeSubscribers
}


/**
 * Initializes static CPU hardware information once.
 */
export async function initCpuInfo() {
  if (cachedCpuInfo) return cachedCpuInfo
  const cpus = os.cpus()
  if (cpus && cpus.length > 0 && cpus[0].model) {
    cachedCpuInfo = {
      model: cpus[0].model.trim(),
      cores: cpus.length,
      speedGhz: Number(((cpus[0].speed || 2400) / 1000).toFixed(2)),
    }
    return cachedCpuInfo
  }
  try {
    const cpu = await si.cpu()
    cachedCpuInfo = {
      model: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.cores || os.cpus().length,
      speedGhz: cpu.speed || 0,
    }
  } catch {
    cachedCpuInfo = {
      model: 'Generic x64 Processor',
      cores: 8,
      speedGhz: 2.4,
    }
  }
  return cachedCpuInfo
}


let lastKnownNetRx = 0
let lastKnownNetTx = 0

/**
 * Collects lightweight, fast hardware metrics (CPU, Memory, Disk, Network)
 * without enumerating running processes. Executes in milliseconds.
 */
export async function collectFastMetrics(): Promise<Omit<SystemStats, 'topProcesses'>> {
  const cpuInfo = cachedCpuInfo || (await initCpuInfo())

  const cpuPercent = calculateCpuUsage()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = Math.max(0, totalMem - freeMem)
  const memPercent = Math.round((usedMem / totalMem) * 100)

  let diskReadSpeed = getLiveDiskRead()
  let diskWriteSpeed = getLiveDiskWrite()
  let netRxSpeed = getLiveNetRx()
  let netTxSpeed = getLiveNetTx()

  if (netRxSpeed > 0) lastKnownNetRx = netRxSpeed
  else netRxSpeed = lastKnownNetRx

  if (netTxSpeed > 0) lastKnownNetTx = netTxSpeed
  else netTxSpeed = lastKnownNetTx

  return {
    timestamp: Date.now(),
    cpu: {
      usagePercent: cpuPercent,
      model: cpuInfo.model,
      cores: cpuInfo.cores,
      speedGhz: cpuInfo.speedGhz,
    },
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usagePercent: memPercent,
    },
    disk: {
      readSpeedBytesPerSec: diskReadSpeed,
      writeSpeedBytesPerSec: diskWriteSpeed,
    },
    network: {
      rxSpeedBytesPerSec: netRxSpeed,
      txSpeedBytesPerSec: netTxSpeed,
    },
  }
}

/**
 * Collects top resource-consuming processes independently.
 * This is an expensive call, run on a slower cadence (3-4s).
 */
export async function collectTopProcesses(): Promise<ProcessStats[]> {
  try {
    const procRes = await si.processes()
    if (procRes && Array.isArray(procRes.list)) {
      const mapped: ProcessStats[] = procRes.list.map((p) => ({
        pid: p.pid,
        name: p.name,
        cpuPercent: Math.round(p.cpu * 10) / 10,
        memoryBytes: (p.memRss || 0) * 1024,
      }))
      lastKnownProcesses = sortProcesses(mapped, 'memory', 5)
    }
  } catch (err) {
    console.error('[MonitorIPC] Error collecting processes:', err)
  }
  return lastKnownProcesses
}

/**
 * Collects combined real-time hardware telemetry (fast metrics + cached/fresh top processes).
 */
export async function collectRealtimeStats(): Promise<SystemStats> {
  const fastMetrics = await collectFastMetrics()
  if (lastKnownProcesses.length === 0) {
    // Non-blocking trigger in background so initial tab open renders in < 1ms
    void collectTopProcesses()
  }
  return {
    ...fastMetrics,
    topProcesses: lastKnownProcesses,
  }
}

/**
 * Starts periodic metrics collection only when at least one subscriber is active.
 */
export function startCollecting(getWindow: () => BrowserWindow | null): void {
  activeSubscribers++
  startDiskIoSampling()

  // If intervals are already running, nothing more to do
  if (statsInterval && processInterval) {
    return
  }

  const pushFastMetrics = async () => {
    const win = getWindow()
    if (!win || win.isDestroyed()) {
      stopMonitorIpc()
      return
    }
    if (isCollectingFast) return
    isCollectingFast = true
    try {
      const fastMetrics = await collectFastMetrics()
      if (win && !win.isDestroyed()) {
        const fullStats: SystemStats = {
          ...fastMetrics,
          topProcesses: lastKnownProcesses,
        }
        win.webContents.send('monitor:stats-tick', fullStats)
      }
    } catch (err) {
      console.error('[MonitorIPC] Fast tick push error:', err)
    } finally {
      isCollectingFast = false
    }
  }

  const pushProcesses = async () => {
    const win = getWindow()
    if (!win || win.isDestroyed()) {
      stopMonitorIpc()
      return
    }
    if (isCollectingProcesses) return
    isCollectingProcesses = true
    try {
      const procs = await collectTopProcesses()
      if (win && !win.isDestroyed()) {
        win.webContents.send('monitor:processes-tick', procs)
      }
    } catch (err) {
      console.error('[MonitorIPC] Process tick push error:', err)
    } finally {
      isCollectingProcesses = false
    }
  }

  // Initial immediate pushes so UI populates immediately
  pushFastMetrics()
  pushProcesses()

  // 1-second fast metrics interval
  if (!statsInterval) {
    statsInterval = setInterval(pushFastMetrics, 1000)
  }

  // 3.5-second slower process list interval
  if (!processInterval) {
    processInterval = setInterval(pushProcesses, 3500)
  }
}

/**
 * Stops periodic metrics collection when all subscribers unmount.
 */
export function stopCollecting(): void {
  activeSubscribers = Math.max(0, activeSubscribers - 1)
  if (activeSubscribers === 0) {
    stopMonitorIpc()
  }
}

/**
 * Registers Monitor IPC handlers.
 * Collection intervals will only run when active consumers request it.
 */
export function registerMonitorIpc(getWindow: () => BrowserWindow | null): void {
  // Pre-fetch static hardware specs
  initCpuInfo()

  ipcMain.handle('monitor:get-stats', async (): Promise<SystemStats> => {
    return collectRealtimeStats()
  })

  ipcMain.handle('monitor:get-system-specs', async (): Promise<SystemSpecs> => {
    return getRealSystemSpecs()
  })

  ipcMain.handle('monitor:start-collecting', async (): Promise<boolean> => {
    startCollecting(getWindow)
    return true
  })

  ipcMain.handle('monitor:stop-collecting', async (): Promise<boolean> => {
    stopCollecting()
    return true
  })
}

/**
 * Stops the streaming monitor interval and clears timers.
 */
export function stopMonitorIpc(): void {
  stopDiskIoSampling()
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
  if (processInterval) {
    clearInterval(processInterval)
    processInterval = null
  }
  activeSubscribers = 0
}
