import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { FileNode, FileCategory } from '../../shared/types'
import { saveScanCache } from './scanCache'

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

const IGNORED_PATH_FRAGMENTS = [
  '$recycle.bin',
  'system volume information',
  'config.msi',
  'recovery',
  'pagefile.sys',
  'hiberfil.sys',
  'swapfile.sys',
  'dumpstack.log.tmp',
  'appdata\\local\\temp',
  'appdata/local/temp',
]

export function shouldIgnoreWatchPath(fullPath: string): boolean {
  const lower = fullPath.toLowerCase()
  for (const fragment of IGNORED_PATH_FRAGMENTS) {
    if (lower.includes(fragment)) return true
  }
  return false
}

export function findNodeByPath(root: FileNode, targetPath: string): FileNode | null {
  const normTarget = path.normalize(targetPath).toLowerCase()
  if (path.normalize(root.path).toLowerCase() === normTarget) return root
  if (!root.children) return null

  for (const child of root.children) {
    const found = findNodeByPath(child, normTarget)
    if (found) return found
  }
  return null
}

export function ensureDirectoryPathInTree(root: FileNode, dirPath: string): FileNode {
  const normRoot = path.normalize(root.path).toLowerCase()
  const normDir = path.normalize(dirPath).toLowerCase()

  if (normRoot === normDir) return root

  const relative = path.relative(root.path, dirPath)
  if (relative.startsWith('..')) {
    return root
  }

  const parts = relative.split(path.sep).filter(Boolean)
  let current = root

  let accumulatedPath = root.path
  for (const part of parts) {
    accumulatedPath = path.join(accumulatedPath, part)
    if (!current.children) {
      current.children = []
    }

    const normAccum = accumulatedPath.toLowerCase()
    let childDir = current.children.find(
      (c) => c.type === 'directory' && c.path.toLowerCase() === normAccum
    )

    if (!childDir) {
      childDir = {
        id: accumulatedPath,
        name: part,
        path: accumulatedPath,
        size: 0,
        type: 'directory',
        category: 'other',
        children: [],
        lastModified: Date.now(),
      }
      current.children.push(childDir)
      current.children.sort((a, b) => b.size - a.size)
    }

    current = childDir
  }

  return current
}

export function insertOrUpdateFileInTree(root: FileNode, fileNode: FileNode): boolean {
  const parentDirPath = path.dirname(fileNode.path)
  const parentNode = ensureDirectoryPathInTree(root, parentDirPath)

  if (!parentNode.children) {
    parentNode.children = []
  }

  const existingIndex = parentNode.children.findIndex(
    (c) => c.path.toLowerCase() === fileNode.path.toLowerCase()
  )

  if (existingIndex >= 0) {
    parentNode.children[existingIndex] = fileNode
  } else {
    parentNode.children.push(fileNode)
  }

  parentNode.children.sort((a, b) => b.size - a.size)
  return true
}

export function removePathFromTree(
  parent: FileNode,
  targetPath: string
): { removed: boolean; freedBytes: number } {
  if (!parent.children) return { removed: false, freedBytes: 0 }

  const normTarget = path.normalize(targetPath).toLowerCase()
  const index = parent.children.findIndex((c) => path.normalize(c.path).toLowerCase() === normTarget)

  if (index !== -1) {
    const [deleted] = parent.children.splice(index, 1)
    return { removed: true, freedBytes: deleted.size }
  }

  for (const child of parent.children) {
    if (child.type === 'directory') {
      const res = removePathFromTree(child, normTarget)
      if (res.removed) {
        return res
      }
    }
  }

  return { removed: false, freedBytes: 0 }
}

export function recalculateTreeSizes(node: FileNode): number {
  if (node.type === 'file') {
    return node.size || 0
  }

  if (!node.children || node.children.length === 0) {
    node.size = 0
    return 0
  }

  let sum = 0
  for (const child of node.children) {
    sum += recalculateTreeSizes(child)
  }

  node.size = sum
  node.children.sort((a, b) => b.size - a.size)
  return sum
}

let activeFsWatcher: fs.FSWatcher | null = null
let activeWatchedRoot: string | null = null
let currentRootNode: FileNode | null = null
let onUpdateCallback: ((updatedRoot: FileNode) => void) | null = null
let pendingPaths = new Set<string>()
let debounceTimer: NodeJS.Timeout | null = null

async function processPendingWatchEvents(): Promise<void> {
  if (!currentRootNode || !activeWatchedRoot || pendingPaths.size === 0) return

  const pathsToProcess = Array.from(pendingPaths)
  pendingPaths.clear()

  let hasChanges = false

  for (const changedPath of pathsToProcess) {
    if (shouldIgnoreWatchPath(changedPath)) continue

    try {
      if (fs.existsSync(changedPath)) {
        const stats = await fsPromises.stat(changedPath)
        if (stats.isFile()) {
          const ext = path.extname(changedPath)
          const fileNode: FileNode = {
            id: changedPath,
            name: path.basename(changedPath),
            path: changedPath,
            size: stats.size || 0,
            type: 'file',
            category: getCategory(ext),
            extension: ext,
            lastModified: stats.mtimeMs,
          }
          insertOrUpdateFileInTree(currentRootNode, fileNode)
          hasChanges = true
        } else if (stats.isDirectory()) {
          ensureDirectoryPathInTree(currentRootNode, changedPath)
          hasChanges = true
        }
      } else {
        // File or directory deleted
        const res = removePathFromTree(currentRootNode, changedPath)
        if (res.removed) {
          hasChanges = true
        }
      }
    } catch {
      // Handled permissions / transient file lock gracefully
    }
  }

  if (hasChanges) {
    recalculateTreeSizes(currentRootNode)
    // Automatically save updated tree to disk cache
    await saveScanCache(activeWatchedRoot, currentRootNode)
    if (onUpdateCallback) {
      onUpdateCallback(currentRootNode)
    }
  }
}

export function startScanWatcher(
  targetPath: string,
  rootNode: FileNode,
  onUpdate: (updatedRoot: FileNode) => void
): void {
  stopScanWatcher()

  activeWatchedRoot = targetPath
  currentRootNode = rootNode
  onUpdateCallback = onUpdate
  pendingPaths = new Set<string>()

  try {
    // Windows-native recursive watch
    activeFsWatcher = fs.watch(targetPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return
      const fullPath = path.resolve(targetPath, filename)
      if (shouldIgnoreWatchPath(fullPath)) return

      pendingPaths.add(fullPath)

      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        processPendingWatchEvents().catch((err) => {
          console.warn('[ScanWatcher] Error processing watch events:', err)
        })
      }, 350)
    })

    activeFsWatcher.on('error', (err) => {
      console.warn(`[ScanWatcher] Watcher warning for ${targetPath}:`, err)
    })
  } catch (err) {
    console.warn(`[ScanWatcher] Could not attach watcher to ${targetPath}:`, err)
  }
}

export function stopScanWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  pendingPaths.clear()
  if (activeFsWatcher) {
    try {
      activeFsWatcher.close()
    } catch {
      // Ignored
    }
    activeFsWatcher = null
  }
  activeWatchedRoot = null
  currentRootNode = null
  onUpdateCallback = null
}
