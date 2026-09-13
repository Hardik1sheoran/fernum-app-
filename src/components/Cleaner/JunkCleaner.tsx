import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Sparkles,
  Trash2,
  HardDrive,
  Archive,
  Download,
  ShieldAlert,
  Zap,
  Image as ImageIcon,
  Globe,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Folder,
} from 'lucide-react'
import type { JunkCategoryItem, JunkCategoryType, JunkCleanResult } from '@shared/types'
import { formatBytes } from '../Treemap/treemapLayout'
import { Button } from '../shared/Button'
import { EmptyState } from '../shared/EmptyState'

const ICON_MAP: Record<string, React.ReactNode> = {
  Trash2: <Trash2 className="w-5 h-5 text-amber-400" />,
  HardDrive: <HardDrive className="w-5 h-5 text-blue-400" />,
  Archive: <Archive className="w-5 h-5 text-emerald-400" />,
  Download: <Download className="w-5 h-5 text-cyan-400" />,
  ShieldAlert: <ShieldAlert className="w-5 h-5 text-rose-400" />,
  Zap: <Zap className="w-5 h-5 text-violet-400" />,
  Image: <ImageIcon className="w-5 h-5 text-purple-400" />,
  Globe: <Globe className="w-5 h-5 text-sky-400" />,
}

export const JunkCleaner: React.FC = () => {
  const [categories, setCategories] = useState<JunkCategoryItem[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<JunkCategoryType>>(new Set())
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<JunkCategoryType>>(new Set())
  const [isScanning, setIsScanning] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [cleanResult, setCleanResult] = useState<JunkCleanResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadJunkScan = useCallback(async () => {
    if (!window.electronAPI) {
      setErrorMessage('Desktop integration bridge (electronAPI) is disconnected.')
      return
    }

    setIsScanning(true)
    setErrorMessage(null)
    setCleanResult(null)

    try {
      const res = await window.electronAPI.scanJunk()
      setCategories(res.categories || [])

      // By default, select all categories with detected junk
      const withJunk = (res.categories || [])
        .filter((c) => c.sizeBytes > 0 || c.fileCount > 0)
        .map((c) => c.id)
      setSelectedCategoryIds(new Set(withJunk))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to scan system junk:', err)
      setErrorMessage(`Failed to analyze system junk: ${msg}`)
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    loadJunkScan()
  }, [loadJunkScan])

  // Total reclaimable stats
  const totalReclaimableBytes = useMemo(() => {
    return categories
      .filter((c) => selectedCategoryIds.has(c.id))
      .reduce((acc, c) => acc + c.sizeBytes, 0)
  }, [categories, selectedCategoryIds])

  const totalReclaimableFiles = useMemo(() => {
    return categories
      .filter((c) => selectedCategoryIds.has(c.id))
      .reduce((acc, c) => acc + c.fileCount, 0)
  }, [categories, selectedCategoryIds])

  const allSelected = useMemo(() => {
    return categories.length > 0 && categories.every((c) => selectedCategoryIds.has(c.id))
  }, [categories, selectedCategoryIds])

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedCategoryIds(new Set())
    } else {
      setSelectedCategoryIds(new Set(categories.map((c) => c.id)))
    }
  }

  const toggleCategory = (id: JunkCategoryType) => {
    const next = new Set(selectedCategoryIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedCategoryIds(next)
  }

  const toggleExpand = (id: JunkCategoryType) => {
    const next = new Set(expandedCategoryIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedCategoryIds(next)
  }

  const handleCleanConfirm = async () => {
    if (!window.electronAPI || selectedCategoryIds.size === 0) return

    setShowConfirmModal(false)
    setIsCleaning(true)
    setErrorMessage(null)

    try {
      const result = await window.electronAPI.cleanJunk(Array.from(selectedCategoryIds))
      setCleanResult(result)
      // Re-scan to show updated space
      await loadJunkScan()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to clean system junk:', err)
      setErrorMessage(`Failed to purge system junk: ${msg}`)
    } finally {
      setIsCleaning(false)
    }
  }

  return (
    <div className="flex h-full flex-col space-y-4 max-w-6xl mx-auto">
      {/* Top Banner Hero */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-r from-[#1b2028] via-[#161a22] to-[#12151b] p-5 shadow-lg flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-100">System Junk & Cache Cleaner</h1>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                  Safe Cleanup
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Clean temporary files, Windows Update downloads, thumbnail caches, and Recycle Bin safely.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              icon={<RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-blue-400' : ''}`} />}
              onClick={loadJunkScan}
              disabled={isScanning || isCleaning}
            >
              {isScanning ? 'Scanning...' : 'Scan Junk'}
            </Button>

            <Button
              variant="primary"
              size="md"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => setShowConfirmModal(true)}
              disabled={isScanning || isCleaning || totalReclaimableBytes === 0 || selectedCategoryIds.size === 0}
              className="bg-blue-600 hover:bg-blue-500 font-semibold px-4"
            >
              {isCleaning ? 'Cleaning...' : `Clean Selected (${formatBytes(totalReclaimableBytes)})`}
            </Button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-white/5 pt-4">
          <div className="rounded-lg bg-white/5 p-3 border border-white/5">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Reclaimable Space</div>
            <div className="text-lg font-bold text-blue-400 mt-0.5">
              {formatBytes(totalReclaimableBytes)}
            </div>
          </div>
          <div className="rounded-lg bg-white/5 p-3 border border-white/5">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Target Files & Dumps</div>
            <div className="text-lg font-bold text-slate-200 mt-0.5">
              {totalReclaimableFiles.toLocaleString()} files
            </div>
          </div>
          <div className="rounded-lg bg-white/5 p-3 border border-white/5">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Selected Categories</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">
              {selectedCategoryIds.size} of {categories.length}
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-950/40 border border-rose-800/40 px-3.5 py-2.5 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Notification Banner */}
      {cleanResult && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-950/40 border border-emerald-800/40 px-4 py-3 text-xs text-emerald-300 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <span className="font-semibold text-emerald-200">
                Cleanup complete! Reclaimed {formatBytes(cleanResult.reclaimedBytes)}
              </span>
              <p className="text-[11px] text-emerald-400/80 mt-0.5">
                Purged {cleanResult.deletedFileCount.toLocaleString()} items
                {cleanResult.skippedCount > 0 ? ` • ${cleanResult.skippedCount} in-use items safely skipped` : ''}.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCleanResult(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Category List Toolbar */}
      <div className="flex items-center justify-between px-1 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="text-xs font-semibold text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-400">
          {categories.filter((c) => c.sizeBytes > 0).length} categories contain purgable files
        </div>
      </div>

      {/* Category Cards List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {isScanning && categories.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-xs">Analyzing system caches, temporary folders, and recycle bins...</p>
          </div>
        ) : categories.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-6 h-6 text-emerald-400" />}
            title="No Junk Data Found"
            description="All system temporary folders, caches, and recycle bins are already clean."
            action={
              <Button variant="secondary" size="sm" onClick={loadJunkScan}>
                Scan Again
              </Button>
            }
          />
        ) : (
          categories.map((cat) => {
            const isSelected = selectedCategoryIds.has(cat.id)
            const isExpanded = expandedCategoryIds.has(cat.id)
            const hasJunk = cat.sizeBytes > 0 || cat.fileCount > 0

            return (
              <div
                key={cat.id}
                className={`rounded-xl border transition-all ${
                  isSelected
                    ? 'border-blue-500/30 bg-[#161a22]/90 shadow-sm'
                    : 'border-white/5 bg-[#14161d]/60 hover:bg-[#161922]'
                }`}
              >
                <div className="flex items-center justify-between p-3.5 gap-3">
                  {/* Left Column: Checkbox, Icon, Title */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCategory(cat.id)}
                      className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer shrink-0"
                    />

                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 border border-white/5 shrink-0">
                      {ICON_MAP[cat.icon] || <Sparkles className="w-5 h-5 text-blue-400" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-200 truncate">{cat.name}</h3>
                        {cat.safeToClean && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                            Safe
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{cat.description}</p>
                    </div>
                  </div>

                  {/* Right Column: Size, File Count, Expand Button */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className={`text-sm font-bold ${hasJunk ? 'text-slate-100' : 'text-slate-500'}`}>
                        {formatBytes(cat.sizeBytes)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {cat.fileCount.toLocaleString()} {cat.fileCount === 1 ? 'file' : 'files'}
                      </div>
                    </div>

                    {cat.paths.length > 0 && (
                      <button
                        onClick={() => toggleExpand(cat.id)}
                        className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Show target folder paths"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Paths Preview */}
                {isExpanded && cat.paths.length > 0 && (
                  <div className="border-t border-white/5 bg-black/20 p-3 text-xs text-slate-400 space-y-1.5 rounded-b-xl">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Targeted Storage Paths:
                    </div>
                    {cat.paths.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
                        <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">{p}</span>
                      </div>
                    ))}
                  </div>
                )}
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
                <h3 className="text-base font-bold text-slate-100">Clean System Junk?</h3>
                <p className="text-xs text-slate-400">Review selected cleanup targets before purging</p>
              </div>
            </div>

            <div className="my-4 rounded-xl bg-white/5 p-3.5 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Total space to reclaim:</span>
                <span className="font-bold text-blue-400 text-sm">{formatBytes(totalReclaimableBytes)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total targeted files:</span>
                <span>{totalReclaimableFiles.toLocaleString()} files</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Categories to clean:</span>
                <span>{selectedCategoryIds.size} categories</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Files currently locked or in use by active Windows programs will be safely skipped. No personal documents or operating system binaries will be removed.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
                disabled={isCleaning}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleCleanConfirm}
                disabled={isCleaning}
                className="bg-blue-600 hover:bg-blue-500 border-blue-500/30 font-semibold"
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
