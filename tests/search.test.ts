import { describe, it, expect } from 'vitest'
import type { FileNode } from '../shared/types'
import {
  getCategoryFromExtension,
  searchFileNodeTree,
  sortSearchResults,
} from '../shared/searchUtils'

describe('Phase 5: Search Engine & Indexer Utilities', () => {
  it('correctly maps file extensions to file categories', () => {
    expect(getCategoryFromExtension('.mp4')).toBe('video')
    expect(getCategoryFromExtension('mkv')).toBe('video')
    expect(getCategoryFromExtension('iso')).toBe('archive')
    expect(getCategoryFromExtension('.zip')).toBe('archive')
    expect(getCategoryFromExtension('tar.gz')).toBe('archive')
    expect(getCategoryFromExtension('.pdf')).toBe('document')
    expect(getCategoryFromExtension('png')).toBe('image')
    expect(getCategoryFromExtension('ts')).toBe('code')
    expect(getCategoryFromExtension('py')).toBe('code')
    expect(getCategoryFromExtension('xyz123')).toBe('other')
    expect(getCategoryFromExtension('')).toBe('other')
  })

  const mockTree: FileNode = {
    id: 'root',
    name: 'C:',
    path: 'C:\\',
    size: 15 * 1024 * 1024 * 1024,
    type: 'directory',
    category: 'other',
    children: [
      {
        id: 'downloads',
        name: 'Downloads',
        path: 'C:\\Users\\User\\Downloads',
        size: 9 * 1024 * 1024 * 1024,
        type: 'directory',
        category: 'other',
        children: [
          {
            id: 'iso-file',
            name: 'Windows11_x64.iso',
            path: 'C:\\Users\\User\\Downloads\\Windows11_x64.iso',
            size: 5.5 * 1024 * 1024 * 1024, // 5.5 GB
            type: 'file',
            category: 'archive',
            extension: 'iso',
            lastModified: 1700000000000,
          },
          {
            id: 'zip-file',
            name: 'Dataset_Archive.zip',
            path: 'C:\\Users\\User\\Downloads\\Dataset_Archive.zip',
            size: 2.2 * 1024 * 1024 * 1024, // 2.2 GB
            type: 'file',
            category: 'archive',
            extension: 'zip',
            lastModified: 1710000000000,
          },
          {
            id: 'small-doc',
            name: 'notes.txt',
            path: 'C:\\Users\\User\\Downloads\\notes.txt',
            size: 12 * 1024, // 12 KB
            type: 'file',
            category: 'document',
            extension: 'txt',
            lastModified: 1720000000000,
          },
        ],
      },
      {
        id: 'videos',
        name: 'Videos',
        path: 'C:\\Users\\User\\Videos',
        size: 4 * 1024 * 1024 * 1024,
        type: 'directory',
        category: 'other',
        children: [
          {
            id: 'video-1',
            name: 'recording_holiday.mp4',
            path: 'C:\\Users\\User\\Videos\\recording_holiday.mp4',
            size: 3.8 * 1024 * 1024 * 1024, // 3.8 GB
            type: 'file',
            category: 'video',
            extension: 'mp4',
            lastModified: 1690000000000,
          },
          {
            id: 'small-photo',
            name: 'holiday_thumb.png',
            path: 'C:\\Users\\User\\Videos\\holiday_thumb.png',
            size: 450 * 1024, // 450 KB
            type: 'file',
            category: 'image',
            extension: 'png',
            lastModified: 1695000000000,
          },
        ],
      },
    ],
  }

  it('searches tree by substring query and returns matches sorted descending by size', () => {
    const results = searchFileNodeTree(mockTree, { query: 'holiday' })
    expect(results).toHaveLength(2)
    // recording_holiday.mp4 (3.8 GB) should precede holiday_thumb.png (450 KB)
    expect(results[0].name).toBe('recording_holiday.mp4')
    expect(results[1].name).toBe('holiday_thumb.png')
  })

  it('filters search results strictly by minimum file size', () => {
    // Files > 3 GB (1024^3 * 3)
    const results = searchFileNodeTree(mockTree, {
      query: '',
      minSizeBytes: 3 * 1024 * 1024 * 1024,
    })
    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('Windows11_x64.iso') // 5.5 GB
    expect(results[1].name).toBe('recording_holiday.mp4') // 3.8 GB
  })

  it('filters search results by category', () => {
    const results = searchFileNodeTree(mockTree, {
      query: '',
      category: 'archive',
    })
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.category === 'archive')).toBe(true)
    expect(results[0].name).toBe('Windows11_x64.iso')
    expect(results[1].name).toBe('Dataset_Archive.zip')
  })

  it('filters search results by specific extension', () => {
    const results = searchFileNodeTree(mockTree, {
      query: '',
      extension: 'zip',
    })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Dataset_Archive.zip')
  })

  it('sorts search results by name and date properly', () => {
    const allFiles = searchFileNodeTree(mockTree, { query: '' })
    expect(allFiles).toHaveLength(5)

    // Sort by name A-Z
    const sortedByName = sortSearchResults(allFiles, 'name', true)
    expect(sortedByName[0].name).toBe('Dataset_Archive.zip')

    // Sort by date newest first
    const sortedByDate = sortSearchResults(allFiles, 'date', false)
    expect(sortedByDate[0].name).toBe('notes.txt') // lastModified 1720000000000 is newest
  })

  it('marks results as truncated when directory crawl cap is reached before queue empties', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const { searchDiskFiles } = await import('../electron/ipc/search')

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fernum-search-test-'))
    try {
      // Create nested directory structure:
      // tempDir/dir1/dir2/dir3/file.txt
      const dir1 = path.join(tempDir, 'dir1')
      const dir2 = path.join(dir1, 'dir2')
      const dir3 = path.join(dir2, 'dir3')
      fs.mkdirSync(dir3, { recursive: true })
      fs.writeFileSync(path.join(dir3, 'target_document.txt'), 'hello world')

      // With maxDirs: 1, it will stop before reaching dir3
      const partialRes = await searchDiskFiles({
        targetPath: tempDir,
        query: 'target',
        maxDirs: 1,
      })

      expect(Array.isArray(partialRes)).toBe(false)
      if (!Array.isArray(partialRes)) {
        expect(partialRes.truncated).toBe(true)
        expect(Array.isArray(partialRes.items)).toBe(true)
      }

      // With generous maxDirs, it will explore everything and return an array
      const fullRes = await searchDiskFiles({
        targetPath: tempDir,
        query: 'target',
        maxDirs: 50,
      })

      expect(Array.isArray(fullRes)).toBe(true)
      if (Array.isArray(fullRes)) {
        expect(fullRes.length).toBe(1)
        expect(fullRes[0].name).toBe('target_document.txt')
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('marks results as truncated when the result cap stops an unfinished crawl', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const { searchDiskFiles } = await import('../electron/ipc/search')
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fernum-search-results-test-'))

    try {
      for (const name of ['one', 'two', 'three']) {
        const dir = path.join(tempDir, name)
        fs.mkdirSync(dir)
        fs.writeFileSync(path.join(dir, 'match.txt'), name)
      }

      const result = await searchDiskFiles({ targetPath: tempDir, query: 'match', limit: 1, maxDirs: 50 })
      expect(Array.isArray(result)).toBe(false)
      if (!Array.isArray(result)) {
        expect(result.truncated).toBe(true)
        expect(result.items).toHaveLength(1)
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
