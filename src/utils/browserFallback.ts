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
  JunkCategoryType,
  JunkScanResult,
  JunkCleanResult,
  DuplicateScanOptions,
  DuplicateScanResult,
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
  let partialListeners: Array<(root: FileNode) => void> = []
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
        const state = await api<{ progress: ScanProgress; result: FileNode | null; partial?: FileNode | null }>('/api/scan/status')
        progressListeners.forEach((listener) => listener(state.progress))
        if (state.partial) {
          partialListeners.forEach((listener) => listener(state.partial!))
        }
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
    getCachedScan: async (targetPath: string) => {
      try {
        return await api<FileNode | null>(`/api/scan/cache?path=${encodeURIComponent(targetPath)}`)
      } catch {
        return null
      }
    },
    onScanProgress: (listener) => {
      progressListeners.push(listener)
      return () => { progressListeners = progressListeners.filter((item) => item !== listener) }
    },
    onScanComplete: (listener) => {
      completeListeners.push(listener)
      return () => { completeListeners = completeListeners.filter((item) => item !== listener) }
    },
    onScanPartial: (listener) => {
      partialListeners.push(listener)
      return () => { partialListeners = partialListeners.filter((item) => item !== listener) }
    },
    onScanError: (listener) => {
      errorListeners.push(listener)
      return () => { errorListeners = errorListeners.filter((item) => item !== listener) }
    },
    getDrives: () => api('/api/drives'),
    getQuickAccessFolders: () => api<QuickFolderInfo[]>('/api/quick-folders'),
    selectFolder: async () => {
      try {
        const res = await api<{ selectedPath: string | null }>('/api/select-folder')
        return res.selectedPath
      } catch {
        return null
      }
    },
    revealInExplorer: (targetPath: string) => api<FsOperationResult>('/api/reveal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPath }),
    }),
    moveToTrash: (targetPath: string) => api<FsOperationResult>('/api/trash', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPath }),
    }),
    deletePermanently: (targetPath: string) => api<FsOperationResult>('/api/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPath }),
    }),
    trashMany: (paths: string[]): Promise<BatchFsOperationResult> => api<BatchFsOperationResult>('/api/trash-many', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }),
    }),
    deleteManyPermanently: (paths: string[]): Promise<BatchFsOperationResult> => api<BatchFsOperationResult>('/api/delete-many', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }),
    }),
    searchFiles: (options: SearchQueryOptions) => api<SearchResultItem[] | SearchResultResponse>('/api/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options),
    }),
    scanDuplicates: (options?: DuplicateScanOptions): Promise<DuplicateScanResult> => api<DuplicateScanResult>('/api/duplicates/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options || {}),
    }),
    listInstalledApps: (forceRefresh?: boolean) => api<InstalledApp[]>(`/api/apps${forceRefresh ? '?refresh=true' : ''}`),
    uninstallApp: (appId: string) => api<{ success: boolean; message?: string }>('/api/apps/uninstall', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId }),
    }),
    scanLeftovers: (appName: string, publisher?: string): Promise<ScanLeftoversResult> => api<ScanLeftoversResult>('/api/apps/leftovers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appName, publisher }),
    }),
    cleanLeftovers: (paths: string[]): Promise<CleanLeftoversResult> => api<CleanLeftoversResult>('/api/apps/clean-leftovers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }),
    }),
    scanJunk: (categories?: JunkCategoryType[], forceRescan?: boolean): Promise<JunkScanResult> => api<JunkScanResult>('/api/cleaner/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categories, forceRescan }),
    }),
    cleanJunk: (categoryIds: JunkCategoryType[]): Promise<JunkCleanResult> => api<JunkCleanResult>('/api/cleaner/clean', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryIds }),
    }),
    getSystemStats: () => api<SystemStats>('/api/stats'),
    getSystemSpecs: () => api<SystemSpecs>('/api/specs'),
    subscribeSystemStats: (listener) => {
      void browserApi.getSystemStats().then(listener).catch(() => {})
      const timer = setInterval(() => { void browserApi.getSystemStats().then(listener).catch(() => {}) }, 1000)
      return () => clearInterval(timer)
    },
    subscribeProcesses: (listener: (procs: ProcessStats[]) => void) => {
      void browserApi.getSystemStats().then((s) => {
        if (s.topProcesses && s.topProcesses.length > 0) listener(s.topProcesses)
      }).catch(() => {})
      const timer = setInterval(() => {
        void browserApi.getSystemStats().then((s) => {
          if (s.topProcesses && s.topProcesses.length > 0) listener(s.topProcesses)
        }).catch(() => {})
      }, 3000)
      return () => clearInterval(timer)
    },
    startMonitoring: async () => true,
    stopMonitoring: async () => true,
    getDeviceId: async () => {
      let id = localStorage.getItem('fernum_device_id')
      if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}`
        localStorage.setItem('fernum_device_id', id)
      }
      return id
    },
    createCheckout: async (params) => {
      try {
        const res = await fetch('https://fernum-license-api.onrender.com/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        })
        const data = await res.json()
        if (data.checkout_url) {
          window.open(data.checkout_url, '_blank')
          return { success: true, checkout_url: data.checkout_url }
        }
        return { success: false, error: data.error || 'Failed to create checkout' }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Network error' }
      }
    },
    checkLicense: async (deviceId) => {
      const id = deviceId || localStorage.getItem('fernum_device_id') || 'browser-demo-device'
      try {
        const res = await fetch(`https://fernum-license-api.onrender.com/api/license/${encodeURIComponent(id)}`)
        const data = await res.json()
        return { success: true, licensed: Boolean(data.licensed), details: data }
      } catch {
        return { success: false, licensed: false, offline: true, error: 'Offline fallback' }
      }
    },
    setTheme: async () => true,
    openExternalUrl: async (url: string) => {
      window.open(url, '_blank')
      return true
    },
    onDeepLinkLicense: () => () => {},
    minimizeWindow: async () => {
      console.log('[Window] Minimize window requested')
      return true
    },
    maximizeWindow: async () => {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {})
        return false
      } else {
        await document.documentElement.requestFullscreen().catch(() => {})
        return true
      }
    },
    closeWindow: async () => {
      window.close()
      return true
    },
    isWindowMaximized: async () => Boolean(document.fullscreenElement),
  }

  window.electronAPI = browserApi
}
