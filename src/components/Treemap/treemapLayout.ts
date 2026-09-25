import type { FileNode, FileCategory } from '@shared/types'

export interface TreemapRect {
  x: number
  y: number
  width: number
  height: number
  node: FileNode
  color: string
  formattedSize: string
  percentageOfParent: number
  canFitTitle: boolean
  canFitSubtitle: boolean
}

export interface NestedTreemapRect extends TreemapRect {
  depth: number
  isContainer: boolean
  headerHeight: number
  contentBox?: BoundingBox
  children?: NestedTreemapRect[]
  borderColor: string
  headerBgColor: string
}

export const CATEGORY_COLORS: Record<FileCategory, string> = {
  video: '#8b5cf6', // Violet
  image: '#ec4899', // Pink
  audio: '#f59e0b', // Amber
  document: '#3b82f6', // Blue
  archive: '#10b981', // Emerald
  code: '#06b6d4', // Cyan
  system: '#ef4444', // Red
  cache: '#64748b', // Slate
  other: '#94a3b8', // Gray
}

export const CONTAINER_BORDER_PALETTE = [
  '#c084fc', // Purple (DissectMac Library / Ollama)
  '#38bdf8', // Light Blue / Sky
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f472b6', // Pink
  '#22d3ee', // Cyan
  '#a3e635', // Lime
  '#fb923c', // Orange
  '#818cf8', // Indigo
  '#2dd4bf', // Teal
  '#fb7185', // Rose
]

export function formatBytes(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const clampedIndex = Math.max(0, Math.min(i, units.length - 1))
  const val = bytes / Math.pow(1024, clampedIndex)
  return `${val >= 10 || clampedIndex === 0 ? val.toFixed(1) : val.toFixed(2)} ${units[clampedIndex]}`
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

interface SizedItem {
  node: FileNode
  area: number
  originalSize: number
}

function worstAspectRatio(row: SizedItem[], sideLength: number): number {
  if (row.length === 0 || sideLength <= 0) return Infinity
  let sumArea = 0
  let minArea = Infinity
  let maxArea = -Infinity

  for (const item of row) {
    sumArea += item.area
    if (item.area < minArea) minArea = item.area
    if (item.area > maxArea) maxArea = item.area
  }

  if (sumArea <= 0 || minArea <= 0) return Infinity

  const sideSq = sideLength * sideLength
  const sumSq = sumArea * sumArea

  return Math.max(
    (sideSq * maxArea) / sumSq,
    sumSq / (sideSq * minArea)
  )
}

function layoutRow(
  row: SizedItem[],
  box: BoundingBox,
  totalParentSize: number
): { rects: TreemapRect[]; remainingBox: BoundingBox } {
  const isHorizontal = box.width >= box.height
  const sideLength = isHorizontal ? box.height : box.width
  let rowAreaSum = 0

  for (const item of row) {
    rowAreaSum += item.area
  }

  const rowThickness = sideLength > 0 ? rowAreaSum / sideLength : 0
  const rects: TreemapRect[] = []

  let currentOffset = 0

  for (const item of row) {
    const itemLength = rowThickness > 0 ? item.area / rowThickness : 0

    let rx: number
    let ry: number
    let rw: number
    let rh: number

    if (isHorizontal) {
      rx = box.x
      ry = box.y + currentOffset
      rw = rowThickness
      rh = itemLength
    } else {
      rx = box.x + currentOffset
      ry = box.y
      rw = itemLength
      rh = rowThickness
    }

    currentOffset += itemLength

    const color =
      item.node.type === 'directory'
        ? '#3b82f6'
        : CATEGORY_COLORS[item.node.category] || CATEGORY_COLORS.other

    const percentage = totalParentSize > 0 ? (item.originalSize / totalParentSize) * 100 : 0

    rects.push({
      x: rx,
      y: ry,
      width: Math.max(0, rw),
      height: Math.max(0, rh),
      node: item.node,
      color,
      formattedSize: formatBytes(item.originalSize),
      percentageOfParent: Number(percentage.toFixed(1)),
      canFitTitle: rw >= 36 && rh >= 18,
      canFitSubtitle: rw >= 50 && rh >= 32,
    })
  }

  let remainingBox: BoundingBox
  if (isHorizontal) {
    remainingBox = {
      x: box.x + rowThickness,
      y: box.y,
      width: Math.max(0, box.width - rowThickness),
      height: box.height,
    }
  } else {
    remainingBox = {
      x: box.x,
      y: box.y + rowThickness,
      width: box.width,
      height: Math.max(0, box.height - rowThickness),
    }
  }

  return { rects, remainingBox }
}

const MAX_VISIBLE_NODES = 120

/**
 * Computes a single-level Squarified Treemap layout.
 */
export function computeTreemapLayout(
  nodes: FileNode[],
  bounds: { width: number; height: number; x?: number; y?: number }
): TreemapRect[] {
  const boxWidth = bounds.width
  const boxHeight = bounds.height
  const startX = bounds.x || 0
  const startY = bounds.y || 0

  if (boxWidth <= 0 || boxHeight <= 0 || !nodes || nodes.length === 0) {
    return []
  }

  const validNodes = nodes.filter((n) => n != null).sort((a, b) => (b.size || 0) - (a.size || 0))
  if (validNodes.length === 0) {
    return []
  }

  let totalSize = 0
  for (const n of validNodes) {
    totalSize += Math.max(1, n.size || 0)
  }

  if (totalSize <= 0) return []

  let itemsToLayout: FileNode[]
  if (validNodes.length > MAX_VISIBLE_NODES) {
    const topItems = validNodes.slice(0, MAX_VISIBLE_NODES)
    const remainingItems = validNodes.slice(MAX_VISIBLE_NODES)
    let remainingSum = 0
    for (const r of remainingItems) {
      remainingSum += r.size || 0
    }

    topItems.push({
      id: '__aggregated_others__',
      name: `Other (${remainingItems.length.toLocaleString()} items)`,
      path: '',
      size: remainingSum,
      type: 'directory',
      category: 'other',
      children: remainingItems,
    })
    itemsToLayout = topItems
  } else {
    itemsToLayout = validNodes
  }

  const totalArea = boxWidth * boxHeight
  const normalizedItems: SizedItem[] = itemsToLayout.map((node) => ({
    node,
    area: (Math.max(1, node.size || 0) / totalSize) * totalArea,
    originalSize: node.size || 0,
  }))

  const result: TreemapRect[] = []
  let currentBox: BoundingBox = { x: startX, y: startY, width: boxWidth, height: boxHeight }
  let currentRow: SizedItem[] = []

  for (let i = 0; i < normalizedItems.length; i++) {
    const item = normalizedItems[i]
    const shortestSide = Math.min(currentBox.width, currentBox.height)

    if (shortestSide <= 0) break

    const candidateRow = [...currentRow, item]

    if (currentRow.length === 0) {
      currentRow.push(item)
    } else {
      const currentWorst = worstAspectRatio(currentRow, shortestSide)
      const candidateWorst = worstAspectRatio(candidateRow, shortestSide)

      if (candidateWorst <= currentWorst) {
        currentRow.push(item)
      } else {
        const { rects, remainingBox } = layoutRow(currentRow, currentBox, totalSize)
        result.push(...rects)
        currentBox = remainingBox
        currentRow = [item]
      }
    }
  }

  if (currentRow.length > 0 && currentBox.width > 0 && currentBox.height > 0) {
    const { rects } = layoutRow(currentRow, currentBox, totalSize)
    result.push(...rects)
  }

  return result
}

export interface NestedLayoutOptions {
  maxDepth?: number
  minContainerWidth?: number
  minContainerHeight?: number
  maxVisibleNodesPerLevel?: number
}

/**
 * Computes a Multi-Level Nested Squarified Treemap layout matching DissectMac.
 * Recursively layouts directory children inside their parent bounding box.
 */
export function computeNestedTreemapLayout(
  nodes: FileNode[],
  bounds: BoundingBox,
  depth: number = 0,
  options: NestedLayoutOptions = {},
  parentBorderColor?: string
): NestedTreemapRect[] {
  const maxDepth = options.maxDepth ?? 4
  const minContainerWidth = options.minContainerWidth ?? 44
  const minContainerHeight = options.minContainerHeight ?? 40
  const maxNodes = depth === 0 ? 80 : (options.maxVisibleNodesPerLevel ?? 25)

  if (bounds.width <= 0 || bounds.height <= 0 || !nodes || nodes.length === 0) {
    return []
  }

  const validNodes = nodes.filter((n) => n != null).sort((a, b) => (b.size || 0) - (a.size || 0))
  if (validNodes.length === 0) {
    return []
  }

  let totalSize = 0
  for (const n of validNodes) {
    totalSize += Math.max(1, n.size || 0)
  }
  if (totalSize <= 0) return []

  // Top-N per container level to avoid rendering millions of microscopic leaves
  let itemsToLayout: FileNode[]
  if (validNodes.length > maxNodes) {
    const topItems = validNodes.slice(0, maxNodes)
    const remainingItems = validNodes.slice(maxNodes)
    let remainingSum = 0
    for (const r of remainingItems) {
      remainingSum += r.size || 0
    }

    topItems.push({
      id: `__aggregated_others_${depth}_${remainingItems.length}__`,
      name: `… and ${remainingItems.length.toLocaleString()} files`,
      path: '',
      size: remainingSum,
      type: 'file',
      category: 'other',
    })
    itemsToLayout = topItems
  } else {
    itemsToLayout = validNodes
  }

  // Base layout at current depth
  const baseRects = computeTreemapLayout(itemsToLayout, bounds)
  const nestedRects: NestedTreemapRect[] = []

  for (let idx = 0; idx < baseRects.length; idx++) {
    const rect = baseRects[idx]
    const node = rect.node

    // Assign border color
    let borderColor = parentBorderColor
    const lowerName = node.name.toLowerCase()
    if (lowerName.includes('gradle')) {
      borderColor = '#f59e0b'
    } else if (lowerName.includes('ollama')) {
      borderColor = '#38bdf8'
    } else if (lowerName.includes('library')) {
      borderColor = '#34d399'
    } else if (depth === 0) {
      borderColor = CONTAINER_BORDER_PALETTE[idx % CONTAINER_BORDER_PALETTE.length]
    } else if (!borderColor || depth % 2 === 1) {
      borderColor = CONTAINER_BORDER_PALETTE[(idx * 3 + depth * 2) % CONTAINER_BORDER_PALETTE.length]
    }

    const headerBgColor = 'rgba(255, 255, 255, 0.05)'

    const canBeContainer =
      node.type === 'directory' &&
      node.children &&
      node.children.length > 0 &&
      depth < maxDepth &&
      rect.width >= minContainerWidth &&
      rect.height >= minContainerHeight

    if (canBeContainer && node.children) {
      // Container layout
      const headerHeight = Math.min(20, Math.max(16, Math.floor(rect.height * 0.16)))
      const pad = 2.5
      const contentBox: BoundingBox = {
        x: rect.x + pad,
        y: rect.y + headerHeight + 1,
        width: Math.max(0, rect.width - pad * 2),
        height: Math.max(0, rect.height - headerHeight - 1 - pad),
      }

      let childRects: NestedTreemapRect[] = []
      if (contentBox.width >= 18 && contentBox.height >= 18) {
        childRects = computeNestedTreemapLayout(
          node.children,
          contentBox,
          depth + 1,
          options,
          borderColor
        )
      }

      if (childRects.length > 0) {
        nestedRects.push({
          ...rect,
          depth,
          isContainer: true,
          headerHeight,
          contentBox,
          children: childRects,
          borderColor: borderColor || '#3b82f6',
          headerBgColor,
          color: lowerName.includes('gradle') ? 'rgba(40, 25, 5, 0.95)' : 'rgba(8, 8, 12, 0.92)',
        })
        continue
      }
    }

    // Leaf item (file, small directory, or aggregated group)
    let leafColor =
      node.type === 'file'
        ? CATEGORY_COLORS[node.category] || CATEGORY_COLORS.other
        : (node.category && CATEGORY_COLORS[node.category]) || '#3b82f6'

    if (node.name === 'Fernum-Setup.exe') {
      leafColor = '#2563eb'
    } else if (node.name.includes('fernum.online')) {
      leafColor = '#10b981'
    } else if (node.path && (node.path.includes('.gradle') || node.name.includes('transforms'))) {
      const gradlePal = ['#f59e0b', '#d97706', '#fbbf24', '#b45309', '#f97316']
      leafColor = gradlePal[idx % gradlePal.length]
    } else if (node.name.startsWith('sha256-')) {
      leafColor = '#3b485d'
    }

    nestedRects.push({
      ...rect,
      depth,
      isContainer: false,
      headerHeight: 0,
      borderColor: borderColor || 'rgba(0, 0, 0, 0.4)',
      headerBgColor: 'transparent',
      color: leafColor,
    })
  }

  return nestedRects
}

/**
 * Finds the innermost hovered rect (leaf item or container header) at (mx, my).
 */
export function findInnermostRect(
  rects: NestedTreemapRect[],
  mx: number,
  my: number
): NestedTreemapRect | null {
  for (const r of rects) {
    if (mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height) {
      if (r.isContainer && r.children && r.children.length > 0) {
        // If cursor is on the container header bar, return the container itself
        if (my <= r.y + r.headerHeight + 2) {
          return r
        }
        // Otherwise, inspect child rects inside the container
        const childHit = findInnermostRect(r.children, mx, my)
        if (childHit) return childHit
      }
      return r
    }
  }
  return null
}
