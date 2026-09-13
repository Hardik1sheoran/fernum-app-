import type { FileCategory, FileNode, SearchQueryOptions, SearchResultItem } from './types'

export const CATEGORY_EXTENSIONS: Record<string, FileCategory> = {
  // Video
  mp4: 'video',
  mkv: 'video',
  mov: 'video',
  avi: 'video',
  wmv: 'video',
  flv: 'video',
  webm: 'video',
  m4v: 'video',

  // Audio
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  aac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  wma: 'audio',

  // Image
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  ico: 'image',
  tiff: 'image',
  psd: 'image',
  raw: 'image',
  cr2: 'image',
  nef: 'image',

  // Documents
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  xls: 'document',
  xlsx: 'document',
  ppt: 'document',
  pptx: 'document',
  txt: 'document',
  rtf: 'document',
  csv: 'document',
  epub: 'document',

  // Archives / Disk Images
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  'tar.gz': 'archive',
  tgz: 'archive',
  bz2: 'archive',
  xz: 'archive',
  iso: 'archive',
  img: 'archive',
  vmdk: 'archive',
  vdi: 'archive',
  vhdx: 'archive',
  dmg: 'archive',

  // Code & Developer
  js: 'code',
  ts: 'code',
  jsx: 'code',
  tsx: 'code',
  py: 'code',
  java: 'code',
  c: 'code',
  cpp: 'code',
  h: 'code',
  cs: 'code',
  go: 'code',
  rs: 'code',
  html: 'code',
  css: 'code',
  scss: 'code',
  json: 'code',
  yaml: 'code',
  yml: 'code',
  xml: 'code',
  sql: 'code',
  sh: 'code',
  bat: 'code',
  ps1: 'code',

  // System & Executable
  exe: 'system',
  msi: 'system',
  dll: 'system',
  sys: 'system',
  drv: 'system',

  // Cache & Temporary
  tmp: 'cache',
  temp: 'cache',
  log: 'cache',
  bak: 'cache',
  old: 'cache',
  cache: 'cache',
}

/**
 * Maps a file extension to its primary FileCategory.
 */
export function getCategoryFromExtension(ext?: string): FileCategory {
  if (!ext) return 'other'
  const normalized = ext.toLowerCase().replace(/^\./, '')
  if (CATEGORY_EXTENSIONS[normalized]) {
    return CATEGORY_EXTENSIONS[normalized]
  }
  // Check compound extensions (e.g. tar.gz -> gz)
  const lastPart = normalized.split('.').pop()
  if (lastPart && CATEGORY_EXTENSIONS[lastPart]) {
    return CATEGORY_EXTENSIONS[lastPart]
  }
  return 'other'
}

/**
 * Recursively searches a scanned FileNode tree for files matching criteria.
 */
export function searchFileNodeTree(
  root: FileNode,
  options: SearchQueryOptions
): SearchResultItem[] {
  const results: SearchResultItem[] = []
  const query = options.query.trim().toLowerCase()
  const minSize = options.minSizeBytes ?? 0
  const targetCategory = options.category && options.category !== 'all' ? options.category : null
  const targetExt = options.extension?.toLowerCase().replace(/^\./, '')

  function walk(node: FileNode) {
    if (node.type === 'file') {
      // Check size
      if (node.size < minSize) return

      // Check category
      if (targetCategory && node.category !== targetCategory) return

      // Check extension filter
      if (targetExt && node.extension?.toLowerCase() !== targetExt) return

      // Check query match (substring in name or extension)
      if (query.length > 0) {
        const nameLower = node.name.toLowerCase()
        const extLower = (node.extension || '').toLowerCase()
        const matchesName = nameLower.includes(query)
        const matchesExt = query.startsWith('.')
          ? extLower === query.slice(1)
          : extLower.includes(query)

        if (!matchesName && !matchesExt) return
      }

      results.push({
        id: node.id || node.path,
        name: node.name,
        path: node.path,
        sizeBytes: node.size,
        category: node.category,
        extension: node.extension,
        lastModified: node.lastModified,
      })
    } else if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(root)

  // Default sort descending by size
  results.sort((a, b) => b.sizeBytes - a.sizeBytes)

  const limit = options.limit && options.limit > 0 ? options.limit : 200
  return results.slice(0, limit)
}

/**
 * Sorts search results by size, name, or last modified date.
 */
export function sortSearchResults(
  items: SearchResultItem[],
  sortBy: 'size' | 'name' | 'date',
  ascending: boolean = false
): SearchResultItem[] {
  return [...items].sort((a, b) => {
    if (sortBy === 'size') {
      return ascending ? a.sizeBytes - b.sizeBytes : b.sizeBytes - a.sizeBytes
    } else if (sortBy === 'name') {
      return ascending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    } else if (sortBy === 'date') {
      const dateA = a.lastModified || 0
      const dateB = b.lastModified || 0
      return ascending ? dateA - dateB : dateB - dateA
    }
    return 0
  })
}
