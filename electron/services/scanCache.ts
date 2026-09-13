import path from 'node:path'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import crypto from 'node:crypto'
import type { FileNode } from '../../shared/types'

export interface CachedScanPayload {
  version: number
  targetPath: string
  cachedAt: number
  totalFiles: number
  totalBytes: number
  root: FileNode
}

const CURRENT_CACHE_VERSION = 1

// Fast in-memory cache to avoid repeated disk reads within the same session
const memoryCache = new Map<string, { cachedAt: number; root: FileNode }>()

export function normalizeScanPath(targetPath: string): string {
  return path.normalize(targetPath).toLowerCase().replace(/[\\/]+$/, '')
}

export function getScanCacheDir(): string {
  const baseDir = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Fernum')
    : path.join(os.homedir(), '.fernum')

  const cacheDir = path.join(baseDir, 'scan_cache')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

export function getCacheFilePath(targetPath: string): string {
  const norm = normalizeScanPath(targetPath)
  const hash = crypto.createHash('sha256').update(norm).digest('hex').substring(0, 16)
  return path.join(getScanCacheDir(), `scan_${hash}.json`)
}

export function findNodeInTree(root: FileNode, targetNormPath: string): FileNode | null {
  const rootNorm = normalizeScanPath(root.path)
  if (rootNorm === targetNormPath) return root

  if (root.children) {
    for (const child of root.children) {
      const childNorm = normalizeScanPath(child.path)
      if (childNorm === targetNormPath) return child
      if (targetNormPath.startsWith(childNorm)) {
        const found = findNodeInTree(child, targetNormPath)
        if (found) return found
      }
    }
  }
  return null
}

export function countTreeStats(node: FileNode): { totalFiles: number; totalBytes: number } {
  let totalFiles = 0
  let totalBytes = 0

  function traverse(n: FileNode) {
    if (n.type === 'file') {
      totalFiles++
      totalBytes += n.size || 0
    } else if (n.children) {
      for (const child of n.children) {
        traverse(child)
      }
    }
  }

  traverse(node)
  return { totalFiles, totalBytes }
}

export function buildDirMtimeMap(rootNode: FileNode): Map<string, { mtimeMs: number; node: FileNode }> {
  const map = new Map<string, { mtimeMs: number; node: FileNode }>()

  function walk(curr: FileNode) {
    if (curr.type === 'directory') {
      if (curr.lastModified) {
        map.set(curr.path.toLowerCase(), { mtimeMs: curr.lastModified, node: curr })
      }
      if (curr.children) {
        for (const child of curr.children) {
          walk(child)
        }
      }
    }
  }

  walk(rootNode)
  return map
}

export async function saveScanCache(targetPath: string, rootNode: FileNode): Promise<void> {
  const norm = normalizeScanPath(targetPath)
  const filePath = getCacheFilePath(norm)
  const { totalFiles, totalBytes } = countTreeStats(rootNode)

  const payload: CachedScanPayload = {
    version: CURRENT_CACHE_VERSION,
    targetPath,
    cachedAt: Date.now(),
    totalFiles,
    totalBytes,
    root: rootNode,
  }

  // Update in-memory cache
  memoryCache.set(norm, { cachedAt: payload.cachedAt, root: rootNode })

  // Auto-index immediate subdirectories (e.g. Documents, Downloads, Desktop)
  if (rootNode.children && rootNode.children.length > 0) {
    for (const child of rootNode.children) {
      if (child.type === 'directory' && child.children && child.children.length > 0) {
        const childNorm = normalizeScanPath(child.path)
        memoryCache.set(childNorm, { cachedAt: payload.cachedAt, root: child })
        // Asynchronously persist child cache
        const childFilePath = getCacheFilePath(childNorm)
        const { totalFiles: cFiles, totalBytes: cBytes } = countTreeStats(child)
        const childPayload: CachedScanPayload = {
          version: CURRENT_CACHE_VERSION,
          targetPath: child.path,
          cachedAt: payload.cachedAt,
          totalFiles: cFiles,
          totalBytes: cBytes,
          root: child,
        }
        fsPromises.writeFile(childFilePath, JSON.stringify(childPayload), 'utf-8').catch(() => {})
      }
    }
  }

  try {
    const jsonStr = JSON.stringify(payload)
    const tmpPath = `${filePath}.${Date.now()}.tmp`
    await fsPromises.writeFile(tmpPath, jsonStr, 'utf-8')
    await fsPromises.rename(tmpPath, filePath)
  } catch (err) {
    console.error(`[ScanCache] Failed to write scan cache to ${filePath}:`, err)
  }
}

export async function loadScanCache(targetPath: string): Promise<FileNode | null> {
  const norm = normalizeScanPath(targetPath)

  // 1. Fast in-memory check
  const mem = memoryCache.get(norm)
  if (mem && mem.root) {
    return mem.root
  }

  // 2. Disk cache check for exact match
  const filePath = getCacheFilePath(norm)
  if (fs.existsSync(filePath)) {
    try {
      const raw = await fsPromises.readFile(filePath, 'utf-8')
      const payload = JSON.parse(raw) as CachedScanPayload
      if (payload && payload.version === CURRENT_CACHE_VERSION && payload.root) {
        memoryCache.set(norm, { cachedAt: payload.cachedAt || Date.now(), root: payload.root })
        return payload.root
      }
    } catch (err) {
      console.warn(`[ScanCache] Corrupted or unreadable scan cache at ${filePath}:`, err)
    }
  }

  // 3. Subtree extraction: check if any parent directory is already cached
  for (const [cachedPath, entry] of memoryCache.entries()) {
    if (norm.startsWith(cachedPath) && norm !== cachedPath) {
      const subNode = findNodeInTree(entry.root, norm)
      if (subNode) {
        memoryCache.set(norm, { cachedAt: entry.cachedAt, root: subNode })
        return subNode
      }
    }
  }

  // Check disk cache files for any parent that contains targetPath
  const cacheDir = getScanCacheDir()
  try {
    const files = await fsPromises.readdir(cacheDir)
    for (const f of files) {
      if (f.startsWith('scan_') && f.endsWith('.json')) {
        const full = path.join(cacheDir, f)
        try {
          const raw = await fsPromises.readFile(full, 'utf-8')
          const payload = JSON.parse(raw) as CachedScanPayload
          if (payload?.root && payload.targetPath) {
            const pNorm = normalizeScanPath(payload.targetPath)
            memoryCache.set(pNorm, { cachedAt: payload.cachedAt, root: payload.root })
            if (norm.startsWith(pNorm)) {
              const subNode = findNodeInTree(payload.root, norm)
              if (subNode) {
                memoryCache.set(norm, { cachedAt: payload.cachedAt, root: subNode })
                return subNode
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  return null
}

export function hasScanCache(targetPath: string): boolean {
  const norm = normalizeScanPath(targetPath)
  if (memoryCache.has(norm)) return true
  const filePath = getCacheFilePath(norm)
  return fs.existsSync(filePath)
}

export async function clearScanCache(targetPath?: string): Promise<void> {
  if (targetPath) {
    const norm = normalizeScanPath(targetPath)
    memoryCache.delete(norm)
    const filePath = getCacheFilePath(norm)
    if (fs.existsSync(filePath)) {
      try {
        await fsPromises.unlink(filePath)
      } catch {
        // Ignored
      }
    }
  } else {
    memoryCache.clear()
    const dir = getScanCacheDir()
    try {
      const files = await fsPromises.readdir(dir)
      for (const file of files) {
        if (file.startsWith('scan_') && file.endsWith('.json')) {
          await fsPromises.unlink(path.join(dir, file)).catch(() => {})
        }
      }
    } catch {
      // Ignored
    }
  }
}
