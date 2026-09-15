import React, { useEffect, useState, useCallback } from 'react'
import { Header } from './components/shared/Header'
import { TabNavigation, type TabKey } from './components/shared/TabNavigation'
import { DrivePicker } from './components/DrivePicker/DrivePicker'
import { TreemapCanvas } from './components/Treemap/TreemapCanvas'
import { JunkCleaner } from './components/Cleaner/JunkCleaner'
import { AppsList } from './components/AppsList/AppsList'
import { SearchPanel } from './components/Search/SearchPanel'
import { MonitorDashboard } from './components/Monitor/MonitorDashboard'
import { ExclusionsModal } from './components/shared/ExclusionsModal'
import { PrivacyModal } from './components/shared/PrivacyModal'
import { UpgradeModal } from './components/shared/UpgradeModal'
import { useScanStore } from './stores/scanStore'
import { useSettingsStore } from './stores/settingsStore'
import { useTheme } from './hooks/useTheme'
import type { DriveInfo, QuickFolderInfo, ScanProgress, FileNode } from '@shared/types'

export const App: React.FC = () => {
  useTheme() // Initialize theme class on documentElement
  const [activeTab, setActiveTab] = useState<TabKey>('storage')
  const [isExclusionsOpen, setIsExclusionsOpen] = useState(false)
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false)
  const [driveError, setDriveError] = useState<string | null>(null)

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

  const loadDrives = useCallback(async () => {
    setIsLoadingDrives(true)
    setDriveError(null)
    try {
      if (window.electronAPI) {
        const [detectedDrives, detectedQuickFolders] = await Promise.all([
          window.electronAPI.getDrives(),
          window.electronAPI.getQuickAccessFolders ? window.electronAPI.getQuickAccessFolders() : Promise.resolve([]),
        ])
        setDrives(detectedDrives)
        if (detectedQuickFolders && detectedQuickFolders.length > 0) {
          setQuickFolders(detectedQuickFolders)
        }

        // Warm startup: auto-load cached tree for user home or primary drive
        const userFolder = detectedQuickFolders?.find((f) => f.category === 'user') || detectedQuickFolders?.[0]
        const targetForInitial = userFolder?.path || detectedDrives[0]?.path
        if (targetForInitial && !useScanStore.getState().rootNode && window.electronAPI.getCachedScan) {
          try {
            const cached = await window.electronAPI.getCachedScan(targetForInitial)
            if (cached && !useScanStore.getState().rootNode) {
              const primaryDrive = detectedDrives[0]
              const initialDrive: DriveInfo = {
                id: primaryDrive ? primaryDrive.id : 'C:',
                name: userFolder?.name || 'User Home',
                path: targetForInitial,
                totalBytes: primaryDrive?.totalBytes || 0,
                freeBytes: primaryDrive?.freeBytes || 0,
                usedBytes: primaryDrive?.usedBytes || 0,
                isSystem: false,
              }
              setSelectedDrive(initialDrive)
              setRootNode(cached)
              setScanProgress({
                status: 'completed',
                currentPath: targetForInitial,
                scannedFiles: cached.children?.length || 0,
                scannedBytes: cached.size,
                percentage: 100,
              })
            }
          } catch {
            // Ignored on initial warm load
          }
        }
      } else {
        setDriveError('Desktop integration bridge (electronAPI) is disconnected. Unable to query system drives.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to enumerate drives:', err)
      setDriveError(`Could not read drive information: ${msg}`)
    } finally {
      setIsLoadingDrives(false)
    }
  }, [setDrives, setQuickFolders, setIsLoadingDrives, setRootNode, setScanProgress])

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
    handleStartScan(homeDrive)
  }

  const handleRevealInExplorer = (targetPath: string) => {
    if (window.electronAPI?.revealInExplorer) {
      window.electronAPI.revealInExplorer(targetPath)
    }
  }

  const handleStartScan = async (drive: DriveInfo, forceRescan = false) => {
    if (window.electronAPI) {
      let hasWarmCached = false

      if (!forceRescan && window.electronAPI.getCachedScan) {
        try {
          const cached = await window.electronAPI.getCachedScan(drive.path)
          if (cached) {
            hasWarmCached = true
            setRootNode(cached)
            setScanProgress({
              status: 'completed',
              currentPath: drive.path,
              scannedFiles: cached.children?.length || 0,
              scannedBytes: cached.size,
              percentage: 100,
            })
          }
        } catch {
          // Fall back to standard scan UI
        }
      }

      if (!hasWarmCached) {
        // Initialize rootNode with empty directory so canvas is mounted and renders progressive partial updates
        setRootNode({
          id: drive.path,
          name: drive.name || drive.path,
          path: drive.path,
          size: 0,
          type: 'directory',
          category: 'other',
          children: [],
        })
        setScanProgress({
          status: 'scanning',
          currentPath: drive.path,
          scannedFiles: 0,
          scannedBytes: 0,
          percentage: 0,
        })
      }

      const { excludedPaths } = useSettingsStore.getState()
      try {
        const started = await window.electronAPI.startScan({
          targetPath: drive.path,
          excludePaths: excludedPaths,
          forceRescan,
        })
        if (!started) throw new Error('The scanner could not start.')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setScanProgress({
          status: 'error', currentPath: drive.path, scannedFiles: 0, scannedBytes: 0, percentage: 0, error: message,
        })
      }
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
        handleStartScan(customFolderDrive)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setDriveError(message)
      }
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
    handleStartScan(folderDrive)
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
    <div className="app-root flex h-screen w-screen flex-col overflow-hidden bg-[#18181b] text-zinc-100 font-sans select-none">
      {/* Top Title Bar */}
      <Header
        onRefreshDrives={loadDrives}
        onOpenExclusions={() => setIsExclusionsOpen(true)}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
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
        <aside className="flex w-64 shrink-0 flex-col border-r border-[#2d2d33] bg-[#202024]">
          <TabNavigation activeTab={activeTab} onSelectTab={setActiveTab} />
          {activeTab === 'storage' ? (
            <DrivePicker
              drives={drives}
              quickFolders={quickFolders}
              selectedDrive={selectedDrive}
              currentViewNode={currentViewNode}
              errorMessage={driveError}
              onSelectDrive={setSelectedDrive}
              onStartScan={handleStartScan}
              onScanHome={handleScanHome}
              onSelectQuickFolder={handleSelectQuickFolder}
              onSelectCustomFolder={handleSelectCustomFolder}
              onRevealInExplorer={handleRevealInExplorer}
              isScanning={scanProgress.status === 'scanning'}
            />
          ) : (
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
          )}
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 overflow-hidden bg-[#18181b] p-3">
          {activeTab === 'storage' && (
            <div className="h-full">
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
          )}

          {activeTab === 'cleaner' && (
            <div className="h-full overflow-y-auto p-2">
              <JunkCleaner />
            </div>
          )}

          {activeTab === 'apps' && (
            <div className="h-full overflow-y-auto p-2">
              <AppsList />
            </div>
          )}

          {activeTab === 'search' && (
            <div className="h-full overflow-y-auto p-2">
              <SearchPanel />
            </div>
          )}

          {activeTab === 'monitor' && (
            <div className="h-full overflow-y-auto p-2">
              <MonitorDashboard />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
