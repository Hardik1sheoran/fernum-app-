import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  ElectronAPI,
  ScanOptions,
  ScanProgress,
  FileNode,
  DriveInfo,
  QuickFolderInfo,
  FsOperationResult,
  BatchFsOperationResult,
  InstalledApp,
  ScanLeftoversResult,
  SearchQueryOptions,
  SearchResultItem,
  SearchResultResponse,
  SystemStats,
  SystemSpecs,
  ProcessStats,
  JunkCategoryType,
  JunkScanResult,
  JunkCleanResult,
} from '../shared/types'

const api: ElectronAPI = {
  // Scan IPC
  startScan: (options: ScanOptions): Promise<boolean> => {
    return ipcRenderer.invoke('scan:start', options)
  },
  cancelScan: (): Promise<boolean> => {
    return ipcRenderer.invoke('scan:cancel')
  },
  getCachedScan: (targetPath: string): Promise<FileNode | null> => {
    return ipcRenderer.invoke('scan:get-cache', targetPath)
  },
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: ScanProgress) => callback(progress)
    ipcRenderer.on('scan:progress', handler)
    return () => {
      ipcRenderer.removeListener('scan:progress', handler)
    }
  },
  onScanComplete: (callback: (rootNode: FileNode) => void) => {
    const handler = (_event: IpcRendererEvent, rootNode: FileNode) => callback(rootNode)
    ipcRenderer.on('scan:complete', handler)
    return () => {
      ipcRenderer.removeListener('scan:complete', handler)
    }
  },
  onScanPartial: (callback: (partialNode: FileNode) => void) => {
    const handler = (_event: IpcRendererEvent, partialNode: FileNode) => callback(partialNode)
    ipcRenderer.on('scan:partial', handler)
    return () => {
      ipcRenderer.removeListener('scan:partial', handler)
    }
  },
  onScanError: (callback: (error: string) => void) => {
    const handler = (_event: IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('scan:error', handler)
    return () => {
      ipcRenderer.removeListener('scan:error', handler)
    }
  },

  // File System Operations IPC
  getDrives: (): Promise<DriveInfo[]> => {
    return ipcRenderer.invoke('fs:get-drives')
  },
  getQuickAccessFolders: (): Promise<QuickFolderInfo[]> => {
    return ipcRenderer.invoke('fs:get-quick-folders')
  },
  selectFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('fs:select-folder')
  },
  revealInExplorer: (targetPath: string): Promise<FsOperationResult> => {
    return ipcRenderer.invoke('fs:reveal', targetPath)
  },
  moveToTrash: (targetPath: string): Promise<FsOperationResult> => {
    return ipcRenderer.invoke('fs:trash', targetPath)
  },
  deletePermanently: (targetPath: string): Promise<FsOperationResult> => {
    return ipcRenderer.invoke('fs:delete', targetPath)
  },
  trashMany: (targetPaths: string[]): Promise<BatchFsOperationResult> => {
    return ipcRenderer.invoke('fs:trash-many', targetPaths)
  },
  deleteManyPermanently: (targetPaths: string[]): Promise<BatchFsOperationResult> => {
    return ipcRenderer.invoke('fs:delete-many', targetPaths)
  },

  // Search IPC
  searchFiles: (
    options: SearchQueryOptions
  ): Promise<SearchResultItem[] | SearchResultResponse> => {
    return ipcRenderer.invoke('search:files', options)
  },

  // Applications IPC
  listInstalledApps: (forceRefresh?: boolean): Promise<InstalledApp[]> => {
    return ipcRenderer.invoke('apps:list', forceRefresh)
  },
  uninstallApp: (appId: string): Promise<{ success: boolean; message?: string }> => {
    return ipcRenderer.invoke('apps:uninstall', appId)
  },
  scanLeftovers: (appName: string, publisher?: string): Promise<ScanLeftoversResult> => {
    return ipcRenderer.invoke('apps:scan-leftovers', appName, publisher)
  },
  cleanLeftovers: (paths: string[]) => {
    return ipcRenderer.invoke('apps:clean-leftovers', paths)
  },

  // System Junk Cleaner IPC
  scanJunk: (categories?: JunkCategoryType[], forceRescan?: boolean): Promise<JunkScanResult> => {
    return ipcRenderer.invoke('cleaner:scan', categories, forceRescan)
  },
  cleanJunk: (categoryIds: JunkCategoryType[]): Promise<JunkCleanResult> => {
    return ipcRenderer.invoke('cleaner:clean', categoryIds)
  },

  // Monitor IPC
  getSystemStats: (): Promise<SystemStats> => {
    return ipcRenderer.invoke('monitor:get-stats')
  },
  getSystemSpecs: (): Promise<SystemSpecs> => {
    return ipcRenderer.invoke('monitor:get-system-specs')
  },
  subscribeSystemStats: (callback: (stats: SystemStats) => void) => {
    const handler = (_event: IpcRendererEvent, stats: SystemStats) => callback(stats)
    ipcRenderer.on('monitor:stats-tick', handler)
    return () => {
      ipcRenderer.removeListener('monitor:stats-tick', handler)
    }
  },
  subscribeProcesses: (callback: (processes: ProcessStats[]) => void) => {
    const handler = (_event: IpcRendererEvent, processes: ProcessStats[]) => callback(processes)
    ipcRenderer.on('monitor:processes-tick', handler)
    return () => {
      ipcRenderer.removeListener('monitor:processes-tick', handler)
    }
  },
  startMonitoring: (): Promise<boolean> => {
    return ipcRenderer.invoke('monitor:start-collecting')
  },
  stopMonitoring: (): Promise<boolean> => {
    return ipcRenderer.invoke('monitor:stop-collecting')
  },

  // System & Window IPC
  setTheme: (theme: 'dark' | 'light'): Promise<boolean> => {
    return ipcRenderer.invoke('app:set-theme', theme)
  },
  openExternalUrl: (url: string): Promise<boolean> => {
    return ipcRenderer.invoke('system:open-external', url)
  },
  onDeepLinkLicense: (callback: (licenseKey: string) => void) => {
    const handler = (_event: IpcRendererEvent, key: string) => callback(key)
    ipcRenderer.on('license:activated', handler)
    return () => {
      ipcRenderer.removeListener('license:activated', handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
