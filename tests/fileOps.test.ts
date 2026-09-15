import { describe, it, expect, beforeEach } from 'vitest'
import { useScanStore } from '../src/stores/scanStore'
import { isProtectedSystemPath } from '../shared/pathSecurity'
import type { FileNode } from '../shared/types'

describe('File Operations & Dynamic Tree Pruning', () => {
  beforeEach(() => {
    useScanStore.setState({
      rootNode: null,
      currentViewNode: null,
      breadcrumbs: [],
      reclaimedBytes: 0,
    })
  })

  it('correctly prunes a deleted node and subtracts size from all ancestors', () => {
    const file1: FileNode = {
      id: 'C:\\test\\sub\\video.mp4',
      name: 'video.mp4',
      path: 'C:\\test\\sub\\video.mp4',
      size: 500,
      type: 'file',
      category: 'video',
    }

    const file2: FileNode = {
      id: 'C:\\test\\sub\\image.png',
      name: 'image.png',
      path: 'C:\\test\\sub\\image.png',
      size: 300,
      type: 'file',
      category: 'image',
    }

    const subDir: FileNode = {
      id: 'C:\\test\\sub',
      name: 'sub',
      path: 'C:\\test\\sub',
      size: 800,
      type: 'directory',
      category: 'other',
      children: [file1, file2],
    }

    const root: FileNode = {
      id: 'C:\\test',
      name: 'test',
      path: 'C:\\test',
      size: 800,
      type: 'directory',
      category: 'other',
      children: [subDir],
    }

    useScanStore.getState().setRootNode(root)
    useScanStore.getState().setCurrentViewNode(subDir)

    // Delete file1 (500 bytes)
    const result = useScanStore.getState().deleteNodeFromTree('C:\\test\\sub\\video.mp4')

    expect(result.success).toBe(true)
    expect(result.freedBytes).toBe(500)

    const updatedRoot = useScanStore.getState().rootNode!
    expect(updatedRoot.size).toBe(300)

    const updatedSub = updatedRoot.children![0]
    expect(updatedSub.size).toBe(300)
    expect(updatedSub.children!.length).toBe(1)
    expect(updatedSub.children![0].name).toBe('image.png')

    expect(useScanStore.getState().reclaimedBytes).toBe(500)
  })

  it('identifies and protects critical Windows system directories from deletion', () => {
    expect(isProtectedSystemPath('C:\\')).toBe(true)
    expect(isProtectedSystemPath('c:')).toBe(true)
    expect(isProtectedSystemPath('D:\\')).toBe(true)
    expect(isProtectedSystemPath('C:\\Windows')).toBe(true)
    expect(isProtectedSystemPath('C:\\Windows\\System32')).toBe(true)
    expect(isProtectedSystemPath('C:\\Program Files')).toBe(true)
    expect(isProtectedSystemPath('C:\\Program Files (x86)')).toBe(true)
    expect(isProtectedSystemPath('C:\\Users')).toBe(true)
    expect(isProtectedSystemPath('C:\\System Volume Information')).toBe(true)
    expect(isProtectedSystemPath('C:\\$Recycle.Bin')).toBe(true)

    // Normal safe user paths must NOT be protected
    expect(isProtectedSystemPath('C:\\Users\\User\\Downloads\\movie.mp4')).toBe(false)
    expect(isProtectedSystemPath('D:\\Projects\\node_modules')).toBe(false)
  })

  it('correctly batch prunes multiple deleted nodes in a single atomic pass', () => {
    const file1: FileNode = {
      id: 'C:\\test\\sub\\a.txt',
      name: 'a.txt',
      path: 'C:\\test\\sub\\a.txt',
      size: 100,
      type: 'file',
      category: 'document',
    }
    const file2: FileNode = {
      id: 'C:\\test\\sub\\b.txt',
      name: 'b.txt',
      path: 'C:\\test\\sub\\b.txt',
      size: 200,
      type: 'file',
      category: 'document',
    }
    const file3: FileNode = {
      id: 'C:\\test\\sub\\c.txt',
      name: 'c.txt',
      path: 'C:\\test\\sub\\c.txt',
      size: 300,
      type: 'file',
      category: 'document',
    }
    const subDir: FileNode = {
      id: 'C:\\test\\sub',
      name: 'sub',
      path: 'C:\\test\\sub',
      size: 600,
      type: 'directory',
      category: 'other',
      children: [file1, file2, file3],
    }
    const root: FileNode = {
      id: 'C:\\test',
      name: 'test',
      path: 'C:\\test',
      size: 600,
      type: 'directory',
      category: 'other',
      children: [subDir],
    }

    useScanStore.getState().setRootNode(root)

    // Batch prune file1 (100) and file3 (300)
    const result = useScanStore.getState().deleteNodesFromTree([
      'C:\\test\\sub\\a.txt',
      'C:\\test\\sub\\c.txt',
    ])

    expect(result.success).toBe(true)
    expect(result.deletedCount).toBe(2)
    expect(result.freedBytes).toBe(400)

    const updatedRoot = useScanStore.getState().rootNode!
    expect(updatedRoot.size).toBe(200)

    const updatedSub = updatedRoot.children![0]
    expect(updatedSub.size).toBe(200)
    expect(updatedSub.children!.length).toBe(1)
    expect(updatedSub.children![0].name).toBe('b.txt')

    expect(useScanStore.getState().reclaimedBytes).toBe(400)
  })
})

