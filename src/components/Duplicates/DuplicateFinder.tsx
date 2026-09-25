import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Copy,
  Trash2,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Video,
  Image as ImageIcon,
  Music,
  Archive,
  Layers,
} from 'lucide-react'
import type { DuplicateGroup, FileCategory } from '@shared/types'
import { formatBytes } from '../Treemap/treemapLayout'
import { Button } from '../shared/Button'
import { EmptyState } from '../shared/EmptyState'
import { useScanStore } from '../../stores/scanStore'
import { useLicenseStore } from '../../stores/licenseStore'

interface CategoryFilterOption {
  id: FileCategory | 'all'
  label: string
  icon: React.ReactNode
}

const CATEGORY_FILTERS: CategoryFilterOption[] = [
  { id: 'all', label: 'All Categories', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'video', label: 'Videos', icon: <Video className="w-3.5 h-3.5" /> },
  { id: 'image', label: 'Images', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'archive', label: 'Archives', icon: <Archive className="w-3.5 h-3.5" /> },
  { id: 'document', label: 'Documents', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'audio', label: 'Audio', icon: <Music className="w-3.5 h-3.5" /> },
]

const SIZE_PRESETS = [
  { label: '> 100 KB', bytes: 100 * 1024 },
  { label: '> 1 MB', bytes: 1024 * 1024 },
  { label: '> 10 MB', bytes: 10 * 1024 * 1024 },
  { label: '> 100 MB', bytes: 100 * 1024 * 1024 },
]

export const DuplicateFinder: React.FC = () => {
  const { selectedDrive } = useScanStore()
  const { isPro, openUpgradeModal } = useLicenseStore()

  const [isScanning, setIsScanning] = useState(false)
  const [activeCategory, setActiveCategory] = useState<FileCategory | 'all'>('all')
  const [minSizeBytes, setMinSizeBytes] = useState<number>(100 * 1024)
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [totalWastedBytes, setTotalWastedBytes] = useState(0)
  const [totalDuplicateFiles, setTotalDuplicateFiles] = useState(0)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null)

  const handleScan = useCallback(async () => {
    if (!window.electronAPI?.scanDuplicates) {
      setErrorMessage('Desktop scanner integration is disconnected.')
      return
    }

    setIsScanning(true)
    setErrorMessage(null)
    setDeleteSuccessMessage(null)
    setSelectedPaths(new Set())

    try {
      const res = await window.electronAPI.scanDuplicates({
        targetPath: selectedDrive?.path,
        minSizeBytes,
        category: activeCategory,
        limit: 150,
      })

      setGroups(res.groups || [])
      setTotalWastedBytes(res.totalWastedBytes || 0)
      setTotalDuplicateFiles(res.totalDuplicateFiles || 0)

      // Default smart selection: Keep oldest (mark newer copies for cleaning)
      const toSelect = new Set<string>()
      for (const g of res.groups || []) {
        // First file is oldest; mark remaining copies
        for (let i = 1; i < g.files.length; i++) {
          toSelect.add(g.files[i].path)
        }
      }
      setSelectedPaths(toSelect)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(`Failed to scan for duplicate files: ${msg}`)
    } finally {
      setIsScanning(false)
    }
  }, [selectedDrive?.path, minSizeBytes, activeCategory])

  useEffect(() => {
    handleScan()
  }, [handleScan])

  const toggleSelectPath = (filePath: string) => {
    const next = new Set(selectedPaths)
    if (next.has(filePath)) {
      next.delete(filePath)
    } else {
      next.add(filePath)
    }
    setSelectedPaths(next)
  }

  const selectKeepOldest = () => {
    const next = new Set<string>()
    for (const g of groups) {
      for (let i = 1; i < g.files.length; i++) {
        next.add(g.files[i].path)
      }
    }
    setSelectedPaths(next)
  }

  const selectKeepNewest = () => {
    const next = new Set<string>()
    for (const g of groups) {
      for (let i = 0; i < g.files.length - 1; i++) {
        next.add(g.files[i].path)
      }
    }
    setSelectedPaths(next)
  }

  const deselectAll = () => {
    setSelectedPaths(new Set())
  }

  // Calculate selected wasted bytes
  const selectedWastedBytes = useMemo(() => {
    let bytes = 0
    for (const g of groups) {
      for (const f of g.files) {
        if (selectedPaths.has(f.path)) {
          bytes += f.sizeBytes
        }
      }
    }
    return bytes
  }, [groups, selectedPaths])

  const handleRevealInExplorer = (p: string) => {
    if (window.electronAPI?.revealInExplorer) {
      window.electronAPI.revealInExplorer(p)
    }
  }

  const handleCleanConfirm = async () => {
    if (!window.electronAPI || selectedPaths.size === 0) return

    setShowConfirmModal(false)
    setIsDeleting(true)
    setErrorMessage(null)

    const pathsToDelete = Array.from(selectedPaths)
    try {
      let result = { deletedCount: 0, succeeded: [] as string[] }
      if (window.electronAPI.trashMany) {
        result = await window.electronAPI.trashMany(pathsToDelete)
      } else {
        for (const p of pathsToDelete) {
          await window.electronAPI.moveToTrash(p)
          result.deletedCount++
          result.succeeded.push(p)
        }
      }

      setDeleteSuccessMessage(
        `Successfully cleaned ${result.deletedCount} duplicate files! Reclaimed ${formatBytes(selectedWastedBytes)}.`
      )
      // Refresh scan
      await handleScan()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(`Failed to remove duplicates: ${msg}`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col space-y-4 max-w-6xl mx-auto pb-4">
      {/* Top Header Card */}
      <div className="rounded-lg border border-[#2d2d33] bg-[#202024] p-4 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#28282e] text-zinc-300 border border-[#32323a]">
              <Copy className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
                  Duplicate File Hunter
                </h1>
                <span className="rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.2 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
                  PRO
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Detect identical files with matching byte sizes and SHA-256 signatures to reclaim gigabytes.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-amber-400' : ''}`} />}
              onClick={handleScan}
              disabled={isScanning || isDeleting}
              className="bg-[#28282e] hover:bg-[#303038] border border-[#32323a] text-zinc-200 text-xs py-1.5"
            >
              {isScanning ? 'Analyzing…' : 'Scan Duplicates'}
            </Button>

            <Button
              variant="primary"
              size="md"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => {
                if (!isPro) {
                  openUpgradeModal('Duplicate File Hunter & 1-Click Space Reclaimer')
                  return
                }
                setShowConfirmModal(true)
              }}
              disabled={isScanning || isDeleting || selectedPaths.size === 0}
              className="bg-amber-600 hover:bg-amber-500 font-medium px-4 text-white text-xs py-1.5 disabled:opacity-40"
            >
              {isDeleting ? 'Purging…' : `Clean Selected (${formatBytes(selectedWastedBytes)})`}
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#2d2d33] pt-3 text-xs">
          {/* Category filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                    : 'bg-[#28282e] text-zinc-400 border border-[#32323a] hover:bg-[#303038] hover:text-zinc-200'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Size presets */}
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-zinc-500 mr-1">Min Size:</span>
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.bytes}
                onClick={() => setMinSizeBytes(p.bytes)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  minSizeBytes === p.bytes
                    ? 'bg-zinc-700 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-[#2d2d33] pt-3">
          <div className="rounded bg-[#27272d] p-2.5 border border-[#32323a]">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Wasted Space</div>
            <div className="text-base font-bold text-amber-400 mt-0.5 font-mono">
              {formatBytes(totalWastedBytes)}
            </div>
          </div>
          <div className="rounded bg-[#27272d] p-2.5 border border-[#32323a]">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Duplicate Sets</div>
            <div className="text-base font-bold text-zinc-200 mt-0.5 font-mono">
              {groups.length} groups ({totalDuplicateFiles} files)
            </div>
          </div>
          <div className="rounded bg-[#27272d] p-2.5 border border-[#32323a]">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Selected for Deletion</div>
            <div className="text-base font-bold text-blue-400 mt-0.5 font-mono">
              {selectedPaths.size} files ({formatBytes(selectedWastedBytes)})
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-950/40 border border-rose-800/40 px-4 py-3 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Banner */}
      {deleteSuccessMessage && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-950/40 border border-emerald-800/40 px-5 py-3 text-xs text-emerald-300 shadow-lg">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-semibold">{deleteSuccessMessage}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDeleteSuccessMessage(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Smart Selection Toolbar */}
      {groups.length > 0 && (
        <div className="flex items-center justify-between px-1 flex-shrink-0 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-300">Smart Auto-Select:</span>
            <button
              onClick={selectKeepOldest}
              className="px-2.5 py-1 rounded bg-[#28282e] hover:bg-[#32323a] text-zinc-200 border border-[#363640] transition-colors text-[11px]"
            >
              Keep Oldest
            </button>
            <button
              onClick={selectKeepNewest}
              className="px-2.5 py-1 rounded bg-[#28282e] hover:bg-[#32323a] text-zinc-200 border border-[#363640] transition-colors text-[11px]"
            >
              Keep Newest
            </button>
            <button
              onClick={deselectAll}
              className="px-2.5 py-1 rounded hover:bg-[#28282e] text-zinc-400 hover:text-zinc-200 transition-colors text-[11px]"
            >
              Clear Selection
            </button>
          </div>
          <div className="font-mono text-[11px]">
            Targeting: <span className="text-zinc-200">{selectedDrive?.path || 'Primary Drive'}</span>
          </div>
        </div>
      )}

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {isScanning && groups.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-zinc-400">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
            <p className="text-xs">Computing cryptographic hashes and detecting duplicate clusters…</p>
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-6 h-6 text-emerald-400" />}
            title="No Duplicate Files Detected"
            description="Your selected storage root is free of duplicate documents, videos, and archives."
            action={
              <Button variant="secondary" size="sm" onClick={handleScan}>
                Scan Again
              </Button>
            }
          />
        ) : (
          groups.map((group, groupIdx) => {
            return (
              <div
                key={groupIdx}
                className="rounded-lg border border-[#2d2d33] bg-[#202024] p-3 space-y-2"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between pb-2 border-b border-[#2d2d33] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-200 truncate max-w-md">
                      {group.files[0]?.name || 'Duplicate Set'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                      {group.files.length} copies
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-zinc-400 text-[11px]">{formatBytes(group.sizeBytes)} each</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-amber-400 font-bold">{formatBytes(group.wastedBytes)} wasted</span>
                  </div>
                </div>

                {/* Copies List */}
                <div className="space-y-1.5 pt-1">
                  {group.files.map((file, fileIdx) => {
                    const isSelected = selectedPaths.has(file.path)
                    const isOldest = fileIdx === 0

                    return (
                      <div
                        key={file.path}
                        className={`flex items-center justify-between p-2 rounded-md transition-colors text-xs ${
                          isSelected
                            ? 'bg-rose-950/20 border border-rose-800/30 text-zinc-200'
                            : 'bg-[#27272d] border border-transparent text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPath(file.path)}
                            className="rounded border-zinc-600 bg-zinc-800 text-rose-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] truncate text-zinc-200">
                                {file.path}
                              </span>
                              {isOldest && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold uppercase tracking-wider shrink-0">
                                  Original
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                              Modified: {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'Unknown'}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRevealInExplorer(file.path)}
                          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors shrink-0 ml-2"
                          title="Reveal in File Explorer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161a22] p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100">Clean Duplicate Files?</h3>
                <p className="text-xs text-zinc-400">Review selected files before sending to Recycle Bin</p>
              </div>
            </div>

            <div className="my-4 rounded-xl bg-white/5 p-3.5 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-300">
                <span>Total Space to Reclaim:</span>
                <span className="font-bold text-amber-400 text-sm font-mono">{formatBytes(selectedWastedBytes)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Files targeted for deletion:</span>
                <span className="font-mono">{selectedPaths.size} files</span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Files will be safely sent to the Windows Recycle Bin by default, allowing you to restore them if needed. At least one original copy of each duplicate cluster is preserved.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCleanConfirm}
                disabled={isDeleting}
                className="bg-amber-600 hover:bg-amber-500 border-amber-500/30 font-semibold text-white"
              >
                Confirm & Clean
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
