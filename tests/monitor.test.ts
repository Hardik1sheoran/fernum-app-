import { describe, it, expect } from 'vitest'
import {
  formatSpeed,
  formatMemoryBytes,
  appendRollingHistory,
  sortProcesses,
} from '../shared/monitorUtils'
import type { ProcessStats } from '../shared/types'

describe('Phase 6: Hardware Monitor Utilities', () => {
  it('formats throughput speeds correctly across byte, KB, MB, and GB boundaries', () => {
    expect(formatSpeed(0)).toBe('0 B/s')
    expect(formatSpeed(450)).toBe('450 B/s')
    expect(formatSpeed(512 * 1024)).toBe('512 KB/s')
    expect(formatSpeed(12.5 * 1024 * 1024)).toBe('12.5 MB/s')
    expect(formatSpeed(2.4 * 1024 * 1024 * 1024)).toBe('2.4 GB/s')
  })

  it('formats memory byte values into GB and MB', () => {
    expect(formatMemoryBytes(0)).toBe('0 MB')
    expect(formatMemoryBytes(512 * 1024 * 1024)).toBe('512 MB')
    expect(formatMemoryBytes(16 * 1024 * 1024 * 1024)).toBe('16.0 GB')
    expect(formatMemoryBytes(32 * 1024 * 1024 * 1024)).toBe('32.0 GB')
  })

  it('maintains rolling history array buffer capped at maxPoints', () => {
    let history: number[] = [10, 20, 30]
    history = appendRollingHistory(history, 40, 5)
    expect(history).toEqual([10, 20, 30, 40])

    history = appendRollingHistory(history, 50, 5)
    expect(history).toEqual([10, 20, 30, 40, 50])

    // Should drop oldest (10) when appending 60
    history = appendRollingHistory(history, 60, 5)
    expect(history).toEqual([20, 30, 40, 50, 60])
  })

  it('sorts top processes by memory and CPU usage properly', () => {
    const processes: ProcessStats[] = [
      { pid: 101, name: 'code.exe', cpuPercent: 3.2, memoryBytes: 850 * 1024 * 1024 },
      { pid: 102, name: 'chrome.exe', cpuPercent: 12.5, memoryBytes: 1800 * 1024 * 1024 },
      { pid: 103, name: 'slack.exe', cpuPercent: 1.1, memoryBytes: 420 * 1024 * 1024 },
      { pid: 104, name: 'ffmpeg.exe', cpuPercent: 88.0, memoryBytes: 310 * 1024 * 1024 },
    ]

    // Sort by memory descending
    const byMem = sortProcesses(processes, 'memory', 3)
    expect(byMem).toHaveLength(3)
    expect(byMem[0].name).toBe('chrome.exe')
    expect(byMem[1].name).toBe('code.exe')
    expect(byMem[2].name).toBe('slack.exe')

    // Sort by CPU descending
    const byCpu = sortProcesses(processes, 'cpu', 2)
    expect(byCpu).toHaveLength(2)
    expect(byCpu[0].name).toBe('ffmpeg.exe') // 88% CPU
    expect(byCpu[1].name).toBe('chrome.exe') // 12.5% CPU
  })

  it('collects fast hardware metrics without blocking on si.processes()', async () => {
    const { collectFastMetrics } = await import('../electron/ipc/monitor')
    const start = performance.now()
    const fastStats = await collectFastMetrics()
    const elapsed = performance.now() - start

    expect(fastStats).toBeDefined()
    expect(fastStats.cpu).toBeDefined()
    expect(fastStats.cpu.usagePercent).toBeGreaterThanOrEqual(0)
    expect(fastStats.memory).toBeDefined()
    expect(fastStats.memory.totalBytes).toBeGreaterThan(0)
    expect(fastStats.disk).toBeDefined()
    expect(fastStats.network).toBeDefined()
    // Process list is decoupled and omitted from fast path
    expect((fastStats as any).topProcesses).toBeUndefined()
    console.log(`Fast telemetry collection completed in ${elapsed.toFixed(2)} ms`)
  }, 15000)

  it('manages monitor subscriber lifecycle and stops intervals when subscribers unmount', async () => {
    const {
      startCollecting,
      stopCollecting,
      stopMonitorIpc,
      getActiveSubscribers,
    } = await import('../electron/ipc/monitor')

    stopMonitorIpc()
    expect(getActiveSubscribers()).toBe(0)

    const mockWin = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    } as any

    // First subscriber mounts
    startCollecting(() => mockWin)
    expect(getActiveSubscribers()).toBe(1)

    // Second subscriber mounts
    startCollecting(() => mockWin)
    expect(getActiveSubscribers()).toBe(2)

    // First subscriber unmounts
    stopCollecting()
    expect(getActiveSubscribers()).toBe(1)

    // Second subscriber unmounts -> intervals stop
    stopCollecting()
    expect(getActiveSubscribers()).toBe(0)

    stopMonitorIpc()
  })
})

