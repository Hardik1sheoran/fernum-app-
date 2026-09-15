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
} from 'lucide-react'
import type { FileCategory, FileNode, SearchResultItem } from '@shared/types'
import { useScanStore } from '../../stores/scanStore'
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
  const { rootNode, selectedDrive, deleteNodeFromTree } = useScanStore()

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

  const handleReveal = async (itemPath: string) => {
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

  const confirmDelete = async (permanent: boolean) => {
    if (!deleteTarget || !window.electronAPI) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      const res = permanent
        ? await window.electronAPI.deletePermanently(deleteTarget.path)
        : await window.electronAPI.moveToTrash(deleteTarget.path)

      if (res.success) {
        // Prune from scanned tree and update reclaimed counter
        deleteNodeFromTree(deleteTarget.path)
        // Remove from disk results
        setDiskResults((prev) => prev.filter((r) => r.path !== deleteTarget.path))
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
            </button>
            <button
              onClick={() => {
                setSourceMode('disk')
                handleDiskSearch()
              }}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
                sourceMode === 'disk'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Direct Disk Search</span>
            </button>
          </div>
        </div>

        {/* Search Input Bar & Action */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sourceMode === 'disk') {
                  handleDiskSearch()
                }
              }}
              placeholder="Search by filename or extension (e.g. .mp4, .zip, node_modules)…"
              className="w-full text-xs pl-9 pr-8 py-2 rounded-md border border-[#32323a] bg-[#27272d] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {sourceMode === 'disk' && (
            <Button
              variant="primary"
              size="md"
              icon={
                isSearchingDisk ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-200" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )
              }
              onClick={handleDiskSearch}
              disabled={isSearchingDisk}
              className="bg-blue-600 hover:bg-blue-500 font-medium px-4 text-white text-xs py-1.5"
            >
              {isSearchingDisk ? 'Searching…' : 'Search Disk'}
            </Button>
          )}
        </div>

        {/* Category Filters & Size Presets */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2 border-t border-[#2d2d33]">
          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveCategory(f.id)}
                className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
                  activeCategory === f.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#27272d] border border-[#32323a] text-zinc-300 hover:bg-[#303038]'
                }`}
              >
                {f.icon}
                <span>{f.label}</span>
              </button>
            ))}
          </div>

          {/* Size Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.bytes}
                onClick={() => setMinSizeBytes(p.bytes)}
                className={`text-[11px] px-2 py-0.5 rounded font-mono border transition-colors ${
                  minSizeBytes === p.bytes
                    ? 'bg-[#3b321a] text-amber-300 border-amber-600/50'
                    : 'bg-[#27272d] border-[#32323a] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sorting and Summary Bar */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/[0.04]">
          <div className="flex items-center gap-2 font-mono">
            <span>
              Found <strong className="text-white font-bold">{activeResults.length}</strong> items
            </span>
            <span>•</span>
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
          <button onClick={() => setNotification(null)} className="font-bold ml-2">
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
            {activeResults.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 hover:bg-[#25252b] transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0 pr-4">
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

                <div className="flex items-center gap-3 flex-shrink-0">
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
                        setDeleteTarget(item)
                        setDeleteInitialPermanent(false)
                      }}
                      title="Move to Recycle Bin"
                    >
                      Recycle
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal for file deletion */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        targetNode={modalTargetNode}
        initialPermanent={deleteInitialPermanent}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null)
          setDeleteError(null)
        }}
        isDeleting={isDeleting}
        errorMessage={deleteError}
      />
    </div>
  )
}
