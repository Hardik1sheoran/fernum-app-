import { parentPort, workerData } from 'node:worker_threads'
import fs from 'node:fs/promises'
import path from 'node:path'
import { FREE_TIER_BYTE_CAP, type ScanOptions, type ScanProgress, type FileNode, type FileCategory } from '../../shared/types'

let isCancelled = false

/**
 * Named constant for tuning concurrent directory listings across storage devices.
 * A bounded concurrency of 16-24 yields high throughput on modern SSDs without
 * overloading the Node.js libuv threadpool or file system handles.
 */
export const CONCURRENT_DIR_SCANS = 16

export class AsyncSemaphore {
  private active = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve)
    })
    this.active++
  }

  release(): void {
    this.active--
    const next = this.queue.shift()
    if (next) {
      next()
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

const EXT_CATEGORY_MAP: Record<string, FileCategory> = {
  // Video
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video',
  flv: 'video', webm: 'video', m4v: 'video', mpg: 'video', mpeg: 'video',
  // Image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  svg: 'image', bmp: 'image', ico: 'image', psd: 'image', tif: 'image', tiff: 'image',
  // Audio
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio',
  m4a: 'audio', wma: 'audio', midi: 'audio',
  // Documents
  pdf: 'document', doc: 'document', docx: 'document', xls: 'document',
  xlsx: 'document', ppt: 'document', pptx: 'document', txt: 'document',
  csv: 'document', md: 'document', epub: 'document', rtf: 'document',
  // Archives
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
  gz: 'archive', bz2: 'archive', xz: 'archive', iso: 'archive', dmg: 'archive',
  // Code
  js: 'code', ts: 'code', tsx: 'code', jsx: 'code', py: 'code',
  java: 'code', cpp: 'code', c: 'code', cs: 'code', go: 'code',
  rs: 'code', html: 'code', css: 'code', scss: 'code', json: 'code',
  yaml: 'code', yml: 'code', xml: 'code', sql: 'code', sh: 'code', ps1: 'code',
  // System / Binaries
  exe: 'system', dll: 'system', sys: 'system', msi: 'system',
  drv: 'system', ocx: 'system', cpl: 'system',
  // Cache / Temp
  tmp: 'cache', temp: 'cache', log: 'cache', cache: 'cache', bak: 'cache',
}

function getCategory(ext: string): FileCategory {
  const cleanExt = ext.toLowerCase().replace(/^\./, '')
  return EXT_CATEGORY_MAP[cleanExt] || 'other'
}

const DEFAULT_IGNORED_DIRS = new Set([
  '$recycle.bin',
  'system volume information',
  'config.msi',
  'recovery',
])

const OPAQUE_BUNDLE_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.cargo',
  '.gradle',
  '.nuget',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'winsxs',
  '.venv',
  'venv',
  '__pycache__',
  'site-packages',
  '.rustup',
  '.pnpm',
  'npm-cache',
])

export interface ScanContext {
  totalFiles: number
  totalBytes: number
  lastReportTime: number
  lastPartialTime?: number
  targetPath: string
  excludedSet: Set<string>
  maxDepth: number
  dirSemaphore: AsyncSemaphore
  cachedDirMap?: Map<string, { mtimeMs: number; node: FileNode }>
  onPartialUpdate?: (node: FileNode) => void
  onProgressUpdate?: (progress: ScanProgress) => void
  deepScan?: boolean
  isPro?: boolean
  maxBytes?: number
  isCapped?: boolean
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

export function accumulateSubtreeStats(node: FileNode, ctx: ScanContext): void {
  if (ctx.isCapped) return
  if (node.type === 'file') {
    ctx.totalFiles++
    ctx.totalBytes += node.size || 0
    const cap = ctx.maxBytes ?? FREE_TIER_BYTE_CAP
    if (!ctx.isPro && ctx.totalBytes >= cap) {
      ctx.isCapped = true
    }
  } else if (node.children) {
    for (const child of node.children) {
      if (ctx.isCapped) break
      accumulateSubtreeStats(child, ctx)
    }
  }
}

export async function scanDirectory(
  dirPath: string,
  depth: number,
  ctx: ScanContext,
  opaqueDepth = 0
): Promise<FileNode | null> {
  if (isCancelled || ctx.isCapped) return null

  // Normalize bare drive roots like "C:" -> "C:\"
  let normalizedPath = dirPath
  if (/^[a-zA-Z]:$/.test(normalizedPath)) {
    normalizedPath = `${normalizedPath}\\`
  }

  const baseName = path.basename(normalizedPath) || normalizedPath
  const lowerName = baseName.toLowerCase()

  if (DEFAULT_IGNORED_DIRS.has(lowerName) || ctx.excludedSet.has(normalizedPath.toLowerCase())) {
    return null
  }

  const isOpaque = !ctx.deepScan && (OPAQUE_BUNDLE_DIRS.has(lowerName) || opaqueDepth > 0)
  const nextOpaqueDepth = isOpaque ? opaqueDepth + 1 : 0

  // Incremental scan fast-path: ONLY stat normalizedPath if cachedDirMap actually contains this directory!
  const normDirPath = normalizedPath.toLowerCase()
  let dirStats: import('node:fs').Stats | null = null
  if (ctx.cachedDirMap && ctx.cachedDirMap.has(normDirPath)) {
    try {
      dirStats = await fs.stat(normalizedPath)
      const cached = ctx.cachedDirMap.get(normDirPath)
      if (cached && cached.mtimeMs === dirStats.mtimeMs && cached.node && cached.node.children) {
        accumulateSubtreeStats(cached.node, ctx)
        return cached.node
      }
    } catch {
      // Inaccessible directory (permissions, locked, reparse point)
    }
  }

  const dirNode: FileNode = {
    id: normalizedPath,
    name: baseName,
    path: normalizedPath,
    size: 0,
    type: 'directory',
    category: 'other',
    lastModified: dirStats ? dirStats.mtimeMs : undefined,
    children: [],
  }

  let entryNames: string[] = []
  try {
    // Read names only (bounded semaphore pool) to avoid whole-directory EPERM on Windows junctions/reparse points
    entryNames = await ctx.dirSemaphore.run(() => fs.readdir(normalizedPath))
  } catch {
    // Inaccessible directory (permissions, locked)
    return null
  }

  if (isCancelled || ctx.isCapped) return null

  const childNodes: FileNode[] = []
  const dirNames: string[] = []
  const fileItems: { name: string; size: number; mtimeMs?: number }[] = []

  // Concurrently inspect entries with lstat, catching errors per-entry so a single junction doesn't abort the folder
  const LSTAT_BATCH_SIZE = 64
  for (let i = 0; i < entryNames.length; i += LSTAT_BATCH_SIZE) {
    if (isCancelled || ctx.isCapped) return null
    const batch = entryNames.slice(i, i + LSTAT_BATCH_SIZE)
    await Promise.all(
      batch.map(async (name) => {
        const lower = name.toLowerCase()
        if (
          lower === 'pagefile.sys' ||
          lower === 'hiberfil.sys' ||
          lower === 'swapfile.sys' ||
          lower === 'dumpstack.log.tmp'
        ) {
          return
        }

        const fullPath = path.join(normalizedPath, name)
        if (ctx.excludedSet.has(fullPath.toLowerCase())) return

        try {
          const stats = await fs.lstat(fullPath)
          if (stats.isSymbolicLink()) {
            return // Skip junctions and symlinks safely (e.g. "C:\Documents and Settings")
          }
          if (stats.isDirectory()) {
            dirNames.push(name)
          } else if (stats.isFile()) {
            fileItems.push({ name, size: stats.size || 0, mtimeMs: stats.mtimeMs })
          }
        } catch {
          // Inaccessible entry (EPERM, EACCES, locked) - skip individually without aborting directory
        }
      })
    )
  }

  // Process files
  for (const file of fileItems) {
    if (ctx.isCapped) break
    const fullPath = path.join(normalizedPath, file.name)
    const ext = path.extname(file.name)

    const fileNode: FileNode = {
      id: fullPath,
      name: file.name,
      path: fullPath,
      size: file.size,
      type: 'file',
      category: getCategory(ext),
      extension: ext,
      lastModified: file.mtimeMs,
    }

    // Retain files for all normal folders. Only omit leaf files deep inside opaque bundle directories (e.g. >1 level inside node_modules)
    if (ctx.deepScan || opaqueDepth <= 1) {
      childNodes.push(fileNode)
    }
    dirNode.size += fileNode.size
    ctx.totalFiles++
    ctx.totalBytes += fileNode.size

    const cap = ctx.maxBytes ?? FREE_TIER_BYTE_CAP
    if (!ctx.isPro && ctx.totalBytes >= cap) {
      ctx.isCapped = true
      dirNode.capped = true
      dirNode.cappedAtBytes = cap
      break
    }
  }

  // Throttle progress updates every ~150ms or immediately on cap
  const now = Date.now()
  if (now - ctx.lastReportTime > 150 || ctx.isCapped) {
    ctx.lastReportTime = now
    const progressData: ScanProgress = {
      status: ctx.isCapped ? 'completed' : 'scanning',
      currentPath: normalizedPath,
      scannedFiles: ctx.totalFiles,
      scannedBytes: ctx.totalBytes,
      percentage: ctx.isCapped ? 100 : 0,
      capped: ctx.isCapped,
      cappedAtBytes: ctx.isCapped ? (ctx.maxBytes ?? FREE_TIER_BYTE_CAP) : undefined,
    }
    parentPort?.postMessage({
      type: 'progress',
      data: progressData,
    })
    ctx.onProgressUpdate?.(progressData)
  }

  // Parallel traversal of child directories through bounded semaphore
  if (dirNames.length > 0 && !ctx.isCapped) {
    if (ctx.maxDepth > 0 && depth >= ctx.maxDepth) {
      // Depth cap reached: surface cutoff rather than silently omitting
      dirNode.truncatedAtDepth = true
      for (const name of dirNames) {
        const fullPath = path.join(normalizedPath, name)
        if (ctx.excludedSet.has(fullPath.toLowerCase())) continue
        childNodes.push({
          id: fullPath,
          name,
          path: fullPath,
          size: 0,
          type: 'directory',
          category: 'other',
          children: [],
          truncatedAtDepth: true,
        })
      }
    } else if (depth === 0) {
      // 1. Instant initial frame in < 15ms so treemap blocks appear on screen immediately
      const initialChildren: FileNode[] = [
        ...childNodes,
        ...dirNames.map((name) => {
          const fullPath = path.join(normalizedPath, name)
          return {
            id: fullPath,
            name,
            path: fullPath,
            size: 1024 * 1024,
            type: 'directory' as const,
            category: 'other' as const,
            children: [],
          }
        }),
      ]
      if (initialChildren.length > 0) {
        ctx.lastPartialTime = Date.now()
        const initialSnapshot: FileNode = {
          id: dirNode.id,
          name: dirNode.name,
          path: dirNode.path,
          size: Math.max(initialChildren.length * 1024 * 1024, dirNode.size),
          type: 'directory',
          category: 'other',
          children: initialChildren,
          lastModified: dirNode.lastModified,
        }
        parentPort?.postMessage({
          type: 'partial',
          data: initialSnapshot,
        })
        ctx.onPartialUpdate?.(initialSnapshot)
      }

      // Progressive streaming for root directory children
      await Promise.all(
        dirNames.map(async (name) => {
          if (isCancelled || ctx.isCapped) return
          const fullPath = path.join(normalizedPath, name)
          if (ctx.excludedSet.has(fullPath.toLowerCase())) return

          const subDirNode = await scanDirectory(fullPath, depth + 1, ctx, nextOpaqueDepth)
          if (
            subDirNode &&
            (subDirNode.size > 0 ||
              (subDirNode.children && subDirNode.children.length > 0) ||
              subDirNode.truncatedAtDepth)
          ) {
            const existingIdx = childNodes.findIndex((c) => c.path === subDirNode.path)
            if (existingIdx >= 0) {
              childNodes[existingIdx] = subDirNode
            } else {
              childNodes.push(subDirNode)
            }
            dirNode.size += subDirNode.size
            if (subDirNode.truncatedAtDepth) {
              dirNode.truncatedAtDepth = true
            }
            if (subDirNode.capped) {
              dirNode.capped = true
              dirNode.cappedAtBytes = subDirNode.cappedAtBytes
            }
            childNodes.sort((a, b) => b.size - a.size)

            const now = Date.now()
            if (now - (ctx.lastPartialTime || 0) > 800) {
              ctx.lastPartialTime = now
              const snapshotChildren = childNodes.map((c) => ({
                id: c.id,
                name: c.name,
                path: c.path,
                size: c.size,
                type: c.type,
                category: c.category,
                truncatedAtDepth: c.truncatedAtDepth,
                children: (c.children || []).slice(0, 30).map((sub) => ({
                  id: sub.id,
                  name: sub.name,
                  path: sub.path,
                  size: sub.size,
                  type: sub.type,
                  category: sub.category,
                  children: [],
                })),
              }))

              const snapshot: FileNode = {
                id: dirNode.id,
                name: dirNode.name,
                path: dirNode.path,
                size: dirNode.size,
                type: 'directory',
                category: 'other',
                children: snapshotChildren,
                lastModified: dirNode.lastModified,
              }
              parentPort?.postMessage({
                type: 'partial',
                data: snapshot,
              })
              ctx.onPartialUpdate?.(snapshot)
            }
          }
        })
      )
    } else {
      const subDirPromises = dirNames.map(async (name) => {
        if (isCancelled || ctx.isCapped) return null
        const fullPath = path.join(normalizedPath, name)
        if (ctx.excludedSet.has(fullPath.toLowerCase())) return null

        return scanDirectory(fullPath, depth + 1, ctx, nextOpaqueDepth)
      })

      const subDirNodes = await Promise.all(subDirPromises)
      for (const subDirNode of subDirNodes) {
        if (
          subDirNode &&
          (subDirNode.size > 0 ||
            (subDirNode.children && subDirNode.children.length > 0) ||
            subDirNode.truncatedAtDepth ||
            subDirNode.capped)
        ) {
          childNodes.push(subDirNode)
          dirNode.size += subDirNode.size
          if (subDirNode.truncatedAtDepth) {
            dirNode.truncatedAtDepth = true
          }
          if (subDirNode.capped) {
            dirNode.capped = true
            dirNode.cappedAtBytes = subDirNode.cappedAtBytes
          }
        }
      }
    }
  }

  if (ctx.isCapped) {
    dirNode.capped = true
    dirNode.cappedAtBytes = ctx.maxBytes ?? FREE_TIER_BYTE_CAP
  }

  // Sort child nodes descending by size for optimal treemap packing
  childNodes.sort((a, b) => b.size - a.size)
  // Treemap visual layout renders at most top 25-50 items per level.
  // Truncate child list to top 80 (or 250 in deepScan) largest nodes to eliminate 500MB IPC payloads while preserving full sizes.
  const maxChildren = ctx.deepScan ? 250 : 80
  dirNode.children = childNodes.length > maxChildren ? childNodes.slice(0, maxChildren) : childNodes

  return dirNode
}

export async function performScan(options: ScanOptions): Promise<FileNode | null> {
  isCancelled = false
  let targetPath = options.targetPath || 'C:\\'
  if (/^[a-zA-Z]:$/.test(targetPath)) {
    targetPath = `${targetPath}\\`
  }
  const excludedSet = new Set((options.excludePaths || []).map((p) => p.toLowerCase()))

  const ctx: ScanContext = {
    totalFiles: 0,
    totalBytes: 0,
    lastReportTime: Date.now(),
    lastPartialTime: Date.now(),
    targetPath,
    excludedSet,
    maxDepth: options.maxDepth !== undefined ? options.maxDepth : (options.deepScan ? 35 : 20),
    dirSemaphore: new AsyncSemaphore(CONCURRENT_DIR_SCANS),
    cachedDirMap: options.cachedRoot ? buildDirMtimeMap(options.cachedRoot) : undefined,
    deepScan: Boolean(options.deepScan),
    isPro: Boolean(options.isPro),
    maxBytes: options.maxBytes,
  }

  const root = await scanDirectory(targetPath, 0, ctx)
  if (root && ctx.isCapped) {
    root.capped = true
    root.cappedAtBytes = ctx.maxBytes ?? FREE_TIER_BYTE_CAP
  }
  return root
}

async function runScan(options: ScanOptions): Promise<void> {
  isCancelled = false
  let targetPath = options.targetPath || workerData?.targetPath || 'C:\\'
  if (/^[a-zA-Z]:$/.test(targetPath)) {
    targetPath = `${targetPath}\\`
  }
  const excludedSet = new Set(
    (options.excludePaths || []).map((p) => p.toLowerCase())
  )

  const ctx: ScanContext = {
    totalFiles: 0,
    totalBytes: 0,
    lastReportTime: Date.now(),
    lastPartialTime: Date.now(),
    targetPath,
    excludedSet,
    maxDepth: options.maxDepth !== undefined ? options.maxDepth : (options.deepScan ? 35 : 20),
    dirSemaphore: new AsyncSemaphore(CONCURRENT_DIR_SCANS),
    cachedDirMap: options.cachedRoot ? buildDirMtimeMap(options.cachedRoot) : undefined,
    deepScan: Boolean(options.deepScan),
    isPro: Boolean(options.isPro),
    maxBytes: options.maxBytes,
  }

  parentPort?.postMessage({
    type: 'progress',
    data: {
      status: 'scanning',
      currentPath: targetPath,
      scannedFiles: 0,
      scannedBytes: 0,
      percentage: 0,
      capped: false,
    } as ScanProgress,
  })

  try {
    const rootNode = await scanDirectory(targetPath, 0, ctx)

    if (isCancelled) {
      parentPort?.postMessage({
        type: 'progress',
        data: {
          status: 'cancelled',
          currentPath: targetPath,
          scannedFiles: ctx.totalFiles,
          scannedBytes: ctx.totalBytes,
          percentage: 0,
        } as ScanProgress,
      })
      return
    }

    if (!rootNode) {
      parentPort?.postMessage({
        type: 'error',
        error: `Failed to access target path: ${targetPath}`,
      })
      return
    }

    if (ctx.isCapped) {
      rootNode.capped = true
      rootNode.cappedAtBytes = ctx.maxBytes ?? FREE_TIER_BYTE_CAP
    }

    // Emit final progress then complete with tree
    parentPort?.postMessage({
      type: 'progress',
      data: {
        status: 'completed',
        currentPath: targetPath,
        scannedFiles: ctx.totalFiles,
        scannedBytes: ctx.totalBytes,
        percentage: 100,
        capped: ctx.isCapped,
        cappedAtBytes: ctx.isCapped ? (ctx.maxBytes ?? FREE_TIER_BYTE_CAP) : undefined,
      } as ScanProgress,
    })

    parentPort?.postMessage({
      type: 'complete',
      data: rootNode,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    parentPort?.postMessage({
      type: 'error',
      error: errorMsg,
    })
  }
}

export function cancelDirectScan(): void {
  isCancelled = true
}

export async function runScanDirectly(
  options: ScanOptions,
  callbacks?: {
    onProgress?: (progress: ScanProgress) => void
    onPartial?: (node: FileNode) => void
  }
): Promise<FileNode> {
  isCancelled = false
  let targetPath = options.targetPath || 'C:\\'
  if (/^[a-zA-Z]:$/.test(targetPath)) {
    targetPath = `${targetPath}\\`
  }
  const excludedSet = new Set(
    (options.excludePaths || []).map((p) => p.toLowerCase())
  )

  const ctx: ScanContext = {
    totalFiles: 0,
    totalBytes: 0,
    lastReportTime: Date.now(),
    lastPartialTime: Date.now(),
    targetPath,
    excludedSet,
    maxDepth: options.maxDepth !== undefined ? options.maxDepth : (options.deepScan ? 35 : 20),
    dirSemaphore: new AsyncSemaphore(CONCURRENT_DIR_SCANS),
    cachedDirMap: options.cachedRoot ? buildDirMtimeMap(options.cachedRoot) : undefined,
    onPartialUpdate: callbacks?.onPartial,
    onProgressUpdate: callbacks?.onProgress,
    deepScan: Boolean(options.deepScan),
    isPro: Boolean(options.isPro),
    maxBytes: options.maxBytes,
  }

  callbacks?.onProgress?.({
    status: 'scanning',
    currentPath: targetPath,
    scannedFiles: 0,
    scannedBytes: 0,
    percentage: 0,
    capped: false,
  })

  const rootNode = await scanDirectory(targetPath, 0, ctx)

  if (isCancelled) {
    callbacks?.onProgress?.({
      status: 'cancelled',
      currentPath: targetPath,
      scannedFiles: ctx.totalFiles,
      scannedBytes: ctx.totalBytes,
      percentage: 0,
    })
    throw new Error('Scan was cancelled')
  }

  if (!rootNode) {
    throw new Error(`Failed to access target path: ${targetPath}`)
  }

  if (ctx.isCapped) {
    rootNode.capped = true
    rootNode.cappedAtBytes = ctx.maxBytes ?? FREE_TIER_BYTE_CAP
  }

  callbacks?.onProgress?.({
    status: 'completed',
    currentPath: targetPath,
    scannedFiles: ctx.totalFiles,
    scannedBytes: ctx.totalBytes,
    percentage: 100,
    capped: ctx.isCapped,
    cappedAtBytes: ctx.isCapped ? (ctx.maxBytes ?? FREE_TIER_BYTE_CAP) : undefined,
  })

  return rootNode
}

if (parentPort && !process.env.VITEST && !process.env.NODE_TEST_CONTEXT) {
  parentPort.on('message', (message: { command: string; options?: ScanOptions }) => {
    if (message?.command === 'start') {
      runScan(message.options || { targetPath: 'C:\\' })
    } else if (message?.command === 'cancel') {
      isCancelled = true
    }
  })
}
