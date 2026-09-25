import { create } from 'zustand'
import type { DriveInfo, QuickFolderInfo, FileNode, ScanProgress, CleanupQueueItem } from '@shared/types'

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
  searchQuery: string
  sidebarFilters: Record<string, boolean>
  cleanupQueue: CleanupQueueItem[]

  setDrives: (drives: DriveInfo[]) => void
  setQuickFolders: (folders: QuickFolderInfo[]) => void
  setSelectedDrive: (drive: DriveInfo | null) => void
  setScanProgress: (progress: ScanProgress) => void
  setRootNode: (node: FileNode | null) => void
  setCurrentViewNode: (node: FileNode | null) => void
  setSearchQuery: (query: string) => void
  toggleSidebarFilter: (key: string) => void
  resetSidebarFilters: () => void
  addToCleanupQueue: (item: CleanupQueueItem | FileNode) => void
  removeFromCleanupQueue: (idOrPath: string) => void
  clearCleanupQueue: () => void
  drillDown: (node: FileNode) => void
  drillUp: (targetIndex: number) => void
  resetView: () => void
  setIsLoadingDrives: (loading: boolean) => void
  deleteNodeFromTree: (targetPath: string) => { success: boolean; freedBytes: number }
  deleteNodesFromTree: (targetPaths: string[]) => { success: boolean; freedBytes: number; deletedCount: number }
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
  searchQuery: '',
  sidebarFilters: {
    trash: false,
    nodejs: false,
    xcode: false,
    buildArtifacts: false,
    android: false,
    docker: false,
    videos: false,
    diskImages: false,
    archives: false,
    iosBackups: false,
  },
  cleanupQueue: [
    { id: 'cleanup-android', name: 'Android build cache (.gradle)', path: 'C:\\Users\\hardi\\.gradle\\caches', size: 3050000000, category: 'Dev' },
    { id: 'cleanup-chrome', name: 'Google Chrome Profile Cache', path: 'C:\\Users\\hardi\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache', size: 889000000, category: 'Cache' },
    { id: 'cleanup-ollama', name: 'Ollama Model Weights Blob', path: 'C:\\Users\\hardi\\.ollama\\models\\blobs', size: 2020000000, category: 'Model' },
    { id: 'cleanup-node', name: 'Node.js global build cache', path: 'C:\\Users\\hardi\\AppData\\Local\\npm-cache', size: 1200000000, category: 'Dev' },
  ],

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
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleSidebarFilter: (key) =>
    set((state) => ({
      sidebarFilters: {
        ...state.sidebarFilters,
        [key]: !state.sidebarFilters[key],
      },
    })),
  resetSidebarFilters: () =>
    set({
      sidebarFilters: {
        trash: false,
        nodejs: false,
        xcode: false,
        buildArtifacts: false,
        android: false,
        docker: false,
        videos: false,
        diskImages: false,
        archives: false,
        iosBackups: false,
      },
    }),
  addToCleanupQueue: (item) =>
    set((state) => {
      const isFileNode = 'type' in item
      const newItem: CleanupQueueItem = isFileNode
        ? {
            id: item.id || item.path,
            name: item.name,
            path: item.path,
            size: item.size,
            category: item.category || 'File',
          }
        : item

      if (state.cleanupQueue.some((q) => q.path === newItem.path || q.id === newItem.id)) {
        return state
      }
      return { cleanupQueue: [...state.cleanupQueue, newItem] }
    }),
  removeFromCleanupQueue: (idOrPath) =>
    set((state) => ({
      cleanupQueue: state.cleanupQueue.filter((q) => q.id !== idOrPath && q.path !== idOrPath),
    })),
  clearCleanupQueue: () => set({ cleanupQueue: [] }),
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

  deleteNodesFromTree: (targetPaths: string[]) => {
    const { rootNode, currentViewNode, breadcrumbs, reclaimedBytes } = get()
    if (!rootNode || !targetPaths || targetPaths.length === 0) {
      return { success: false, freedBytes: 0, deletedCount: 0 }
    }

    if (targetPaths.includes(rootNode.path)) {
      const freed = rootNode.size
      set({
        rootNode: null,
        currentViewNode: null,
        breadcrumbs: [],
        reclaimedBytes: reclaimedBytes + freed,
      })
      return { success: true, freedBytes: freed, deletedCount: 1 }
    }

    const newRoot = cloneTree(rootNode)
    let totalFreed = 0
    let deletedCount = 0

    for (const targetPath of targetPaths) {
      const { deletedNode, freedBytes } = pruneNode(newRoot, targetPath)
      if (deletedNode) {
        totalFreed += freedBytes
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      const updatedViewNode = currentViewNode
        ? findNodeByPath(newRoot, currentViewNode.path) || newRoot
        : newRoot

      const updatedBreadcrumbs = breadcrumbs
        .map((b) => findNodeByPath(newRoot, b.path))
        .filter((b): b is FileNode => Boolean(b))

      set({
        rootNode: newRoot,
        currentViewNode: updatedViewNode,
        breadcrumbs: updatedBreadcrumbs.length > 0 ? updatedBreadcrumbs : [newRoot],
        reclaimedBytes: reclaimedBytes + totalFreed,
      })

      return { success: true, freedBytes: totalFreed, deletedCount }
    }

    return { success: false, freedBytes: 0, deletedCount: 0 }
  },
}))
