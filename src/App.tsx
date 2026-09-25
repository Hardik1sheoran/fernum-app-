import React, { useEffect, useState, useCallback } from 'react'
import { Header } from './components/shared/Header'
import { TabNavigation, type TabKey } from './components/shared/TabNavigation'
import { DrivePicker } from './components/DrivePicker/DrivePicker'
import { TreemapCanvas } from './components/Treemap/TreemapCanvas'
import { JunkCleaner } from './components/Cleaner/JunkCleaner'
import { DuplicateFinder } from './components/Duplicates/DuplicateFinder'
import { AppsList } from './components/AppsList/AppsList'
import { SearchPanel } from './components/Search/SearchPanel'
import { MonitorDashboard } from './components/Monitor/MonitorDashboard'
import { ExclusionsModal } from './components/shared/ExclusionsModal'
import { PrivacyModal } from './components/shared/PrivacyModal'
import { UpgradeModal } from './components/shared/UpgradeModal'
import { useScanStore } from './stores/scanStore'
import { useSettingsStore } from './stores/settingsStore'
import { useLicenseStore } from './stores/licenseStore'
import { useTheme } from './hooks/useTheme'
import { RainbowMarblingCanvas } from './components/RainbowMarbling/RainbowMarblingCanvas'
import { AuroraCanvas } from './components/Aurora/AuroraCanvas'
import { DEMO_ROOT_NODE } from './components/Treemap/demoTreeData'
import type { DriveInfo, QuickFolderInfo, ScanProgress, FileNode } from '@shared/types'

export const App: React.FC = () => {
  const { theme } = useTheme() // Initialize theme class on documentElement
  const [activeTab, setActiveTab] = useState<TabKey>('storage')
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(new Set(['storage']))
  const [isExclusionsOpen, setIsExclusionsOpen] = useState(false)
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false)
  const [driveError, setDriveError] = useState<string | null>(null)

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev
      const next = new Set(prev)
      next.add(activeTab)
      return next
    })
  }, [activeTab])

  useEffect(() => {
    console.log(`[PERF] App interactive: ${performance.now().toFixed(1)} ms`)
  }, [])

  const handleSelectTab = useCallback((tab: TabKey) => {
    const t0 = performance.now()
    const fromTab = activeTab
    setActiveTab(tab)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        console.log(`[PERF] Tab switch ${fromTab} -> ${tab}: ${(performance.now() - t0).toFixed(1)} ms`)
      })
    })
  }, [activeTab])

  const {
    drives,
    quickFolders,
    selectedDrive,
    scanProgress,
    rootNode,
    setRootNode,
    currentViewNode,
    breadcrumbs,
    setDrives,
    setQuickFolders,
    setSelectedDrive,
    setScanProgress,
    drillDown,
    drillUp,
    resetView,
    setIsLoadingDrives,
  } = useScanStore()

  const handleStartScan = useCallback(async (drive: DriveInfo, forceRescan = false, deepScan = false) => {
    if (window.electronAPI) {
      let hasWarmCached = false
      const isPro = useSettingsStore.getState().isPro || useLicenseStore.getState().isPro

      if (!forceRescan && !deepScan && window.electronAPI.getCachedScan) {
        try {
          const cached = await window.electronAPI.getCachedScan(drive.path)
          // If user upgraded to Pro, but cached result was capped under Free tier, bypass old cache to re-scan in full
          if (cached && !(isPro && cached.capped) && cached.children && cached.children.length > 0) {
            hasWarmCached = true
            setRootNode(cached)
            setScanProgress({
              status: 'completed',
              currentPath: drive.path,
              scannedFiles: cached.children?.length || 0,
              scannedBytes: cached.size,
              percentage: 100,
              capped: cached.capped,
              cappedAtBytes: cached.cappedAtBytes,
            })
          }
        } catch {
          // Fall back to standard scan UI
        }
      }

      if (!hasWarmCached) {
        setRootNode(null)
        setScanProgress({
          status: 'scanning',
          currentPath: drive.path,
          scannedFiles: 0,
          scannedBytes: 0,
          percentage: 0,
          capped: false,
        })
      }

      const { excludedPaths } = useSettingsStore.getState()
      try {
        const started = await window.electronAPI.startScan({
          targetPath: drive.path,
          excludePaths: deepScan ? [] : excludedPaths,
          forceRescan,
          deepScan,
          isPro,
        })
        if (!started) throw new Error('The scanner could not start.')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setScanProgress({
          status: 'error',
          currentPath: drive.path,
          scannedFiles: 0,
          scannedBytes: 0,
          percentage: 0,
          error: message,
        })
      }
    } else {
      // Browser mode: simulate lively scan progress
      setScanProgress({
        status: 'scanning',
        currentPath: drive.path,
        scannedFiles: 0,
        scannedBytes: 0,
        percentage: 0,
      })
      let p = 0
      const timer = setInterval(() => {
        p += 25
        setScanProgress({
          status: 'scanning',
          currentPath: `${drive.path}Users\\hardi\\AppData...`,
          scannedFiles: Math.round((p / 100) * 14200),
          scannedBytes: Math.round((p / 100) * (drive.usedBytes || 225 * 1024 ** 3)),
          percentage: p,
        })
        if (p >= 100) {
          clearInterval(timer)
          setRootNode(DEMO_ROOT_NODE)
          setScanProgress({
            status: 'completed',
            currentPath: drive.path,
            scannedFiles: 14200,
            scannedBytes: drive.usedBytes || 225 * 1024 ** 3,
            percentage: 100,
          })
        }
      }, 150)
    }
  }, [setRootNode, setScanProgress])

  const handleSelectDrive = useCallback((drive: DriveInfo) => {
    setSelectedDrive(drive)
    handleStartScan(drive, false, false)
  }, [setSelectedDrive, handleStartScan])

  const loadDrives = useCallback(async () => {
    setIsLoadingDrives(true)
    setDriveError(null)

    const fallbackDrive: DriveInfo = {
      id: 'C:',
      name: 'Local Disk (C:) (System)',
      path: 'C:\\',
      totalBytes: 512 * 1024 * 1024 * 1024,
      freeBytes: 120 * 1024 * 1024 * 1024,
      usedBytes: 392 * 1024 * 1024 * 1024,
      filesystem: 'NTFS',
      isSystem: true,
    }

    try {
      if (window.electronAPI) {
        let detectedDrives: DriveInfo[] = []
        let detectedQuickFolders: QuickFolderInfo[] = []

        try {
          const [drivesRes, foldersRes] = await Promise.all([
            window.electronAPI.getDrives(),
            window.electronAPI.getQuickAccessFolders ? window.electronAPI.getQuickAccessFolders() : Promise.resolve([]),
          ])
          detectedDrives = drivesRes && drivesRes.length > 0 ? drivesRes : [fallbackDrive]
          detectedQuickFolders = foldersRes || []
        } catch (apiErr) {
          console.warn('[App] getDrives IPC returned error, applying safe fallback drive:', apiErr)
          detectedDrives = [fallbackDrive]
        }

        setDrives(detectedDrives)
        if (detectedQuickFolders && detectedQuickFolders.length > 0) {
          setQuickFolders(detectedQuickFolders)
        }

        // Primary drive discovery
        const primaryDrive = detectedDrives.find((d) => d.isSystem) || detectedDrives[0] || fallbackDrive
        const targetForInitial = primaryDrive?.path || 'C:\\'
        setSelectedDrive(primaryDrive)

        // Part 1: Warm cache check or automatic background scan
        let loadedCache = false
        const isPro = useSettingsStore.getState().isPro || useLicenseStore.getState().isPro
        if (window.electronAPI.getCachedScan) {
          try {
            const cached = await window.electronAPI.getCachedScan(targetForInitial)
            if (cached && !(isPro && cached.capped) && cached.children && cached.children.length > 0) {
              loadedCache = true
              setRootNode(cached)
              setScanProgress({
                status: 'completed',
                currentPath: targetForInitial,
                scannedFiles: cached.children?.length || 0,
                scannedBytes: cached.size,
                percentage: 100,
                capped: cached.capped,
                cappedAtBytes: cached.cappedAtBytes,
              })
            }
          } catch {
            // Ignored on initial warm load
          }
        }

        // Automatic background scan: kick off primary drive scan if not cached and idle
        if (!loadedCache && useScanStore.getState().scanProgress.status === 'idle') {
          handleStartScan(primaryDrive, false, false)
        }
      } else {
        // Browser fallback / Electron bridge loading
        setDrives([fallbackDrive])
        setSelectedDrive(fallbackDrive)
      }
    } catch (err: unknown) {
      console.error('Failed to enumerate drives:', err)
      setDrives([fallbackDrive])
      setSelectedDrive(fallbackDrive)
    } finally {
      setIsLoadingDrives(false)
    }
  }, [setDrives, setQuickFolders, setIsLoadingDrives, setSelectedDrive, setRootNode, setScanProgress, handleStartScan])

  useEffect(() => {
    loadDrives()

    let unsubscribeProgress: (() => void) | undefined
    let unsubscribeComplete: (() => void) | undefined
    let unsubscribePartial: (() => void) | undefined
    let unsubscribeError: (() => void) | undefined

    if (window.electronAPI) {
      unsubscribeProgress = window.electronAPI.onScanProgress((progress: ScanProgress) => {
        setScanProgress(progress)
      })

      unsubscribeComplete = window.electronAPI.onScanComplete((root: FileNode) => {
        setRootNode(root)
        setScanProgress({
          status: 'completed',
          currentPath: root.path,
          scannedFiles: root.children?.length || 0,
          scannedBytes: root.size,
          percentage: 100,
          capped: root.capped,
          cappedAtBytes: root.cappedAtBytes,
        })
      })

      if (window.electronAPI.onScanPartial) {
        unsubscribePartial = window.electronAPI.onScanPartial((partialRoot: FileNode) => {
          // Stream progressive tree live to canvas
          setRootNode(partialRoot)
        })
      }

      unsubscribeError = window.electronAPI.onScanError((err: string) => {
        setScanProgress({
          status: 'error',
          currentPath: '',
          scannedFiles: 0,
          scannedBytes: 0,
          percentage: 0,
          error: err,
        })
      })
    }

    return () => {
      if (unsubscribeProgress) unsubscribeProgress()
      if (unsubscribeComplete) unsubscribeComplete()
      if (unsubscribePartial) unsubscribePartial()
      if (unsubscribeError) unsubscribeError()
    }
  }, [loadDrives, setScanProgress, setRootNode])

  const getHostDrive = async (targetPath: string): Promise<DriveInfo | undefined> => {
    let currentDrives = drives
    if (currentDrives.length === 0 && window.electronAPI?.getDrives) {
      try {
        const fetched = await window.electronAPI.getDrives()
        if (fetched && fetched.length > 0) {
          currentDrives = fetched
          setDrives(fetched)
        }
      } catch {}
    }
    const targetLower = targetPath.toLowerCase()
    return currentDrives.find((d) => targetLower.startsWith(d.path.toLowerCase())) || currentDrives[0]
  }

  const handleScanHome = async () => {
    let targetPath = ''
    if (quickFolders.length > 0) {
      const userFolder = quickFolders.find((f) => f.category === 'user') || quickFolders[0]
      targetPath = userFolder.path
    } else if (window.electronAPI?.getQuickAccessFolders) {
      const detected = await window.electronAPI.getQuickAccessFolders()
      const userFolder = detected.find((f) => f.category === 'user') || detected[0]
      if (userFolder) targetPath = userFolder.path
    }
    if (!targetPath) {
      targetPath = 'C:\\Users\\hardi'
    }

    const hostDrive = await getHostDrive(targetPath)
    const homeDrive: DriveInfo = {
      id: hostDrive ? `${hostDrive.id}` : 'C:',
      name: 'User Home',
      path: targetPath,
      totalBytes: hostDrive?.totalBytes || 0,
      freeBytes: hostDrive?.freeBytes || 0,
      usedBytes: hostDrive?.usedBytes || 0,
      isSystem: false,
    }

    if (!drives.some((d) => d.path === targetPath)) {
      setDrives([homeDrive, ...drives])
    }
    setSelectedDrive(homeDrive)
    handleStartScan(homeDrive, true, false)
  }

  const handleRevealInExplorer = (targetPath: string) => {
    if (window.electronAPI?.revealInExplorer) {
      window.electronAPI.revealInExplorer(targetPath)
    }
  }


  const handleSelectCustomFolder = async () => {
    if (window.electronAPI?.selectFolder) {
      try {
        const selectedPath = await window.electronAPI.selectFolder()
        if (!selectedPath) return
        const folderName = selectedPath.split(/[\\/]/).filter(Boolean).pop() || selectedPath
        const hostDrive = await getHostDrive(selectedPath)
        const customFolderDrive: DriveInfo = {
          id: hostDrive ? hostDrive.id : selectedPath,
          name: `Folder: ${folderName}`,
          path: selectedPath,
          totalBytes: hostDrive?.totalBytes || 0,
          freeBytes: hostDrive?.freeBytes || 0,
          usedBytes: hostDrive?.usedBytes || 0,
          isSystem: false,
        }

        // Add to drives list if not present
        if (!drives.some((d) => d.path === selectedPath)) {
          setDrives([customFolderDrive, ...drives])
        }
        setSelectedDrive(customFolderDrive)
        handleStartScan(customFolderDrive, true, false)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setDriveError(message)
      }
    } else {
      const customPath = window.prompt('Enter folder path to analyze:', 'C:\\Users\\hardi\\Projects')
      if (!customPath) return
      const folderName = customPath.split(/[\\/]/).filter(Boolean).pop() || customPath
      const customFolderDrive: DriveInfo = {
        id: customPath,
        name: `Folder: ${folderName}`,
        path: customPath,
        totalBytes: 512 * 1024 ** 3,
        freeBytes: 120 * 1024 ** 3,
        usedBytes: 392 * 1024 ** 3,
        isSystem: false,
      }
      if (!drives.some((d) => d.path === customPath)) {
        setDrives([customFolderDrive, ...drives])
      }
      setSelectedDrive(customFolderDrive)
      handleStartScan(customFolderDrive, true, false)
    }
  }

  const handleSelectQuickFolder = async (folder: QuickFolderInfo) => {
    const hostDrive = await getHostDrive(folder.path)
    const folderDrive: DriveInfo = {
      id: hostDrive ? hostDrive.id : folder.id,
      name: folder.name,
      path: folder.path,
      totalBytes: hostDrive?.totalBytes || 0,
      freeBytes: hostDrive?.freeBytes || 0,
      usedBytes: hostDrive?.usedBytes || 0,
      isSystem: false,
    }

    if (!drives.some((d) => d.path === folder.path)) {
      setDrives([folderDrive, ...drives])
    }
    setSelectedDrive(folderDrive)
    handleStartScan(folderDrive, true, false)
  }

  const handleCancelScan = async () => {
    if (window.electronAPI?.cancelScan) {
      await window.electronAPI.cancelScan()
      setScanProgress({
        status: 'cancelled',
        currentPath: '',
        scannedFiles: scanProgress.scannedFiles,
        scannedBytes: scanProgress.scannedBytes,
        percentage: 0,
      })
    }
  }

  return (
    <div className="app-root relative flex h-screen w-screen flex-col overflow-hidden bg-[#18181b] text-zinc-100 font-sans select-none">
      {/* Living Liquid Marbling Canvas for Rainbow Theme */}
      <RainbowMarblingCanvas active={theme === 'rainbow'} />

      {/* Living Aurora Borealis Canvas with Falling Stars for Aurora Theme */}
      <AuroraCanvas active={theme === 'aurora'} />

      {/* Top Title Bar & Sub-Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onRefreshDrives={loadDrives}
        onOpenExclusions={() => setIsExclusionsOpen(true)}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onRevealExplorer={() => handleRevealInExplorer(selectedDrive?.path || 'C:\\')}
      />

      {/* Scan Exclusions Modal */}
      <ExclusionsModal
        isOpen={isExclusionsOpen}
        onClose={() => setIsExclusionsOpen(false)}
      />

      {/* 100% Local Privacy Modal */}
      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />

      {/* Plan Upgrade & License Modal */}
      <UpgradeModal />

      <div className="flex min-h-0 flex-1">
        {activeTab === 'storage' ? (
          <DrivePicker
            drives={drives}
            quickFolders={quickFolders}
            selectedDrive={selectedDrive}
            currentViewNode={currentViewNode}
            errorMessage={driveError}
            onSelectDrive={handleSelectDrive}
            onStartScan={(drive) => handleStartScan(drive, true, false)}
            onStartDeepScan={(drive) => handleStartScan(drive, true, true)}
            onScanHome={handleScanHome}
            onSelectQuickFolder={handleSelectQuickFolder}
            onSelectCustomFolder={handleSelectCustomFolder}
            onRevealInExplorer={handleRevealInExplorer}
            isScanning={scanProgress.status === 'scanning'}
          />
        ) : (
          <aside className="flex w-64 shrink-0 flex-col glass-sidebar">
            <TabNavigation activeTab={activeTab} onSelectTab={handleSelectTab} />
            <div className="flex-1 p-3 flex flex-col justify-between select-none">
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[#242429] border border-[#2f2f36] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Current Drive</span>
                    <span className="text-[10px] font-mono text-blue-400 font-medium">{selectedDrive?.id || 'C:'}</span>
                  </div>
                  {selectedDrive && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-200 font-medium truncate">{selectedDrive.name}</span>
                        <span className="text-zinc-400 font-mono text-[11px]">
                          {(selectedDrive.freeBytes / (1024 ** 3)).toFixed(1)} GB free
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-700/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{
                            width: `${
                              selectedDrive.totalBytes
                                ? Math.round((selectedDrive.usedBytes / selectedDrive.totalBytes) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Privacy Status */}
              <div className="p-3 rounded-lg bg-[#242429] border border-[#2f2f36] space-y-1 text-xs">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">Security</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  All analysis, disk scanning, and cleanup operations execute locally on this machine.
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className={`min-w-0 flex-1 overflow-hidden bg-[#0a0c0f] ${activeTab === 'storage' ? 'p-0' : 'p-3'}`}>
          <div className={activeTab === 'storage' ? 'h-full' : 'hidden'}>
            <div className="h-full min-h-[420px]">
              <TreemapCanvas
                rootNode={rootNode}
                currentViewNode={currentViewNode}
                breadcrumbs={breadcrumbs}
                isScanning={scanProgress.status === 'scanning'}
                scanProgressPercentage={scanProgress.percentage}
                currentScanPath={scanProgress.currentPath}
                scannedFiles={scanProgress.scannedFiles}
                scannedBytes={scanProgress.scannedBytes}
                onCancelScan={handleCancelScan}
                onDrillDown={drillDown}
                onDrillUp={drillUp}
                onResetView={resetView}
              />
            </div>
          </div>

          {visitedTabs.has('cleaner') && (
            <div className={activeTab === 'cleaner' ? 'h-full overflow-y-auto p-2' : 'hidden'}>
              <JunkCleaner />
            </div>
          )}

          {visitedTabs.has('duplicates') && (
            <div className={activeTab === 'duplicates' ? 'h-full overflow-y-auto p-2' : 'hidden'}>
              <DuplicateFinder />
            </div>
          )}

          {visitedTabs.has('apps') && (
            <div className={activeTab === 'apps' ? 'h-full overflow-y-auto p-2' : 'hidden'}>
              <AppsList />
            </div>
          )}

          {visitedTabs.has('search') && (
            <div className={activeTab === 'search' ? 'h-full overflow-y-auto p-2' : 'hidden'}>
              <SearchPanel />
            </div>
          )}

          {visitedTabs.has('monitor') && (
            <div className={activeTab === 'monitor' ? 'h-full overflow-y-auto p-2' : 'hidden'}>
              <MonitorDashboard isActive={activeTab === 'monitor'} />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
