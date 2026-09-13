import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  saveScanCache,
  loadScanCache,
  hasScanCache,
  clearScanCache,
  buildDirMtimeMap,
  countTreeStats,
} from '../electron/services/scanCache'
import {
  ensureDirectoryPathInTree,
  insertOrUpdateFileInTree,
  removePathFromTree,
  recalculateTreeSizes,
} from '../electron/services/scanWatcher'
import { performScan } from '../electron/workers/scanner.worker'
import type { FileNode } from '../shared/types'

describe('Storage Scan Persistent Cache & Incremental Engine', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fernum-cache-test-'))
  })

  afterEach(async () => {
    await clearScanCache(tempDir)
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignored
    }
  })

  it('saves and loads scan trees from persistent cache accurately', async () => {
    const mockTree: FileNode = {
      id: tempDir,
      name: 'root',
      path: tempDir,
      size: 1024,
      type: 'directory',
      category: 'other',
      lastModified: Date.now(),
      children: [
        {
          id: path.join(tempDir, 'file1.txt'),
          name: 'file1.txt',
          path: path.join(tempDir, 'file1.txt'),
          size: 1024,
          type: 'file',
          category: 'document',
          extension: '.txt',
          lastModified: Date.now(),
        },
      ],
    }

    expect(hasScanCache(tempDir)).toBe(false)
    await saveScanCache(tempDir, mockTree)
    expect(hasScanCache(tempDir)).toBe(true)

    const loaded = await loadScanCache(tempDir)
    expect(loaded).not.toBeNull()
    expect(loaded?.path).toBe(tempDir)
    expect(loaded?.size).toBe(1024)
    expect(loaded?.children?.length).toBe(1)
    expect(loaded?.children?.[0].name).toBe('file1.txt')

    const stats = countTreeStats(loaded!)
    expect(stats.totalFiles).toBe(1)
    expect(stats.totalBytes).toBe(1024)
  })

  it('builds directory mtime lookup map for fast incremental checks', () => {
    const subDirPath = path.join(tempDir, 'subfolder')
    const now = Date.now()
    const mockTree: FileNode = {
      id: tempDir,
      name: 'root',
      path: tempDir,
      size: 500,
      type: 'directory',
      category: 'other',
      lastModified: now - 1000,
      children: [
        {
          id: subDirPath,
          name: 'subfolder',
          path: subDirPath,
          size: 500,
          type: 'directory',
          category: 'other',
          lastModified: now,
          children: [],
        },
      ],
    }

    const mtimeMap = buildDirMtimeMap(mockTree)
    expect(mtimeMap.size).toBe(2)
    expect(mtimeMap.get(tempDir.toLowerCase())?.mtimeMs).toBe(now - 1000)
    expect(mtimeMap.get(subDirPath.toLowerCase())?.mtimeMs).toBe(now)
  })

  it('performs incremental scanning reusing cached directory nodes when timestamps match', async () => {
    // Create folder structure with 2 subdirs and files
    const dirA = path.join(tempDir, 'dirA')
    const dirB = path.join(tempDir, 'dirB')
    fs.mkdirSync(dirA, { recursive: true })
    fs.mkdirSync(dirB, { recursive: true })
    fs.writeFileSync(path.join(dirA, 'fileA.txt'), 'content A')
    fs.writeFileSync(path.join(dirB, 'fileB.txt'), 'content B')

    // Initial cold scan
    const coldScan = await performScan({ targetPath: tempDir })
    expect(coldScan).not.toBeNull()
    expect(coldScan?.children?.length).toBe(2)

    // Second scan with cachedRoot passed
    const warmScan = await performScan({
      targetPath: tempDir,
      cachedRoot: coldScan!,
    })

    expect(warmScan).not.toBeNull()
    expect(warmScan?.children?.length).toBe(2)
    expect(warmScan?.size).toBe(coldScan?.size)
  })

  it('updates in-memory tree when new files are added or deleted (watcher helpers)', () => {
    const rootNode: FileNode = {
      id: tempDir,
      name: 'root',
      path: tempDir,
      size: 0,
      type: 'directory',
      category: 'other',
      children: [],
    }

    // Insert new file into a subfolder
    const newFilePath = path.join(tempDir, 'docs', 'report.pdf')
    const newFileNode: FileNode = {
      id: newFilePath,
      name: 'report.pdf',
      path: newFilePath,
      size: 4096,
      type: 'file',
      category: 'document',
      extension: '.pdf',
      lastModified: Date.now(),
    }

    insertOrUpdateFileInTree(rootNode, newFileNode)
    recalculateTreeSizes(rootNode)

    expect(rootNode.children?.length).toBe(1)
    expect(rootNode.children?.[0].name).toBe('docs')
    expect(rootNode.children?.[0].size).toBe(4096)
    expect(rootNode.size).toBe(4096)

    // Remove file
    const removeResult = removePathFromTree(rootNode, newFilePath)
    expect(removeResult.removed).toBe(true)
    expect(removeResult.freedBytes).toBe(4096)

    recalculateTreeSizes(rootNode)
    expect(rootNode.size).toBe(0)
  })

  it('extracts subfolder caches instantly when a parent folder was already scanned', async () => {
    const parentDir = path.join(tempDir, 'user_home')
    const docsDir = path.join(parentDir, 'Documents')
    fs.mkdirSync(docsDir, { recursive: true })

    const parentTree: FileNode = {
      id: parentDir,
      name: 'user_home',
      path: parentDir,
      size: 8192,
      type: 'directory',
      category: 'other',
      lastModified: Date.now(),
      children: [
        {
          id: docsDir,
          name: 'Documents',
          path: docsDir,
          size: 8192,
          type: 'directory',
          category: 'other',
          lastModified: Date.now(),
          children: [
            {
              id: path.join(docsDir, 'report.docx'),
              name: 'report.docx',
              path: path.join(docsDir, 'report.docx'),
              size: 8192,
              type: 'file',
              category: 'document',
              extension: '.docx',
              lastModified: Date.now(),
            },
          ],
        },
      ],
    }

    // Save only the parent directory
    await saveScanCache(parentDir, parentTree)

    // Query the child "Documents" folder without ever having explicitly scanned it
    const extractedChild = await loadScanCache(docsDir)
    expect(extractedChild).not.toBeNull()
    expect(extractedChild?.name).toBe('Documents')
    expect(extractedChild?.path).toBe(docsDir)
    expect(extractedChild?.size).toBe(8192)
    expect(extractedChild?.children?.length).toBe(1)
    expect(extractedChild?.children?.[0].name).toBe('report.docx')
  })
})
