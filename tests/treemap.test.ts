import { describe, it, expect } from 'vitest'
import type { FileNode } from '../shared/types'
import {
  computeTreemapLayout,
  computeNestedTreemapLayout,
  findInnermostRect,
  formatBytes,
} from '../src/components/Treemap/treemapLayout'

describe('Squarified Treemap Layout Engine', () => {
  it('returns empty array when bounds or nodes are empty', () => {
    expect(computeTreemapLayout([], { width: 800, height: 600 })).toEqual([])
    expect(computeTreemapLayout([], { width: 0, height: 0 })).toEqual([])
  })

  it('formats byte sizes correctly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.00 KB')
    expect(formatBytes(1024 * 1024 * 50)).toBe('50.0 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 4.5)).toBe('4.50 GB')
  })

  it('tiles a single file across 100% of the bounding box', () => {
    const nodes: FileNode[] = [
      {
        id: 'file-1',
        name: 'movie.mp4',
        path: 'C:\\Videos\\movie.mp4',
        size: 5000,
        type: 'file',
        category: 'video',
      },
    ]

    const rects = computeTreemapLayout(nodes, { width: 800, height: 600 })
    expect(rects.length).toBe(1)
    expect(rects[0].x).toBe(0)
    expect(rects[0].y).toBe(0)
    expect(rects[0].width).toBe(800)
    expect(rects[0].height).toBe(600)
    expect(rects[0].color).toBe('#8b5cf6') // Video violet
    expect(rects[0].percentageOfParent).toBe(100)
  })

  it('tiles multiple items without overlapping and bounded within viewport', () => {
    const nodes: FileNode[] = [
      { id: '1', name: 'big_video.mp4', path: '/1', size: 600, type: 'file', category: 'video' },
      { id: '2', name: 'photos', path: '/2', size: 300, type: 'directory', category: 'other' },
      { id: '3', name: 'code.ts', path: '/3', size: 100, type: 'file', category: 'code' },
    ]

    const bounds = { width: 1000, height: 500 }
    const rects = computeTreemapLayout(nodes, bounds)

    expect(rects.length).toBe(3)

    // Check all rects lie strictly within [0, 1000] x [0, 500]
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.width).toBeLessThanOrEqual(bounds.width + 0.01)
      expect(r.y + r.height).toBeLessThanOrEqual(bounds.height + 0.01)
      expect(r.width).toBeGreaterThan(0)
      expect(r.height).toBeGreaterThan(0)
    }

    // Check total area roughly matches viewport area
    const totalRectArea = rects.reduce((sum, r) => sum + r.width * r.height, 0)
    const expectedArea = bounds.width * bounds.height
    expect(Math.abs(totalRectArea - expectedArea)).toBeLessThan(1)
  })

  it('aggregates small nodes when exceeding MAX_VISIBLE_NODES threshold', () => {
    const nodes: FileNode[] = []
    for (let i = 0; i < 200; i++) {
      nodes.push({
        id: `file-${i}`,
        name: `file-${i}.txt`,
        path: `/path/${i}`,
        size: 200 - i,
        type: 'file',
        category: 'document',
      })
    }

    const rects = computeTreemapLayout(nodes, { width: 800, height: 600 })
    // MAX_VISIBLE_NODES is 120 + 1 aggregated node
    expect(rects.length).toBe(121)
    const aggregateRect = rects.find((r) => r.node.id === '__aggregated_others__')
    expect(aggregateRect).toBeDefined()
    expect(aggregateRect?.node.name).toContain('Other (80 items)')
  })

  describe('Multi-Level Nested Squarified Treemap (DissectMac Style)', () => {
    it('recursively computes multiple directory nesting levels simultaneously', () => {
      const hierarchy: FileNode[] = [
        {
          id: 'dir-library',
          name: 'Library',
          path: '/Library',
          size: 10000,
          type: 'directory',
          category: 'other',
          children: [
            {
              id: 'dir-containers',
              name: 'Containers',
              path: '/Library/Containers',
              size: 8000,
              type: 'directory',
              category: 'other',
              children: [
                {
                  id: 'dir-app',
                  name: 'com.apple.mediaanalysisd',
                  path: '/Library/Containers/com.apple.mediaanalysisd',
                  size: 7000,
                  type: 'directory',
                  category: 'other',
                  children: [
                    {
                      id: 'dir-data',
                      name: 'Data',
                      path: '/Library/Containers/com.apple.mediaanalysisd/Data',
                      size: 6000,
                      type: 'directory',
                      category: 'other',
                      children: [
                        {
                          id: 'file-cache',
                          name: 'cache.db',
                          path: '/Library/Containers/com.apple.mediaanalysisd/Data/cache.db',
                          size: 5500,
                          type: 'file',
                          category: 'cache',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]

      const bounds = { x: 0, y: 0, width: 800, height: 600 }
      const nested = computeNestedTreemapLayout(hierarchy, bounds, 0, { maxDepth: 4 })

      expect(nested.length).toBe(1)
      const topLevel = nested[0]
      expect(topLevel.node.name).toBe('Library')
      expect(topLevel.isContainer).toBe(true)
      expect(topLevel.headerHeight).toBeGreaterThan(0)
      expect(topLevel.children).toBeDefined()
      expect(topLevel.children!.length).toBe(1)

      // Level 1: Containers
      const level1 = topLevel.children![0]
      expect(level1.node.name).toBe('Containers')
      expect(level1.isContainer).toBe(true)
      expect(level1.children).toBeDefined()

      // Level 2: com.apple.mediaanalysisd
      const level2 = level1.children![0]
      expect(level2.node.name).toBe('com.apple.mediaanalysisd')
      expect(level2.isContainer).toBe(true)
      expect(level2.children).toBeDefined()

      // Level 3: Data
      const level3 = level2.children![0]
      expect(level3.node.name).toBe('Data')
      expect(level3.isContainer).toBe(true)
      expect(level3.children).toBeDefined()

      // Level 4: Leaf file (cache.db)
      const level4 = level3.children![0]
      expect(level4.node.name).toBe('cache.db')
      expect(level4.isContainer).toBe(false)
      expect(level4.color).toBe('#64748b') // Cache color
    })

    it('findInnermostRect correctly selects deep leaves and container headers', () => {
      const hierarchy: FileNode[] = [
        {
          id: 'dir-root',
          name: 'RootFolder',
          path: '/root',
          size: 1000,
          type: 'directory',
          category: 'other',
          children: [
            {
              id: 'file-inside',
              name: 'inner.mp4',
              path: '/root/inner.mp4',
              size: 900,
              type: 'file',
              category: 'video',
            },
          ],
        },
      ]

      const bounds = { x: 0, y: 0, width: 500, height: 500 }
      const layout = computeNestedTreemapLayout(hierarchy, bounds, 0, { maxDepth: 2 })

      // Hover over the header strip (y = 5) of the container
      const hitHeader = findInnermostRect(layout, 20, 5)
      expect(hitHeader).toBeDefined()
      expect(hitHeader?.node.name).toBe('RootFolder')

      // Hover inside the content area where inner.mp4 is located (e.g. x = 250, y = 250)
      const hitChild = findInnermostRect(layout, 250, 250)
      expect(hitChild).toBeDefined()
      expect(hitChild?.node.name).toBe('inner.mp4')
    })
  })
})
