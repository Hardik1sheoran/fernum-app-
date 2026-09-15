import React, { useEffect, useState } from 'react'
import {
  Cpu,
  Database,
  HardDrive,
  Wifi,
  Activity,
  Layers,
  ArrowDown,
  ArrowUp,
} from 'lucide-react'
import type { SystemStats } from '@shared/types'
import { formatSpeed, formatMemoryBytes, appendRollingHistory } from '@shared/monitorUtils'

export const MonitorDashboard: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [history, setHistory] = useState<{ cpu: number[]; memory: number[] }>({
    cpu: [12, 14, 18, 22, 20, 15, 19, 25, 22, 18, 16, 20, 24, 21, 19],
    memory: [46, 46, 47, 47, 48, 48, 48, 49, 49, 48, 48, 49, 49, 50, 49],
  })
  const [processSortBy, setProcessSortBy] = useState<'memory' | 'cpu'>('memory')

  useEffect(() => {
    let unsubscribeStats: (() => void) | undefined
    let unsubscribeProcesses: (() => void) | undefined

    if (window.electronAPI) {
      window.electronAPI.startMonitoring().catch(() => {})

      window.electronAPI.getSystemStats().then((initialStats) => {
        setStats(initialStats)
      })

      unsubscribeStats = window.electronAPI.subscribeSystemStats((newStats) => {
        setStats((prev) => ({
          ...newStats,
          // Preserve last-known processes if fast tick doesn't replace them
          topProcesses:
            newStats.topProcesses && newStats.topProcesses.length > 0
              ? newStats.topProcesses
              : prev?.topProcesses || [],
        }))
        setHistory((prev) => ({
          cpu: appendRollingHistory(prev.cpu, newStats.cpu.usagePercent, 30),
          memory: appendRollingHistory(prev.memory, newStats.memory.usagePercent, 30),
        }))
      })

      unsubscribeProcesses = window.electronAPI.subscribeProcesses((processes) => {
        setStats((prev) => (prev ? { ...prev, topProcesses: processes } : prev))
      })
    }

    return () => {
      if (unsubscribeStats) unsubscribeStats()
      if (unsubscribeProcesses) unsubscribeProcesses()
      if (window.electronAPI) {
        window.electronAPI.stopMonitoring().catch(() => {})
      }
    }
  }, [])

  const cpuPercent = stats?.cpu.usagePercent ?? 0
  const memPercent = stats?.memory.usagePercent ?? 0
  const totalMem = stats?.memory.totalBytes ?? 0
  const usedMem = stats?.memory.usedBytes ?? 0
  const freeMem = stats?.memory.freeBytes ?? 0

  const diskRead = stats?.disk.readSpeedBytesPerSec ?? 0
  const diskWrite = stats?.disk.writeSpeedBytesPerSec ?? 0
  const netRx = stats?.network.rxSpeedBytesPerSec ?? 0
  const netTx = stats?.network.txSpeedBytesPerSec ?? 0

  const processes = stats?.topProcesses || []
  const sortedProcesses = [...processes].sort((a, b) => {
    if (processSortBy === 'cpu') {
      return b.cpuPercent - a.cpuPercent
    }
    return b.memoryBytes - a.memoryBytes
  })

  // Helper to construct an SVG smooth area path for sparklines
  const buildSvgPath = (data: number[], width: number, height: number): { linePath: string; areaPath: string } => {
    if (data.length < 2) return { linePath: '', areaPath: '' }
    const stepX = width / (data.length - 1)
    const points = data.map((val, idx) => {
      const clamped = Math.max(0, Math.min(100, val))
      const y = height - (clamped / 100) * (height - 8) - 4
      const x = idx * stepX
      return { x, y }
    })

    const linePath = points.reduce(
      (acc, pt, idx) => (idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`),
      ''
    )
    const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`
    return { linePath, areaPath }
  }

  const cpuChart = buildSvgPath(history.cpu, 300, 90)
  const memChart = buildSvgPath(history.memory, 300, 90)

  return (
    <div className="flex flex-col h-full space-y-3 overflow-y-auto pr-0.5 max-w-6xl mx-auto pb-4">
      {/* Top Header Card */}
      <div className="bg-[#202024] border border-[#2d2d33] p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Performance
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {stats?.cpu.model ? (
              <span className="font-mono">
                {stats.cpu.model} · {stats.cpu.cores} Cores · {formatMemoryBytes(totalMem)} RAM
              </span>
            ) : (
              'Real-time system CPU, memory, disk throughput, and network performance'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#27272d] border border-[#32323a] text-xs font-mono text-zinc-300">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span>Live</span>
        </div>
      </div>

      {/* Grid of 4 Telemetry Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        {/* 1. CPU Usage */}
        <div className="bg-[#202024] border border-[#2d2d33] p-3.5 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-blue-400" />
              <div>
                <span className="text-xs font-semibold text-zinc-200">CPU</span>
                <span className="text-[10px] text-zinc-400 block font-mono">
                  {stats?.cpu.cores ? `${stats.cpu.cores} Cores` : 'All Cores'}
                </span>
              </div>
            </div>
            <span
              className={`text-lg font-bold font-mono ${
                cpuPercent > 80 ? 'text-rose-400' : cpuPercent > 50 ? 'text-amber-400' : 'text-blue-400'
              }`}
            >
              {cpuPercent}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-700/40 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                cpuPercent > 80 ? 'bg-rose-500' : cpuPercent > 50 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${cpuPercent}%` }}
            />
          </div>
        </div>

        {/* 2. RAM Usage */}
        <div className="bg-[#202024] border border-[#2d2d33] p-3.5 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Database className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-xs font-semibold text-zinc-200">Memory</span>
                <span className="text-[10px] text-zinc-400 block font-mono">
                  {formatMemoryBytes(usedMem)} / {formatMemoryBytes(totalMem)} ({formatMemoryBytes(freeMem)} free)
                </span>
              </div>
            </div>
            <span className="text-lg font-bold font-mono text-indigo-400">
              {memPercent}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-700/40 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
              style={{ width: `${memPercent}%` }}
            />
          </div>
        </div>

        {/* 3. Disk I/O */}
        <div className="bg-[#202024] border border-[#2d2d33] p-3.5 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-xs font-semibold text-zinc-200">Disk I/O</span>
                <span className="text-[10px] text-zinc-400 block font-mono">Throughput</span>
              </div>
            </div>
            {(diskRead > 0 || diskWrite > 0) && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1e2e22] text-emerald-400 border border-[#2d5034]">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#2d2d33]">
            <div className="flex items-center gap-1.5 font-mono text-zinc-300">
              <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
              <span>Read: {formatSpeed(diskRead)}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-zinc-300">
              <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
              <span>Write: {formatSpeed(diskWrite)}</span>
            </div>
          </div>
        </div>

        {/* 4. Network */}
        <div className="bg-[#202024] border border-[#2d2d33] p-3.5 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Wifi className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-xs font-semibold text-zinc-200">Network</span>
                <span className="text-[10px] text-zinc-400 block font-mono">Throughput</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#2d2d33]">
            <div className="flex items-center gap-1.5 font-mono text-zinc-300">
              <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
              <span>Down: {formatSpeed(netRx)}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-zinc-300">
              <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
              <span>Up: {formatSpeed(netTx)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Realtime 30-Second Rolling Sparklines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[160px] flex-shrink-0">
        {/* CPU Sparkline Card */}
        <div className="bg-[#202024] border border-[#2d2d33] p-4 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              CPU History (30s)
            </span>
            <span className="font-mono text-xs text-blue-400 font-bold">{cpuPercent}%</span>
          </div>

          <div className="w-full h-24 relative overflow-hidden flex items-end">
            <svg viewBox="0 0 300 90" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={cpuChart.areaPath} fill="url(#cpuGrad)" />
              <path d={cpuChart.linePath} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Memory Sparkline Card */}
        <div className="bg-[#202024] border border-[#2d2d33] p-4 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              Memory History (30s)
            </span>
            <span className="font-mono text-xs text-indigo-400 font-bold">{memPercent}%</span>
          </div>

          <div className="w-full h-24 relative overflow-hidden flex items-end">
            <svg viewBox="0 0 300 90" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={memChart.areaPath} fill="url(#memGrad)" />
              <path d={memChart.linePath} fill="none" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Top Active Processes Table */}
      <div className="bg-[#202024] rounded-lg border border-[#2d2d33] overflow-hidden flex flex-col flex-1 min-h-[220px]">
        <div className="p-3 border-b border-[#2d2d33] flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Active Processes
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Processes sorted by {processSortBy === 'memory' ? 'memory usage' : 'CPU usage'}
            </p>
          </div>

          <div className="flex items-center gap-1 bg-[#28282e] border border-[#32323a] p-0.5 rounded-md text-xs">
            <button
              onClick={() => setProcessSortBy('memory')}
              className={`px-2.5 py-1 rounded transition-colors font-medium ${
                processSortBy === 'memory'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              By Memory
            </button>
            <button
              onClick={() => setProcessSortBy('cpu')}
              className={`px-2.5 py-1 rounded transition-colors font-medium ${
                processSortBy === 'cpu'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              By CPU
            </button>
          </div>
        </div>

        {sortedProcesses.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400">
            Collecting process performance data…
          </div>
        ) : (
          <div className="overflow-y-auto divide-y divide-[#27272d]">
            {sortedProcesses.map((proc) => {
              const memMb = Math.round(proc.memoryBytes / (1024 * 1024))
              return (
                <div
                  key={proc.pid}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-[#25252b] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="w-6 h-6 rounded bg-[#27272d] border border-[#32323a] flex items-center justify-center font-medium text-[10px] text-zinc-300 font-mono flex-shrink-0">
                      {proc.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs text-zinc-200 truncate">
                          {proc.name}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono bg-[#27272d] border border-[#32323a] px-1.5 py-0.2 rounded">
                          PID {proc.pid}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-right">
                      <span className="text-xs font-medium text-zinc-200 block font-mono">
                        {formatMemoryBytes(proc.memoryBytes)}
                      </span>
                      <span className="text-[10px] text-zinc-400 block font-mono">
                        {memMb} MB RSS
                      </span>
                    </div>

                    <div className="w-16 text-right">
                      <span
                        className={`text-xs font-medium font-mono ${
                          proc.cpuPercent > 50
                            ? 'text-rose-400'
                            : proc.cpuPercent > 15
                            ? 'text-amber-400'
                            : 'text-zinc-300'
                        }`}
                      >
                        {proc.cpuPercent.toFixed(1)}%
                      </span>
                      <span className="text-[9px] text-zinc-400 block uppercase font-semibold">CPU</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
