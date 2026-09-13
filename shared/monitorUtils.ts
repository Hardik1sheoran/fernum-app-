import type { ProcessStats } from './types'

/**
 * Formats a byte rate (bytes/sec) into human-readable network/disk throughput.
 */
export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
  const gb = bytesPerSec / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB/s`
  const mb = bytesPerSec / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`
  const kb = bytesPerSec / 1024
  if (kb >= 1) return `${kb.toFixed(0)} KB/s`
  return `${Math.round(bytesPerSec)} B/s`
}

/**
 * Formats memory byte counts into GB or MB.
 */
export function formatMemoryBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(0)} MB`
}

/**
 * Appends a value to a rolling history array while capping length at maxPoints.
 */
export function appendRollingHistory(
  history: number[],
  newValue: number,
  maxPoints: number = 30
): number[] {
  const next = [...history, Math.max(0, Math.round(newValue))]
  if (next.length > maxPoints) {
    return next.slice(next.length - maxPoints)
  }
  return next
}

/**
 * Sorts processes by CPU or memory usage descending.
 */
export function sortProcesses(
  processes: ProcessStats[],
  sortBy: 'cpu' | 'memory' = 'memory',
  limit: number = 5
): ProcessStats[] {
  return [...processes]
    .sort((a, b) => {
      if (sortBy === 'cpu') {
        return b.cpuPercent - a.cpuPercent
      }
      return b.memoryBytes - a.memoryBytes
    })
    .slice(0, limit)
}
