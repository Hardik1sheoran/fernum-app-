import { ipcMain } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SearchQueryOptions, SearchResultItem, SearchResultResponse } from '../../shared/types'
import { isProtectedSystemPath } from '../../shared/pathSecurity'
import { getCategoryFromExtension, searchFileNodeTree } from '../../shared/searchUtils'
import { loadScanCache } from '../services/scanCache'

/**
 * Fast asynchronous directory search that respects system boundaries and size thresholds.
 */
export async function searchDiskFiles(
  options: SearchQueryOptions
): Promise<SearchResultItem[] | SearchResultResponse> {
  const rootDir = options.targetPath || process.env.USERPROFILE || 'C:\\'
  const query = (options.query || '').trim().toLowerCase()
  const minSize = options.minSizeBytes ?? 0
  const targetCategory = options.category && options.category !== 'all' ? options.category : null
  const targetExt = options.extension?.toLowerCase().replace(/^\./, '')
  const limit = options.limit && options.limit > 0 ? options.limit : 200

  // Don't crawl entire drive if search parameters are empty
  if (query.length === 0 && minSize === 0 && !targetCategory && !targetExt) {
    return []
  }

  // 1. FAST WARM PATH: Check in-memory / persistent scan cache for exact root match (< 5ms)
  if (!options.maxDirs) {
    try {
      const cachedRoot = await loadScanCache(rootDir)
      if (cachedRoot) {
        const cachedResults = searchFileNodeTree(cachedRoot, options)
        if (cachedResults.length >= limit) {
          return cachedResults.slice(0, limit)
        }
      }
    } catch {
      // Fall back to disk crawl if cache read fails
    }
  }

  const results: SearchResultItem[] = []
  const queue: string[] = [rootDir]
  let queueHead = 0
  const visitedDirs = new Set<string>()
  let searchedDirs = 0
  const MAX_DIRS = options.maxDirs ?? 25000 // Guard against infinite crawling

  const SKIP_DIRS_DEFAULT = new Set([
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
    '__pycache__',
    'site-packages',
    '.pnpm',
    'npm-cache',
  ])

  while (queueHead < queue.length && searchedDirs < MAX_DIRS && results.length < limit * 2) {
    const currentDir = queue[queueHead++]
    const normalizedDir = currentDir.toLowerCase()

    if (visitedDirs.has(normalizedDir)) continue
    visitedDirs.add(normalizedDir)

    searchedDirs++

    // Skip protected system folders
    if (isProtectedSystemPath(currentDir)) continue

    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
    } catch {
      continue
    }

    const candidateFiles: { fullPath: string; name: string; ext: string; category: import('../../shared/types').FileCategory }[] = []

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue

      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        const lowerName = entry.name.toLowerCase()
        if (
          lowerName.startsWith('.') ||
          (SKIP_DIRS_DEFAULT.has(lowerName) && (!query || !query.includes(lowerName)))
        ) {
          continue
        }
        queue.push(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase()
        const category = getCategoryFromExtension(ext)

        if (targetCategory && category !== targetCategory) continue
        if (targetExt && ext !== targetExt) continue

        if (query.length > 0) {
          const nameLower = entry.name.toLowerCase()
          const matchesName = nameLower.includes(query)
          const matchesExt = query.startsWith('.')
            ? ext === query.slice(1)
            : ext.includes(query)
          if (!matchesName && !matchesExt) continue
        }

        candidateFiles.push({ fullPath, name: entry.name, ext, category })
      }
    }

    if (candidateFiles.length > 0) {
      const statsList = await Promise.all(
        candidateFiles.map(async (f) => {
          try {
            const stats = await fs.promises.stat(f.fullPath)
            if (stats.size < minSize) return null
            return {
              id: f.fullPath,
              name: f.name,
              path: f.fullPath,
              sizeBytes: stats.size,
              category: f.category,
              extension: f.ext,
              lastModified: stats.mtimeMs,
            }
          } catch {
            return null
          }
        })
      )

      for (const item of statsList) {
        if (item) results.push(item)
      }
    }
  }

  const stoppedBeforeExhaustingQueue = queueHead < queue.length
  const hitDirCap = searchedDirs >= MAX_DIRS && stoppedBeforeExhaustingQueue
  const hitResultCap = results.length >= limit * 2 && stoppedBeforeExhaustingQueue

  // Sort descending by size
  results.sort((a, b) => b.sizeBytes - a.sizeBytes)
  const items = results.slice(0, limit)

  if (hitDirCap || hitResultCap) {
    return {
      items,
      truncated: true,
    }
  }

  return items
}

/**
 * Registers Search IPC handler.
 */
export function registerSearchIpc(): void {
  ipcMain.handle(
    'search:files',
    async (
      _event,
      options: SearchQueryOptions
    ): Promise<SearchResultItem[] | SearchResultResponse> => {
      return searchDiskFiles(options)
    }
  )
}
