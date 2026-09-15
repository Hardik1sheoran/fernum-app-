import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  FolderOpen,
  Trash2,
  FileText,
  HardDrive,
  Copy,
  Check,
  ArrowUpDown,
  RefreshCw,
  Video,
  Archive,
  Code2,
  Image as ImageIcon,
  Music,
  FileSpreadsheet,
  Layers,
  ShieldAlert,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react'
import type { FileCategory, FileNode, SearchResultItem } from '@shared/types'
import { useScanStore } from '../../stores/scanStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { formatBytes } from '../Treemap/treemapLayout'
import { searchFileNodeTree, sortSearchResults } from '@shared/searchUtils'
import { Button } from '../shared/Button'
import { EmptyState } from '../shared/EmptyState'
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal'

interface CategoryFilterOption {
  id: FileCategory | 'all'
  label: string
  icon: React.ReactNode
}

const CATEGORY_FILTERS: CategoryFilterOption[] = [
  { id: 'all', label: 'All Files', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'video', label: 'Videos', icon: <Video className="w-3.5 h-3.5" /> },
  { id: 'archive', label: 'Archives (ZIP/ISO)', icon: <Archive className="w-3.5 h-3.5" /> },
  { id: 'code', label: 'Code & Dev', icon: <Code2 className="w-3.5 h-3.5" /> },
  { id: 'document', label: 'Documents', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
  { id: 'image', label: 'Images', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'audio', label: 'Audio', icon: <Music className="w-3.5 h-3.5" /> },
]

const SIZE_PRESETS: Array<{ label: string; bytes: number }> = [
  { label: 'All Sizes', bytes: 0 },
  { label: '> 100 MB', bytes: 100 * 1024 * 1024 },
  { label: '> 500 MB', bytes: 500 * 1024 * 1024 },
  { label: '> 1 GB', bytes: 1024 * 1024 * 1024 },
  { label: '> 5 GB', bytes: 5 * 1024 * 1024 * 1024 },
]

export const SearchPanel: React.FC = () => {
  const { rootNode, selectedDrive, deleteNodeFromTree, deleteNodesFromTree } = useScanStore()
  const { isPro, openUpgradeModal } = useLicenseStore()

  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<FileCategory | 'all'>('all')
  const [minSizeBytes, setMinSizeBytes] = useState<number>(0)
  const [sortBy, setSortBy] = useState<'size' | 'name' | 'date'>('size')
  const [sortAsc, setSortAsc] = useState(false)
  const [sourceMode, setSourceMode] = useState<'tree' | 'disk'>(rootNode ? 'tree' : 'disk')

  // Search results state
  const [diskResults, setDiskResults] = useState<SearchResultItem[]>([])
  const [isSearchingDisk, setIsSearchingDisk] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  // Multi-selection state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [deleteBatchTargets, setDeleteBatchTargets] = useState<SearchResultItem[] | null>(null)

  // Deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<SearchResultItem | null>(null)
  const [deleteInitialPermanent, setDeleteInitialPermanent] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // In-memory instant tree search
  const treeResults = useMemo(() => {
    if (!rootNode || sourceMode !== 'tree') return []
    const raw = searchFileNodeTree(rootNode, {
      query,
      category: activeCategory,
      minSizeBytes,
      limit: 300,
    })
    return sortSearchResults(raw, sortBy, sortAsc)
  }, [rootNode, sourceMode, query, activeCategory, minSizeBytes, sortBy, sortAsc])

  // Direct disk search
  const handleDiskSearch = useCallback(async () => {
    if (!window.electronAPI) return
    setIsSearchingDisk(true)
    setIsTruncated(false)
    setNotification(null)
    try {
      const res = await window.electronAPI.searchFiles({
        query,
        category: activeCategory,
        minSizeBytes,
        targetPath: selectedDrive?.path,
        limit: 300,
      })
      if (Array.isArray(res)) {
        setDiskResults(res)
        setIsTruncated(false)
      } else {
        setDiskResults(res.items || [])
        setIsTruncated(Boolean(res.truncated))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setNotification(`Disk search failed: ${msg}`)
    } finally {
      setIsSearchingDisk(false)
    }
  }, [query, activeCategory, minSizeBytes, selectedDrive?.path])

  // Automatically trigger disk search on Enter or filter change when in disk mode
  useEffect(() => {
    if (sourceMode === 'disk') {
      const timer = setTimeout(() => {
        handleDiskSearch()
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [sourceMode, handleDiskSearch])

  // Synchronize source mode if rootNode becomes available
  useEffect(() => {
    if (rootNode && sourceMode === 'disk' && diskResults.length === 0) {
      setSourceMode('tree')
    }
  }, [rootNode])

  const activeResults = useMemo(() => {
    if (sourceMode === 'tree') {
      return treeResults
    }
    return sortSearchResults(diskResults, sortBy, sortAsc)
  }, [sourceMode, treeResults, diskResults, sortBy, sortAsc])

  const totalResultsBytes = useMemo(() => {
    return activeResults.reduce((acc, item) => acc + item.sizeBytes, 0)
  }, [activeResults])

  // Multi-selection computed properties
  const selectedItems = useMemo(() => {
    return activeResults.filter((r) => selectedPaths.has(r.path))
  }, [activeResults, selectedPaths])

  const selectedTotalBytes = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + item.sizeBytes, 0)
  }, [selectedItems])

  const isAllSelected = activeResults.length > 0 && selectedPaths.size >= activeResults.length
  const isPartiallySelected = selectedPaths.size > 0 && selectedPaths.size < activeResults.length

  const toggleSelectPath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(activeResults.map((r) => r.path)))
    }
  }

  const clearSelection = () => {
    setSelectedPaths(new Set())
  }

  const handleReveal = async (itemPath: string) => {
    if (!isPro) {
      openUpgradeModal("One-click 'Show in Explorer'")
      return
    }
    if (window.electronAPI) {
      const res = await window.electronAPI.revealInExplorer(itemPath)
      if (res.success) {
        setNotification(`Revealed in Explorer: ${itemPath}`)
      }
    }
  }

  const handleCopyPath = (itemPath: string) => {
    navigator.clipboard.writeText(itemPath)
    setCopiedPath(itemPath)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const handleBatchDelete = (permanent: boolean) => {
    if (!isPro) {
      openUpgradeModal('Delete files within the app')
      return
    }
    if (selectedItems.length === 0) return
    setDeleteBatchTargets(selectedItems)
    setDeleteInitialPermanent(permanent)
  }

  const confirmDelete = async (permanent: boolean) => {
    if (!window.electronAPI) return

    // Batch deletion case
    if (deleteBatchTargets && deleteBatchTargets.length > 0) {
      setIsDeleting(true)
      setDeleteError(null)
      const targets = deleteBatchTargets
      const paths = targets.map((t) => t.path)

      try {
        const res = permanent && window.electronAPI.deleteManyPermanently
          ? await window.electronAPI.deleteManyPermanently(paths)
          : window.electronAPI.trashMany
          ? await window.electronAPI.trashMany(paths)
          : null

        if (res && res.succeeded.length > 0) {
          const { freedBytes } = deleteNodesFromTree(res.succeeded)
          const succeededSet = new Set(res.succeeded)

          setDiskResults((prev) => prev.filter((r) => !succeededSet.has(r.path)))
          setSelectedPaths((prev) => {
            const next = new Set(prev)
            res.succeeded.forEach((p) => next.delete(p))
            return next
          })

          if (res.failed.length > 0) {
            setNotification(
              `Deleted ${res.deletedCount} files (freed ${formatBytes(freedBytes)}). ${res.failed.length} file(s) failed.`
            )
          } else {
            setNotification(
              permanent
                ? `Permanently deleted ${res.deletedCount} files (freed ${formatBytes(freedBytes)}).`
                : `Moved ${res.deletedCount} files to Recycle Bin (freed ${formatBytes(freedBytes)}).`
            )
          }
          setDeleteBatchTargets(null)
        } else if (res && res.failed.length > 0) {
          setDeleteError(`Failed to delete selected files: ${res.failed[0].error}`)
        } else {
          setDeleteError('No files were deleted.')
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setDeleteError(msg)
      } finally {
        setIsDeleting(false)
      }
      return
    }

    // Single item deletion case
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      const res = permanent
        ? await window.electronAPI.deletePermanently(deleteTarget.path)
        : await window.electronAPI.moveToTrash(deleteTarget.path)

      if (res.success) {
        deleteNodeFromTree(deleteTarget.path)
        setDiskResults((prev) => prev.filter((r) => r.path !== deleteTarget.path))
        setSelectedPaths((prev) => {
          const next = new Set(prev)
          next.delete(deleteTarget.path)
          return next
        })
        setNotification(
          permanent
            ? `Permanently deleted: ${deleteTarget.name}`
            : `Moved to Recycle Bin: ${deleteTarget.name}`
        )
        setDeleteTarget(null)
      } else {
        setDeleteError(res.error || 'Failed to delete file.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setDeleteError(msg)
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleSort = (option: 'size' | 'name' | 'date') => {
    if (sortBy === option) {
      setSortAsc(!sortAsc)
    } else {
      setSortBy(option)
      setSortAsc(false)
    }
  }

  const getFileCategoryIcon = (category: FileCategory) => {
    switch (category) {
      case 'video':
        return <Video className="w-4 h-4 text-purple-500" />
      case 'archive':
        return <Archive className="w-4 h-4 text-amber-500" />
      case 'code':
        return <Code2 className="w-4 h-4 text-cyan-500" />
      case 'image':
        return <ImageIcon className="w-4 h-4 text-emerald-500" />
      case 'audio':
        return <Music className="w-4 h-4 text-pink-500" />
      case 'document':
        return <FileSpreadsheet className="w-4 h-4 text-blue-500" />
      default:
        return <FileText className="w-4 h-4 text-slate-400" />
    }
  }

  // Convert SearchResultItem to FileNode for ConfirmDeleteModal
  const modalTargetNode: FileNode | null = deleteTarget
    ? {
        id: deleteTarget.id,
        name: deleteTarget.name,
        path: deleteTarget.path,
        size: deleteTarget.sizeBytes,
        type: 'file',
        category: deleteTarget.category,
        extension: deleteTarget.extension,
        lastModified: deleteTarget.lastModified,
      }
    : null

  const modalTargetNodes = deleteBatchTargets
    ? deleteBatchTargets.map((t) => ({
        name: t.name,
        path: t.path,
        size: t.sizeBytes,
        type: 'file' as const,
      }))
    : undefined

  return (
    <div className="flex flex-col h-full space-y-3 max-w-6xl mx-auto pb-4">
      {/* Search Header Controls */}
      <div className="bg-[#202024] border border-[#2d2d33] p-4 rounded-lg space-y-3 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-400" />
              Search Files
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Locate large files and directories across scanned storage or disk.
            </p>
          </div>

          {/* Search Source Selector */}
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#28282e] border border-[#32323a] text-xs">
            <button
              onClick={() => setSourceMode('tree')}
              disabled={!rootNode}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
                sourceMode === 'tree'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Scanned Tree</span>
              {rootNode && (
                <span className="text-[10px] opacity-75 font-mono">
                  ({formatBytes(rootNode.size)})
                </span>
              )}
            </button>

            <button
              onClick={() => setSourceMode('disk')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
                sourceMode === 'disk'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Direct Disk Search</span>
              {selectedDrive && (
                <span className="text-[10px] opacity-75 font-mono">
                  ({selectedDrive.path})
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search Query Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && sourceMode === 'disk') {
                handleDiskSearch()
              }
            }}
            placeholder={
              sourceMode === 'tree'
                ? 'Search by file name or extension (e.g. .mp4, node_modules, dump.sql)...'
                : `Search disk ${selectedDrive?.path || 'C:'} directly for large files...`
            }
            className="w-full pl-9 pr-24 py-2 text-xs bg-[#16161a] border border-[#32323a] rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
          />
          {sourceMode === 'disk' && (
            <button
              onClick={handleDiskSearch}
              disabled={isSearchingDisk}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md transition-colors flex items-center gap-1"
            >
              {isSearchingDisk ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Search'}
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-[#2d2d33]">
          {/* Category Filters */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-[#28282e] border border-[#32323a] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Size Preset Filters */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-zinc-500 font-medium mr-1">Min Size:</span>
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setMinSizeBytes(preset.bytes)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  minSizeBytes === preset.bytes
                    ? 'bg-zinc-700 text-zinc-100 font-semibold border border-zinc-500'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results Metadata & Sorting */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-[#2d2d33]">
          <div className="flex items-center gap-2">
            <span>
              Found <strong className="text-slate-200">{activeResults.length}</strong> files
            </span>
            <span>·</span>
            <span className="font-bold text-blue-400">
              {formatBytes(totalResultsBytes)} matching
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-[11px] uppercase tracking-wider text-slate-500 font-bold">Sort:</span>
            <button
              onClick={() => toggleSort('size')}
              className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                sortBy === 'size'
                  ? 'bg-white/[0.1] text-blue-400 font-bold'
                  : 'hover:text-slate-200 text-slate-400'
              }`}
            >
              Size
              {sortBy === 'size' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
            <button
              onClick={() => toggleSort('name')}
              className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                sortBy === 'name'
                  ? 'bg-white/[0.1] text-blue-400 font-bold'
                  : 'hover:text-slate-200 text-slate-400'
              }`}
            >
              Name
              {sortBy === 'name' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
            <button
              onClick={() => toggleSort('date')}
              className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                sortBy === 'date'
                  ? 'bg-white/[0.1] text-blue-400 font-bold'
                  : 'hover:text-slate-200 text-slate-400'
              }`}
            >
              Date
              {sortBy === 'date' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
          </div>
        </div>
      </div>

      {notification && (
        <div className="text-xs p-3 rounded-xl bg-blue-950/40 text-blue-300 border border-blue-800/40 flex items-center justify-between flex-shrink-0 animate-fade-in shadow-lg">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="font-bold ml-2 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {sourceMode === 'disk' && isTruncated && !isSearchingDisk && (
        <div className="text-xs px-3.5 py-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-200 flex items-center gap-2 flex-shrink-0 animate-fade-in">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          <span>
            Showing partial results — search stopped early to stay fast. Try a more specific term or a narrower folder.
          </span>
        </div>
      )}

      {/* Results Table Container */}
      <div className="flex-1 bg-[#202024] rounded-lg border border-[#2d2d33] overflow-hidden flex flex-col min-h-0">
        {/* Table Column & Bulk Selection Header */}
        <div className="px-3 py-2 bg-[#19191d] border-b border-[#2d2d33] flex items-center justify-between text-xs text-zinc-400 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              disabled={activeResults.length === 0}
              className="flex items-center gap-2 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isAllSelected ? 'Deselect all' : 'Select all'}
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-400" />
              ) : isPartiallySelected ? (
                <MinusSquare className="w-4 h-4 text-blue-400" />
              ) : (
                <Square className="w-4 h-4 text-zinc-500" />
              )}
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {selectedPaths.size > 0
                  ? `${selectedPaths.size} of ${activeResults.length} selected`
                  : 'Select All'}
              </span>
            </button>
          </div>

          {selectedPaths.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-blue-300 font-mono font-semibold mr-2">
                Total: {formatBytes(selectedTotalBytes)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={<Trash2 className="w-3.5 h-3.5 text-blue-400" />}
                onClick={() => handleBatchDelete(false)}
              >
                Recycle ({selectedPaths.size})
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<ShieldAlert className="w-3.5 h-3.5" />}
                onClick={() => handleBatchDelete(true)}
              >
                Delete Permanently ({selectedPaths.size})
              </Button>
              <button
                onClick={clearSelection}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 ml-1 underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {isSearchingDisk ? (
          <div className="flex-1 flex flex-col items-center justify-center text-xs text-zinc-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            <span>Searching files on disk…</span>
          </div>
        ) : activeResults.length === 0 ? (
          <EmptyState
            icon={<Search className="w-8 h-8" />}
            title="No Matching Files Found"
            description={
              sourceMode === 'tree' && !rootNode
                ? 'No drive has been scanned yet. Run a scan from the Storage tab or click "Direct Disk Search" above.'
                : query.trim() || activeCategory !== 'all' || minSizeBytes > 0
                ? 'No files matched your current query or size filters. Try widening your filters.'
                : 'Type a query or select a category filter above to find large files.'
            }
            className="flex-1 border-none bg-transparent"
          />
        ) : (
          <div className="overflow-y-auto flex-1 divide-y divide-[#27272d]">
            {activeResults.map((item) => {
              const isSelected = selectedPaths.has(item.path)
              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelectPath(item.path)}
                  className={`flex items-center justify-between p-3 transition-colors group cursor-pointer ${
                    isSelected
                      ? 'bg-blue-950/20 hover:bg-blue-950/30'
                      : 'hover:bg-[#25252b]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    {/* Multi-selection Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelectPath(item.path)
                      }}
                      className="cursor-pointer p-0.5"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
                      )}
                    </div>

                    <div className="w-7 h-7 rounded bg-[#28282e] border border-[#32323a] flex items-center justify-center flex-shrink-0">
                      {getFileCategoryIcon(item.category)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs text-zinc-100 truncate">
                          {item.name}
                        </span>
                        {item.extension && (
                          <span className="text-[10px] text-zinc-400 uppercase font-mono px-1.5 py-0.2 rounded bg-[#27272d] border border-[#32323a]">
                            {item.extension}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate mt-0.5 font-mono flex items-center gap-1.5">
                        <span className="truncate">{item.path}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-right">
                      <span className="font-medium text-xs text-slate-200 block font-mono">
                        {formatBytes(item.sizeBytes)}
                      </span>
                      {item.lastModified && (
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {new Date(item.lastModified).toISOString().slice(0, 10)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyPath(item.path)}
                        title="Copy full path"
                        className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {copiedPath === item.path ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<FolderOpen className="w-3 h-3 text-slate-400" />}
                        onClick={() => handleReveal(item.path)}
                        title="Reveal in File Explorer"
                      >
                        Explorer
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 className="w-3 h-3" />}
                        onClick={() => {
                          if (!isPro) {
                            openUpgradeModal('Delete files within the app')
                            return
                          }
                          setDeleteTarget(item)
                          setDeleteBatchTargets(null)
                          setDeleteInitialPermanent(false)
                        }}
                        title="Move to Recycle Bin"
                      >
                        Recycle
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal for file deletion */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget || (!!deleteBatchTargets && deleteBatchTargets.length > 0)}
        targetNode={modalTargetNode}
        targetNodes={modalTargetNodes}
        initialPermanent={deleteInitialPermanent}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null)
          setDeleteBatchTargets(null)
          setDeleteError(null)
        }}
        isDeleting={isDeleting}
        errorMessage={deleteError}
      />
    </div>
  )
}
