import { ipcMain, BrowserWindow } from 'electron'
import si from 'systeminformation'
import os from 'node:os'
import type { SystemStats, ProcessStats } from '../../shared/types'
import { sortProcesses } from '../../shared/monitorUtils'

let statsInterval: NodeJS.Timeout | null = null
let processInterval: NodeJS.Timeout | null = null
let cachedCpuInfo: { model: string; cores: number; speedGhz: number } | null = null
let isCollectingFast = false
let isCollectingProcesses = false
let activeSubscribers = 0
let lastKnownProcesses: ProcessStats[] = []

export function getActiveSubscribers(): number {
  return activeSubscribers
}

/**
 * Initializes static CPU hardware information once.
 */
export async function initCpuInfo() {
  if (cachedCpuInfo) return cachedCpuInfo
  try {
    const cpu = await si.cpu()
    cachedCpuInfo = {
      model: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.cores || os.cpus().length,
      speedGhz: cpu.speed || 0,
    }
  } catch {
    const cpus = os.cpus()
    cachedCpuInfo = {
      model: cpus[0]?.model || 'Generic x64 Processor',
      cores: cpus.length,
      speedGhz: (cpus[0]?.speed || 2400) / 1000,
    }
  }
  return cachedCpuInfo
}

/**
 * Collects lightweight, fast hardware metrics (CPU, Memory, Disk, Network)
 * without enumerating running processes. Executes in milliseconds.
 */
export async function collectFastMetrics(): Promise<Omit<SystemStats, 'topProcesses'>> {
  const cpuInfo = cachedCpuInfo || (await initCpuInfo())

  try {
    const [loadRes, memRes, diskRes, netRes] = await Promise.allSettled([
      si.currentLoad(),
      si.mem(),
      si.disksIO(),
      si.networkStats(),
    ])

    // 1. CPU Usage
    let cpuPercent = 0
    if (loadRes.status === 'fulfilled') {
      cpuPercent = Math.max(0, Math.min(100, Math.round(loadRes.value.currentLoad)))
    } else {
      const cpus = os.cpus()
      let idle = 0
      let total = 0
      for (const c of cpus) {
        for (const t in c.times) {
          total += c.times[t as keyof typeof c.times]
        }
        idle += c.times.idle
      }
      cpuPercent = total > 0 ? Math.max(0, Math.min(100, Math.round(100 - (idle / total) * 100))) : 0
    }

    // 2. Memory Usage
    let totalMem = os.totalmem()
    let usedMem = totalMem - os.freemem()
    let freeMem = os.freemem()
    let memPercent = Math.round((usedMem / totalMem) * 100)

    if (memRes.status === 'fulfilled') {
      const m = memRes.value
      totalMem = m.total
      usedMem = m.active || m.used
      freeMem = m.available || m.free
      memPercent = Math.round((usedMem / totalMem) * 100)
    }

    // 3. Disk I/O Read/Write (bytes/sec)
    let diskReadSpeed = 0
    let diskWriteSpeed = 0
    if (diskRes.status === 'fulfilled' && diskRes.value) {
      diskReadSpeed = Math.max(0, Math.round(diskRes.value.rIO_sec || 0))
      diskWriteSpeed = Math.max(0, Math.round(diskRes.value.wIO_sec || 0))
    }

    // 4. Network Throughput (bytes/sec)
    let netRxSpeed = 0
    let netTxSpeed = 0
    if (netRes.status === 'fulfilled' && Array.isArray(netRes.value)) {
      for (const iface of netRes.value) {
        netRxSpeed += Math.max(0, Math.round(iface.rx_sec || 0))
        netTxSpeed += Math.max(0, Math.round(iface.tx_sec || 0))
      }
    }

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
  } catch (err) {
    console.error('[MonitorIPC] Error collecting fast telemetry:', err)
    // Absolute fallback
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    return {
      timestamp: Date.now(),
      cpu: {
        usagePercent: 20,
        model: cpuInfo.model,
        cores: cpuInfo.cores,
      },
      memory: {
        totalBytes: totalMem,
        usedBytes: totalMem - freeMem,
        freeBytes: freeMem,
        usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      disk: {
        readSpeedBytesPerSec: 0,
        writeSpeedBytesPerSec: 0,
      },
      network: {
        rxSpeedBytesPerSec: 0,
        txSpeedBytesPerSec: 0,
      },
    }
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
    await collectTopProcesses()
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
