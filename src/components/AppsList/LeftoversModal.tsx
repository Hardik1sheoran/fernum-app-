import React, { useEffect, useState } from 'react'
import { Sparkles, Trash2, Folder, CheckCircle2, RefreshCw, X, AlertCircle } from 'lucide-react'
import type { InstalledApp, ScanLeftoversResult } from '@shared/types'
import { formatBytes } from '../Treemap/treemapLayout'
import { Button } from '../shared/Button'

interface LeftoversModalProps {
  isOpen: boolean
  app: InstalledApp | null
  onClose: () => void
  onCleanComplete?: (cleanedBytes: number) => void
}

export const LeftoversModal: React.FC<LeftoversModalProps> = ({
  isOpen,
  app,
  onClose,
  onCleanComplete,
}) => {
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanLeftoversResult | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isCleaning, setIsCleaning] = useState(false)
  const [cleanedSummary, setCleanedSummary] = useState<{ bytes: number; count: number } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !app) {
      setScanResult(null)
      setSelectedPaths(new Set())
      setCleanedSummary(null)
      setErrorMessage(null)
      return
    }

    async function scan() {
      if (!app) return
      setIsScanning(true)
      setErrorMessage(null)
      setCleanedSummary(null)
      try {
        if (window.electronAPI) {
          const result = await window.electronAPI.scanLeftovers(app.name, app.publisher)
          setScanResult(result)
          // Default all found paths to selected
          setSelectedPaths(new Set(result.residues.map((r) => r.path)))
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMessage(`Failed to scan for residue: ${msg}`)
      } finally {
        setIsScanning(false)
      }
    }

    scan()
  }, [isOpen, app])

  if (!isOpen || !app) return null

  const togglePath = (pathStr: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(pathStr)) {
        next.delete(pathStr)
      } else {
        next.add(pathStr)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (!scanResult) return
    if (selectedPaths.size === scanResult.residues.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(scanResult.residues.map((r) => r.path)))
    }
  }

  const selectedBytes =
    scanResult?.residues
      .filter((r) => selectedPaths.has(r.path))
      .reduce((acc, r) => acc + r.sizeBytes, 0) || 0

  const handleClean = async () => {
    if (selectedPaths.size === 0 || !window.electronAPI) return
    setIsCleaning(true)
    setErrorMessage(null)
    try {
      const pathsArray = Array.from(selectedPaths)
      const res = await window.electronAPI.cleanLeftovers(pathsArray)
      if (res.paths.length > 0) {
        setCleanedSummary({ bytes: res.cleanedBytes, count: res.paths.length })
        if (onCleanComplete) {
          onCleanComplete(res.cleanedBytes)
        }
        // Remove cleaned items from scanResult list
        if (scanResult) {
          const cleanedSet = new Set(res.paths)
          const remaining = scanResult.residues.filter((r) => !cleanedSet.has(r.path))
          setScanResult({
            ...scanResult,
            totalSizeBytes: remaining.reduce((a, b) => a + b.sizeBytes, 0),
            residues: remaining,
          })
          setSelectedPaths(new Set(remaining.map((r) => r.path)))
        }
      }
      if (res.failed.length > 0) {
        setErrorMessage(
          `Could not clean ${res.failed.length} item(s): ${res.failed
            .map((failure) => `${failure.path} (${failure.reason})`)
            .join('; ')}`
        )
      } else if (!res.success) {
        setErrorMessage('No selected leftovers could be cleaned.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(`Clean operation failed: ${msg}`)
    } finally {
      setIsCleaning(false)
    }
  }

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'localappdata':
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            %LocalAppData%
          </span>
        )
      case 'appdata':
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            %AppData%
          </span>
        )
      case 'programdata':
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            %ProgramData%
          </span>
        )
      default:
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            Temp/System
          </span>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-fade-in">
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#1c2028] border border-slate-200 dark:border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/15 text-amber-500">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Leftover Residue Cleaner
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md">
                Target: <span className="font-semibold text-slate-700 dark:text-slate-200">{app.name}</span>
                {app.publisher && ` • ${app.publisher}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isCleaning}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs border border-rose-200 dark:border-rose-900/60 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {cleanedSummary && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
              <span>
                Successfully reclaimed <strong>{formatBytes(cleanedSummary.bytes)}</strong> across{' '}
                {cleanedSummary.count} leftover folder(s)!
              </span>
            </div>
          )}

          {isScanning ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scanning AppData, ProgramData, and caches for leftover traces...
              </p>
            </div>
          ) : scanResult?.residues.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-1">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                No Leftover Traces Found
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                No unlinked cache folders or leftover directories were found in standard Windows app locations.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-1">
                <button
                  onClick={toggleAll}
                  className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium"
                >
                  {selectedPaths.size === scanResult?.residues.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
                <span>
                  {scanResult?.residues.length} locations detected •{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {formatBytes(scanResult?.totalSizeBytes || 0)}
                  </strong>
                </span>
              </div>

              <div className="space-y-2">
                {scanResult?.residues.map((item) => {
                  const isChecked = selectedPaths.has(item.path)
                  return (
                    <div
                      key={item.path}
                      onClick={() => togglePath(item.path)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        isChecked
                          ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => togglePath(item.path)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Folder className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono truncate">
                              {item.path.split('\\').pop() || item.path}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex-shrink-0">
                            {formatBytes(item.sizeBytes)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono break-all mt-1">
                          {item.path}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {getCategoryBadge(item.category)}
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {item.description}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-[#14171d] flex-shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {selectedPaths.size > 0 ? (
              <span>
                Selected:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {selectedPaths.size} folders ({formatBytes(selectedBytes)})
                </strong>
              </span>
            ) : (
              <span>No items selected</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isCleaning}>
              Close
            </Button>
            {scanResult && scanResult.residues.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                icon={
                  isCleaning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )
                }
                disabled={selectedPaths.size === 0 || isCleaning}
                onClick={handleClean}
              >
                {isCleaning ? 'Cleaning...' : `Clean Residue (${formatBytes(selectedBytes)})`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
