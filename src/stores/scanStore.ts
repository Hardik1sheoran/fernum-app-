import { create } from 'zustand'
import type { DriveInfo, QuickFolderInfo, FileNode, ScanProgress } from '@shared/types'

function cloneTree(node: FileNode): FileNode {
  return {
    ...node,
    children: node.children ? node.children.map(cloneTree) : undefined,
  }
}

function findNodeByPath(root: FileNode, targetPath: string): FileNode | null {
  if (root.path === targetPath) return root
  if (!root.children) return null
  for (const child of root.children) {
    const found = findNodeByPath(child, targetPath)
    if (found) return found
  }
  return null
}

function pruneNode(
  parent: FileNode,
  targetPath: string
): { deletedNode: FileNode | null; freedBytes: number } {
  if (!parent.children) return { deletedNode: null, freedBytes: 0 }

  const index = parent.children.findIndex((c) => c.path === targetPath)
  if (index !== -1) {
    const [deletedNode] = parent.children.splice(index, 1)
    const freed = deletedNode.size
    parent.size = Math.max(0, parent.size - freed)
    return { deletedNode, freedBytes: freed }
  }

  for (const child of parent.children) {
    if (child.type === 'directory') {
      const result = pruneNode(child, targetPath)
      if (result.deletedNode) {
        parent.size = Math.max(0, parent.size - result.freedBytes)
        return result
      }
    }
  }

  return { deletedNode: null, freedBytes: 0 }
}

interface ScanState {
  drives: DriveInfo[]
  quickFolders: QuickFolderInfo[]
  selectedDrive: DriveInfo | null
  scanProgress: ScanProgress
  rootNode: FileNode | null
  currentViewNode: FileNode | null
  breadcrumbs: FileNode[]
  isLoadingDrives: boolean
  reclaimedBytes: number

  setDrives: (drives: DriveInfo[]) => void
  setQuickFolders: (folders: QuickFolderInfo[]) => void
  setSelectedDrive: (drive: DriveInfo | null) => void
  setScanProgress: (progress: ScanProgress) => void
  setRootNode: (node: FileNode | null) => void
  setCurrentViewNode: (node: FileNode | null) => void
  drillDown: (node: FileNode) => void
  drillUp: (targetIndex: number) => void
  resetView: () => void
  setIsLoadingDrives: (loading: boolean) => void
  deleteNodeFromTree: (targetPath: string) => { success: boolean; freedBytes: number }
}

export const useScanStore = create<ScanState>((set, get) => ({
  drives: [],
  quickFolders: [],
  selectedDrive: null,
  scanProgress: {
    status: 'idle',
    currentPath: '',
    scannedFiles: 0,
    scannedBytes: 0,
    percentage: 0,
  },
  rootNode: null,
  currentViewNode: null,
  breadcrumbs: [],
  isLoadingDrives: false,
  reclaimedBytes: 0,

  setDrives: (drives) =>
    set((state) => ({
      drives,
      selectedDrive: state.selectedDrive || drives[0] || null,
    })),
  setQuickFolders: (quickFolders) => set({ quickFolders }),
  setSelectedDrive: (selectedDrive) => set({ selectedDrive }),
  setScanProgress: (scanProgress) => set({ scanProgress }),
  setRootNode: (rootNode) =>
    set({
      rootNode,
      currentViewNode: rootNode,
      breadcrumbs: rootNode ? [rootNode] : [],
    }),
  setCurrentViewNode: (currentViewNode) => set({ currentViewNode }),
  drillDown: (node) =>
    set((state) => ({
      currentViewNode: node,
      breadcrumbs: [...state.breadcrumbs, node],
    })),
  drillUp: (targetIndex) =>
    set((state) => {
      const nextBreadcrumbs = state.breadcrumbs.slice(0, targetIndex + 1)
      const targetNode = nextBreadcrumbs[nextBreadcrumbs.length - 1] || null
      return {
        breadcrumbs: nextBreadcrumbs,
        currentViewNode: targetNode,
      }
    }),
  resetView: () =>
    set((state) => ({
      currentViewNode: state.rootNode,
      breadcrumbs: state.rootNode ? [state.rootNode] : [],
    })),
  setIsLoadingDrives: (isLoadingDrives) => set({ isLoadingDrives }),

  deleteNodeFromTree: (targetPath: string) => {
    const { rootNode, currentViewNode, breadcrumbs, reclaimedBytes } = get()
    if (!rootNode) return { success: false, freedBytes: 0 }

    if (rootNode.path === targetPath) {
      const freed = rootNode.size
      set({
        rootNode: null,
        currentViewNode: null,
        breadcrumbs: [],
        reclaimedBytes: reclaimedBytes + freed,
      })
      return { success: true, freedBytes: freed }
    }

    const newRoot = cloneTree(rootNode)
    const { deletedNode, freedBytes } = pruneNode(newRoot, targetPath)

    if (deletedNode) {
      // Re-resolve current view node in the updated tree
      const updatedViewNode = currentViewNode
        ? findNodeByPath(newRoot, currentViewNode.path) || newRoot
        : newRoot

      // Re-resolve breadcrumbs in the updated tree
      const updatedBreadcrumbs = breadcrumbs
        .map((b) => findNodeByPath(newRoot, b.path))
        .filter((b): b is FileNode => Boolean(b))

      set({
        rootNode: newRoot,
        currentViewNode: updatedViewNode,
        breadcrumbs: updatedBreadcrumbs.length > 0 ? updatedBreadcrumbs : [newRoot],
        reclaimedBytes: reclaimedBytes + freedBytes,
      })

      return { success: true, freedBytes }
    }

    return { success: false, freedBytes: 0 }
  },
}))
