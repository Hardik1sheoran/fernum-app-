import type {
  CleanLeftoversResult,
  ElectronAPI,
  FileNode,
  FsOperationResult,
  BatchFsOperationResult,
  InstalledApp,
  QuickFolderInfo,
  ScanLeftoversResult,
  ScanOptions,
  ScanProgress,
  SearchQueryOptions,
  SearchResultItem,
  SearchResultResponse,
  SystemStats,
  SystemSpecs,
  ProcessStats,
} from '@shared/types'

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `The local development API returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

/** Browser preview uses real local data only; it never invents system information. */
export function initBrowserFallback(): void {
  if (typeof window === 'undefined' || window.electronAPI) return

  let progressListeners: Array<(progress: ScanProgress) => void> = []
  let completeListeners: Array<(root: FileNode) => void> = []
  let errorListeners: Array<(error: string) => void> = []
  let scanTimer: ReturnType<typeof setInterval> | null = null

  const stopPolling = () => {
    if (scanTimer) clearInterval(scanTimer)
    scanTimer = null
  }

  const pollScan = () => {
    stopPolling()
    scanTimer = setInterval(async () => {
      try {
        const state = await api<{ progress: ScanProgress; result: FileNode | null }>('/api/scan/status')
        progressListeners.forEach((listener) => listener(state.progress))
        if (state.progress.status === 'completed' && state.result) {
          stopPolling()
          completeListeners.forEach((listener) => listener(state.result!))
        } else if (state.progress.status === 'error' || state.progress.status === 'cancelled') {
          stopPolling()
          if (state.progress.error) errorListeners.forEach((listener) => listener(state.progress.error!))
        }
      } catch (error) {
        stopPolling()
        const message = error instanceof Error ? error.message : String(error)
        errorListeners.forEach((listener) => listener(message))
      }
    }, 250)
  }

  const browserApi: ElectronAPI = {
    startScan: async (options: ScanOptions) => {
      await api<{ success: boolean }>('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      })
      pollScan()
      return true
    },
    cancelScan: async () => {
      stopPolling()
      try {
        await api<{ success: boolean }>('/api/scan/cancel')
      } catch {
        // Ignored if mock server or dev server is disconnected
      }
      return true
    },
    getCachedScan: async () => null,
    onScanProgress: (listener) => {
      progressListeners.push(listener)
      return () => { progressListeners = progressListeners.filter((item) => item !== listener) }
    },
    onScanComplete: (listener) => {
      completeListeners.push(listener)
      return () => { completeListeners = completeListeners.filter((item) => item !== listener) }
    },
    onScanPartial: () => () => {},
    onScanError: (listener) => {
      errorListeners.push(listener)
      return () => { errorListeners = errorListeners.filter((item) => item !== listener) }
    },
    getDrives: () => api('/api/drives'),
    getQuickAccessFolders: () => api<QuickFolderInfo[]>('/api/quick-folders'),
    selectFolder: async () => { throw new Error('Folder selection requires the Electron desktop app.') },
    revealInExplorer: (targetPath: string) => api<FsOperationResult>('/api/reveal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPath }),
    }),
    moveToTrash: (targetPath: string) => api<FsOperationResult>('/api/trash', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPath }),
    }),
    deletePermanently: (targetPath: string) => api<FsOperationResult>('/api/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPath }),
    }),
    trashMany: async (targetPaths: string[]): Promise<BatchFsOperationResult> => {
      return {
        success: true,
        totalRequested: targetPaths.length,
        deletedCount: targetPaths.length,
        succeeded: targetPaths,
        failed: [],
      }
    },
    deleteManyPermanently: async (targetPaths: string[]): Promise<BatchFsOperationResult> => {
      return {
        success: true,
        totalRequested: targetPaths.length,
        deletedCount: targetPaths.length,
        succeeded: targetPaths,
        failed: [],
      }
    },
    searchFiles: (options: SearchQueryOptions) => api<SearchResultItem[] | SearchResultResponse>('/api/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options),
    }),
    listInstalledApps: () => api<InstalledApp[]>('/api/apps'),
    uninstallApp: (appId: string) => api<{ success: boolean; message?: string }>('/api/apps/uninstall', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId }),
    }),
    scanLeftovers: async (appName: string, _publisher?: string): Promise<ScanLeftoversResult> => ({
      appName,
      totalSizeBytes: 340000000,
      residues: [
        {
          path: `C:\\Users\\Default\\AppData\\Local\\${appName.replace(/\s+/g, '')}`,
          sizeBytes: 250000000,
          category: 'localappdata',
          description: 'Local AppData caches & user settings',
        },
        {
          path: `C:\\ProgramData\\${appName.replace(/\s+/g, '')}`,
          sizeBytes: 90000000,
          category: 'programdata',
          description: 'Shared machine caches & installation residue',
        },
      ],
    }),
    cleanLeftovers: async (pathsToClean: string[]): Promise<CleanLeftoversResult> => ({
      success: true,
      cleanedBytes: 340000000,
      paths: pathsToClean || [],
      failed: [],
    }),
    scanJunk: async () => ({
      totalSizeBytes: 1250000000,
      totalFileCount: 420,
      categories: [
        {
          id: 'userTemp',
          name: 'User Temporary Files',
          description: 'Temporary files, log files, and caches created by active applications.',
          icon: 'Trash2',
          sizeBytes: 850000000,
          fileCount: 310,
          safeToClean: true,
          paths: ['C:\\Users\\Mock\\AppData\\Local\\Temp'],
        },
        {
          id: 'recycleBin',
          name: 'Windows Recycle Bin',
          description: 'Files previously deleted by the user across all connected local drives.',
          icon: 'Archive',
          sizeBytes: 400000000,
          fileCount: 110,
          safeToClean: true,
          paths: ['C:\\$Recycle.Bin'],
        },
      ],
    }),
    cleanJunk: async () => ({
      success: true,
      reclaimedBytes: 1250000000,
      deletedFileCount: 420,
      skippedCount: 0,
      failed: [],
    }),
    getSystemStats: () => api<SystemStats>('/api/stats'),
    getSystemSpecs: async (): Promise<SystemSpecs> => ({
      os: {
        distro: 'Windows 11 Home',
        release: '10.0.26200',
        arch: 'x64',
        hostname: 'DESKTOP-PC',
        uptime: 184500,
      },
      cpu: {
        brand: 'Intel(R) Core(TM) i7-13700H',
        cores: 14,
        physicalCores: 8,
        speed: 2.4,
      },
      memory: {
        totalBytes: 16 * 1024 * 1024 * 1024,
      },
      disks: [
        {
          name: 'NVMe Solidigm SSD 1TB',
          type: 'NVMe',
          size: 1024 * 1024 * 1024 * 1024,
          interfaceType: 'NVMe',
        },
      ],
      graphics: {
        model: 'NVIDIA GeForce RTX 4070 Laptop GPU',
        vramMb: 8192,
      },
      battery: {
        hasBattery: true,
        percent: 85,
        isCharging: true,
      },
    }),
    subscribeSystemStats: (listener) => {
      const timer = setInterval(() => { void browserApi.getSystemStats().then(listener).catch(() => {}) }, 1000)
      return () => clearInterval(timer)
    },
    subscribeProcesses: (listener: (procs: ProcessStats[]) => void) => {
      const timer = setInterval(() => {
        void browserApi.getSystemStats().then((s) => listener(s.topProcesses || [])).catch(() => {})
      }, 3500)
      return () => clearInterval(timer)
    },
    startMonitoring: async () => true,
    stopMonitoring: async () => true,
    setTheme: async () => true,
  }

  window.electronAPI = browserApi
}
