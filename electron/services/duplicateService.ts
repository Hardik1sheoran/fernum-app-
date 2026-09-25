import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import type {
  DuplicateFileItem,
  DuplicateGroup,
  DuplicateScanOptions,
  DuplicateScanResult,
  FileCategory,
} from '../../shared/types'
import { isProtectedSystemPath } from '../../shared/pathSecurity'
import { getCategoryFromExtension } from '../../shared/searchUtils'

const DEFAULT_IGNORE_DIRS = new Set([
  '$recycle.bin',
  'system volume information',
  'node_modules',
  '.git',
  '.cache',
  '.cargo',
  '.rustup',
  '.nuget',
  '.gradle',
  'winsxs',
  'windows',
  '__pycache__',
  'site-packages',
  '.pnpm',
  'npm-cache',
])

/**
 * Computes partial or full SHA-256 hash of a file for fast duplicate candidate discrimination.
 */
async function computeFileHash(filePath: string, sampleBytes = 16384): Promise<string> {
  const hash = crypto.createHash('sha256')
  const fd = await fs.promises.open(filePath, 'r')
  try {
    const stats = await fd.stat()
    if (stats.size <= sampleBytes) {
      // Small file: hash completely
      const buf = Buffer.alloc(stats.size)
      await fd.read(buf, 0, stats.size, 0)
      hash.update(buf)
    } else {
      // Large file: hash header (16KB) + tail (16KB) + exact size
      const headBuf = Buffer.alloc(sampleBytes)
      await fd.read(headBuf, 0, sampleBytes, 0)
      hash.update(headBuf)

      const tailBuf = Buffer.alloc(sampleBytes)
      await fd.read(tailBuf, 0, sampleBytes, Math.max(0, stats.size - sampleBytes))
      hash.update(tailBuf)

      hash.update(Buffer.from(`size:${stats.size}`))
    }
    return hash.digest('hex')
  } finally {
    await fd.close()
  }
}

/**
 * High-performance duplicate file finder.
 */
export async function findDuplicateFiles(
  options: DuplicateScanOptions = {}
): Promise<DuplicateScanResult> {
  let rootDir = options.targetPath || process.env.USERPROFILE || 'C:\\Users\\hardi'
  if (/^[a-zA-Z]:$/.test(rootDir)) {
    rootDir = `${rootDir}\\`
  }
  const minSize = options.minSizeBytes ?? 1024 * 50 // 50 KB default
  const categoryFilter = options.category && options.category !== 'all' ? options.category : null
  const limit = options.limit ?? 200

  // 1. Stage 1: Traverse and group files by exact byte size
  const sizeMap = new Map<number, Array<{ path: string; name: string; ext: string; category: FileCategory; mtimeMs: number }>>()
  let totalFilesScanned = 0

  const queue: string[] = [rootDir]
  let queueHead = 0
  const maxDirs = 12000
  let scannedDirs = 0

  while (queueHead < queue.length && scannedDirs < maxDirs) {
    const currentDir = queue[queueHead++]
    scannedDirs++

    if (isProtectedSystemPath(currentDir)) continue

    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase()
        if (lower.startsWith('.') || DEFAULT_IGNORE_DIRS.has(lower)) {
          continue
        }
        queue.push(fullPath)
      } else if (entry.isFile()) {
        totalFilesScanned++
        const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase()
        const cat = getCategoryFromExtension(ext)

        if (categoryFilter && cat !== categoryFilter) continue

        try {
          const st = await fs.promises.stat(fullPath)
          if (st.size < minSize) continue

          const existing = sizeMap.get(st.size)
          const item = {
            path: fullPath,
            name: entry.name,
            ext,
            category: cat,
            mtimeMs: st.mtimeMs,
          }
          if (existing) {
            existing.push(item)
          } else {
            sizeMap.set(st.size, [item])
          }
        } catch {
          // Inaccessible file
        }
      }
    }
  }

  // 2. Stage 2: Filter to candidates (size groups with >= 2 files)
  const candidateSizeGroups: Array<{ size: number; files: Array<{ path: string; name: string; ext: string; category: FileCategory; mtimeMs: number }> }> = []
  for (const [size, files] of sizeMap.entries()) {
    if (files.length >= 2) {
      candidateSizeGroups.push({ size, files })
    }
  }

  // Sort candidate groups so largest files are processed first
  candidateSizeGroups.sort((a, b) => b.size - a.size)

  // 3. Stage 3: Two-tier hash verification
  const duplicateGroups: DuplicateGroup[] = []
  let totalDuplicateFiles = 0
  let totalWastedBytes = 0

  for (const group of candidateSizeGroups) {
    if (duplicateGroups.length >= limit) break

    const hashMap = new Map<string, DuplicateFileItem[]>()

    for (const f of group.files) {
      try {
        const hash = await computeFileHash(f.path)
        const fileItem: DuplicateFileItem = {
          id: f.path,
          path: f.path,
          name: f.name,
          sizeBytes: group.size,
          category: f.category,
          extension: f.ext,
          lastModified: f.mtimeMs,
          hash,
        }

        const existing = hashMap.get(hash)
        if (existing) {
          existing.push(fileItem)
        } else {
          hashMap.set(hash, [fileItem])
        }
      } catch {
        // Skip locked or removed file
      }
    }

    for (const [hash, files] of hashMap.entries()) {
      if (files.length >= 2) {
        // Sort within group so oldest is first
        files.sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0))
        const wastedBytes = (files.length - 1) * group.size
        duplicateGroups.push({
          hash,
          sizeBytes: group.size,
          wastedBytes,
          files,
        })
        totalDuplicateFiles += files.length
        totalWastedBytes += wastedBytes
      }
    }
  }

  // Sort groups by total wasted space descending
  duplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes)

  return {
    groups: duplicateGroups.slice(0, limit),
    totalDuplicateFiles,
    totalWastedBytes,
    scannedFilesCount: totalFilesScanned,
  }
}
