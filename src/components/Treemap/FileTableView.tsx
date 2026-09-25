import React, { useState, useMemo } from 'react'
import {
  Folder,
  File,
  FolderOpen,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Film,
  Image as ImageIcon,
  Music,
  FileText,
  Archive,
  Code2,
  HardDrive,
  Search,
  ChevronRight,
  Filter,
} from 'lucide-react'
import type { FileNode } from '@shared/types'
import { formatBytes, CATEGORY_COLORS } from './treemapLayout'

export interface FileTableViewProps {
  currentViewNode: FileNode | null
  selectedNode: FileNode | null
  onSelectNode: (node: FileNode) => void
  onDrillDown: (node: FileNode) => void
  onRevealInExplorer?: (path: string) => void
  onDeleteNode?: (node: FileNode, permanent: boolean) => void
  onCopyPath?: (path: string) => void
  activeCategoryFilter: string
  onCategoryFilterChange: (category: string) => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  className?: string
}

type SortField = 'size' | 'name' | 'percentage' | 'items'
type SortOrder = 'asc' | 'desc'

export const FileTableView: React.FC<FileTableViewProps> = ({
  currentViewNode,
  selectedNode,
  onSelectNode,
  onDrillDown,
  onRevealInExplorer,
  onDeleteNode,
  onCopyPath,
  activeCategoryFilter,
  onCategoryFilterChange,
  searchQuery,
  onSearchQueryChange,
  className = '',
}) => {
  const [sortField, setSortField] = useState<SortField>('size')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const totalParentSize = currentViewNode?.size || 1
  const rawChildren = currentViewNode?.children || []

  // Compute category summaries for the category filter tabs
  const categoryStats = useMemo(() => {
    const stats: Record<string, { count: number; totalBytes: number }> = {
      all: { count: rawChildren.length, totalBytes: currentViewNode?.size || 0 },
    }

    for (const child of rawChildren) {
      const cat = child.category || 'other'
      if (!stats[cat]) {
        stats[cat] = { count: 0, totalBytes: 0 }
      }
      stats[cat].count++
      stats[cat].totalBytes += child.size || 0

      // Also track large files (> 100MB)
      if (child.type === 'file' && (child.size || 0) >= 100 * 1024 * 1024) {
        if (!stats['large']) {
          stats['large'] = { count: 0, totalBytes: 0 }
        }
        stats['large'].count++
        stats['large'].totalBytes += child.size || 0
      }
    }

    return stats
  }, [rawChildren, currentViewNode])

  // Filter items
  const filteredItems = useMemo(() => {
    let result = rawChildren

    // Category filter
    if (activeCategoryFilter !== 'all') {
      if (activeCategoryFilter === 'large') {
        result = result.filter(
          (item) => item.type === 'file' && (item.size || 0) >= 100 * 1024 * 1024
        )
      } else {
        result = result.filter(
          (item) => item.category === activeCategoryFilter || (activeCategoryFilter === 'directory' && item.type === 'directory')
        )
      }
    }

    // Text search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.path && item.path.toLowerCase().includes(q))
      )
    }

    // Sort items
    return [...result].sort((a, b) => {
      let comparison = 0
      if (sortField === 'size') {
        comparison = (b.size || 0) - (a.size || 0)
      } else if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      } else if (sortField === 'items') {
        const aCount = a.children ? a.children.length : 0
        const bCount = b.children ? b.children.length : 0
        comparison = bCount - aCount
      } else if (sortField === 'percentage') {
        comparison = (b.size || 0) - (a.size || 0)
      }

      return sortOrder === 'desc' ? comparison : -comparison
    })
  }, [rawChildren, activeCategoryFilter, searchQuery, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder(field === 'name' ? 'asc' : 'desc')
    }
  }

  const getFileIcon = (node: FileNode) => {
    if (node.type === 'directory') {
      return <Folder className="w-4 h-4 text-blue-400 shrink-0" />
    }
    const cat = node.category || 'other'
    switch (cat) {
      case 'video':
        return <Film className="w-4 h-4 text-purple-400 shrink-0" />
      case 'image':
        return <ImageIcon className="w-4 h-4 text-pink-400 shrink-0" />
      case 'audio':
        return <Music className="w-4 h-4 text-amber-400 shrink-0" />
      case 'document':
        return <FileText className="w-4 h-4 text-blue-400 shrink-0" />
      case 'archive':
        return <Archive className="w-4 h-4 text-emerald-400 shrink-0" />
      case 'code':
        return <Code2 className="w-4 h-4 text-cyan-400 shrink-0" />
      case 'system':
        return <HardDrive className="w-4 h-4 text-rose-400 shrink-0" />
      default:
        return <File className="w-4 h-4 text-zinc-400 shrink-0" />
    }
  }

  return (
    <div className={`flex flex-col h-full bg-[#18181b] text-zinc-100 overflow-hidden select-none ${className}`}>
      {/* Search & Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 border-b border-[#2d2d33] bg-[#1a1a1f]">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Filter files in this directory (e.g. .mp4, logs)..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded bg-[#242429] border border-[#2f2f36] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchQueryChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="text-xs text-zinc-400 flex items-center gap-3">
          <span>
            Showing <strong className="text-zinc-200">{filteredItems.length}</strong> of{' '}
            <strong className="text-zinc-200">{rawChildren.length}</strong> items
          </span>
          <span>•</span>
          <span>
            Filtered Total:{' '}
            <strong className="text-blue-400">
              {formatBytes(filteredItems.reduce((acc, curr) => acc + (curr.size || 0), 0))}
            </strong>
          </span>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 p-2 px-3 border-b border-[#2d2d33] bg-[#141418] overflow-x-auto text-xs scrollbar-none">
        <button
          onClick={() => onCategoryFilterChange('all')}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all shrink-0 cursor-pointer ${
            activeCategoryFilter === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-[#242429] text-zinc-400 hover:text-zinc-200 border border-[#2f2f36]'
          }`}
        >
          All ({rawChildren.length})
        </button>

        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => {
          const stats = categoryStats[cat]
          if (!stats || stats.count === 0) return null
          const isActive = activeCategoryFilter === cat

          return (
            <button
              key={cat}
              onClick={() => onCategoryFilterChange(cat)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-[#242429] text-zinc-400 hover:text-zinc-200 border border-[#2f2f36]'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{cat}</span>
              <span className="text-[10px] opacity-75 font-mono">({stats.count})</span>
            </button>
          )
        })}

        {categoryStats['large'] && categoryStats['large'].count > 0 && (
          <button
            onClick={() => onCategoryFilterChange('large')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
              activeCategoryFilter === 'large'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
            }`}
          >
            <span>⚡ Large Files &gt;100MB</span>
            <span className="text-[10px] font-mono">({categoryStats['large'].count})</span>
          </button>
        )}
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-[#2d2d33] bg-[#1a1a1f] text-[11px] font-semibold text-zinc-400">
        <div
          onClick={() => handleSort('name')}
          className="col-span-5 flex items-center gap-1.5 cursor-pointer hover:text-zinc-200 transition-colors"
        >
          <span>Name & File Path</span>
          {sortField === 'name' && (
            sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
          )}
        </div>

        <div
          onClick={() => handleSort('size')}
          className="col-span-3 flex items-center justify-end gap-1.5 cursor-pointer hover:text-zinc-200 transition-colors text-right"
        >
          <span>Size & Share</span>
          {sortField === 'size' && (
            sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
          )}
        </div>

        <div className="col-span-2 text-center">Category / Type</div>

        <div className="col-span-2 text-right">Actions</div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#242429]">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500 space-y-2">
            <Filter className="w-8 h-8 text-zinc-600 mb-1" />
            <p className="text-xs font-medium text-zinc-400">No files match the selected filter</p>
            <p className="text-[11px] text-zinc-600">Try clearing the search query or switching back to "All"</p>
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const isSelected = selectedNode?.id === item.id
            const itemSize = item.size || 0
            const percentage = totalParentSize > 0 ? (itemSize / totalParentSize) * 100 : 0
            const isDirectory = item.type === 'directory'
            const catColor = CATEGORY_COLORS[item.category || 'other'] || '#94a3b8'

            return (
              <div
                key={item.id || `${item.path}-${idx}`}
                onClick={() => onSelectNode(item)}
                onDoubleClick={() => isDirectory && onDrillDown(item)}
                className={`grid grid-cols-12 gap-2 px-3 py-2 items-center text-xs transition-colors cursor-pointer group ${
                  isSelected
                    ? 'bg-blue-600/15 border-l-2 border-blue-500 text-blue-200'
                    : 'hover:bg-[#202026] text-zinc-200'
                }`}
              >
                {/* 1. Name & Icon */}
                <div className="col-span-5 flex items-center gap-2 min-w-0">
                  {getFileIcon(item)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className={`font-medium truncate ${isDirectory ? 'text-zinc-100 hover:text-blue-400' : 'text-zinc-200'}`}>
                        {item.name}
                      </span>
                      {isDirectory && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDrillDown(item)
                          }}
                          title="Drill into folder"
                          className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 transition-opacity p-0.5"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {item.path && (
                      <p className="text-[10px] text-zinc-500 truncate font-mono">
                        {item.path}
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Size & Proportional Visual Bar */}
                <div className="col-span-3 flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-semibold">
                    <span className="text-zinc-100">{formatBytes(itemSize)}</span>
                    <span className="text-[10px] text-zinc-500 font-normal">
                      ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  {/* Proportional visual bar */}
                  <div className="w-full max-w-[140px] h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(2, percentage))}%`,
                        backgroundColor: isDirectory ? '#3b82f6' : catColor,
                      }}
                    />
                  </div>
                </div>

                {/* 3. Category / Type */}
                <div className="col-span-2 flex items-center justify-center">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1"
                    style={{
                      borderColor: `${catColor}40`,
                      backgroundColor: `${catColor}15`,
                      color: catColor,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor }} />
                    <span className="capitalize">
                      {isDirectory ? `${item.children?.length || 0} items` : (item.category || 'file')}
                    </span>
                  </span>
                </div>

                {/* 4. Quick Actions */}
                <div className="col-span-2 flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  {item.path && onRevealInExplorer && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRevealInExplorer(item.path)
                      }}
                      title="Reveal in Windows Explorer"
                      className="p-1 rounded hover:bg-zinc-700/50 text-zinc-400 hover:text-blue-400 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {item.path && onCopyPath && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onCopyPath(item.path)
                      }}
                      title="Copy path to clipboard"
                      className="p-1 rounded hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {item.path && onDeleteNode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteNode(item, false)
                      }}
                      title="Move to Recycle Bin"
                      className="p-1 rounded hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
