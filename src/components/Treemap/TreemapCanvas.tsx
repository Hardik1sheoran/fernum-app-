import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  LayoutGrid,
  Loader2,
  FolderOpen,
  Trash2,
  Copy,
  ArrowUpLeft,
  Folder,
  Check,
  Shield,
  Flame,
} from 'lucide-react'
import type { FileNode } from '@shared/types'
import {
  computeNestedTreemapLayout,
  findInnermostRect,
  CATEGORY_COLORS,
  formatBytes,
  type NestedTreemapRect,
} from './treemapLayout'
import { Breadcrumb } from '../shared/Breadcrumb'
import { EmptyState } from '../shared/EmptyState'
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal'
import { useScanStore } from '../../stores/scanStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useLicenseStore } from '../../stores/licenseStore'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  rect: NestedTreemapRect | null
}

interface TreemapCanvasProps {
  rootNode: FileNode | null
  currentViewNode: FileNode | null
  breadcrumbs: FileNode[]
  isScanning: boolean
  scanProgressPercentage: number
  currentScanPath: string
  scannedFiles?: number
  scannedBytes?: number
  onCancelScan?: () => void
  onDrillDown: (node: FileNode) => void
  onDrillUp: (index: number) => void
  onResetView: () => void
}

export const TreemapCanvas: React.FC<TreemapCanvasProps> = ({
  rootNode,
  currentViewNode,
  breadcrumbs,
  isScanning,
  scanProgressPercentage,
  currentScanPath,
  scannedFiles = 0,
  scannedBytes = 0,
  onCancelScan,
  onDrillDown,
  onDrillUp,
  onResetView,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [layoutRects, setLayoutRects] = useState<NestedTreemapRect[]>([])
  const [hoveredRect, setHoveredRect] = useState<NestedTreemapRect | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const hoveredRectRef = useRef<NestedTreemapRect | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    rect: null,
  })
  const [copiedNotification, setCopiedNotification] = useState(false)

  // Recalculate layout whenever view node or container size changes
  const updateLayout = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const width = Math.floor(rect.width)
    const height = Math.floor(rect.height)

    if (width <= 0 || height <= 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const nodesToRender = currentViewNode?.children || []
    const computed = computeNestedTreemapLayout(
      nodesToRender,
      { x: 0, y: 0, width, height },
      0,
      { maxDepth: 4, minContainerWidth: 44, minContainerHeight: 40 }
    )
    setLayoutRects(computed)
  }, [currentViewNode])

  useEffect(() => {
    updateLayout()

    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      updateLayout()
    })
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [updateLayout])

  // Canvas paint effect: Multi-Level Nested Treemap (matching DissectMac)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.width / dpr
    const height = canvas.height / dpr

    ctx.clearRect(0, 0, width, height)

    const renderRect = (r: NestedTreemapRect) => {
      if (r.width <= 0 || r.height <= 0) return

      const isHovered = hoveredRect?.node.id === r.node.id
      ctx.save()

      if (r.isContainer) {
        // 1. Container background (deep dark tint for high-contrast nesting)
        ctx.fillStyle = r.color
        ctx.fillRect(r.x, r.y, r.width, r.height)

        // 2. Container border
        ctx.strokeStyle = isHovered ? '#ffffff' : r.borderColor
        ctx.lineWidth = isHovered ? 2 : 1.2
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.width - 1), Math.max(0, r.height - 1))

        // 3. Container header bar
        ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.42)'
        ctx.fillRect(r.x + 1, r.y + 1, Math.max(0, r.width - 2), r.headerHeight)

        // Divider line under header
        ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.1)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(r.x + 1, r.y + r.headerHeight + 0.5)
        ctx.lineTo(r.x + r.width - 1, r.y + r.headerHeight + 0.5)
        ctx.stroke()

        // 4. Header label text
        ctx.font = '600 11px "Segoe UI Variable", "Segoe UI", -apple-system, sans-serif'
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.95)'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
        ctx.shadowBlur = 2
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1

        const title = r.node.name
        const availableWidth = r.width - 8
        let displayTitle = title
        if (ctx.measureText(displayTitle).width > availableWidth) {
          while (displayTitle.length > 2 && ctx.measureText(displayTitle + '…').width > availableWidth) {
            displayTitle = displayTitle.slice(0, -1)
          }
          displayTitle += '…'
        }
        ctx.fillText(displayTitle, r.x + 5, r.y + r.headerHeight - 5)

        // Show folder size on right side of header if wide enough
        if (r.width >= 135) {
          ctx.font = '500 10px "Segoe UI Variable", "Segoe UI", sans-serif'
          ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
          const sizeText = r.formattedSize
          const sizeWidth = ctx.measureText(sizeText).width
          const titleWidth = ctx.measureText(displayTitle).width
          if (r.width - sizeWidth - 10 > titleWidth + 12) {
            ctx.fillText(sizeText, r.x + r.width - sizeWidth - 6, r.y + r.headerHeight - 5)
          }
        }

        // 5. Recursively render nested children inside container content box
        if (r.children && r.children.length > 0) {
          for (const child of r.children) {
            renderRect(child)
          }
        }
      } else {
        // Leaf block (File or small leaf folder)
        ctx.fillStyle = r.color
        ctx.globalAlpha = isHovered ? 1.0 : 0.88
        ctx.fillRect(r.x, r.y, r.width, r.height)

        ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(0, 0, 0, 0.35)'
        ctx.lineWidth = isHovered ? 2 : 1
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.width - 1), Math.max(0, r.height - 1))

        if (r.canFitTitle) {
          ctx.globalAlpha = 1.0
          ctx.font = '600 11px "Segoe UI Variable", "Segoe UI", -apple-system, sans-serif'
          ctx.fillStyle = '#ffffff'
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
          ctx.shadowBlur = 3
          ctx.shadowOffsetX = 1
          ctx.shadowOffsetY = 1

          const title = r.node.name
          const maxTextWidth = r.width - 8
          let displayTitle = title
          if (ctx.measureText(title).width > maxTextWidth) {
            while (displayTitle.length > 2 && ctx.measureText(displayTitle + '…').width > maxTextWidth) {
              displayTitle = displayTitle.slice(0, -1)
            }
            displayTitle += '…'
          }
          ctx.fillText(displayTitle, r.x + 4, r.y + 14)

          if (r.canFitSubtitle) {
            ctx.font = '500 10px "Segoe UI Variable", "Segoe UI", sans-serif'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
            ctx.fillText(r.formattedSize, r.x + 4, r.y + 26)
          }
        }
      }

      ctx.restore()
    }

    for (const r of layoutRects) {
      renderRect(r)
    }
  }, [layoutRects, hoveredRect])

  // Mouse move hit-testing using hierarchical innermost finder
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const found = findInnermostRect(layoutRects, mx, my) || null
    if (found?.node.id !== hoveredRectRef.current?.node.id) {
      hoveredRectRef.current = found
      setHoveredRect(found)
      if (found) {
        setTooltipPos({ x: e.clientX, y: e.clientY })
      }
    }
  }

  const handleMouseLeave = () => {
    if (hoveredRectRef.current !== null) {
      hoveredRectRef.current = null
      setHoveredRect(null)
    }
  }

  const handleClick = () => {
    if (contextMenu.visible) {
      setContextMenu({ visible: false, x: 0, y: 0, rect: null })
      return
    }

    if (hoveredRect && hoveredRect.node.type === 'directory') {
      if (hoveredRect.node.children && hoveredRect.node.children.length > 0) {
        onDrillDown(hoveredRect.node)
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!hoveredRect) return

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      rect: hoveredRect,
    })
  }

  const { deleteNodeFromTree } = useScanStore()
  const { addExcludedPath } = useSettingsStore()
  const { isPro, openUpgradeModal } = useLicenseStore()

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    node: FileNode | null
    permanent: boolean
    isDeleting: boolean
    errorMessage: string | null
  }>({
    isOpen: false,
    node: null,
    permanent: false,
    isDeleting: false,
    errorMessage: null,
  })

  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const handleRevealInExplorer = () => {
    if (!isPro) {
      setContextMenu({ visible: false, x: 0, y: 0, rect: null })
      openUpgradeModal("One-click 'Show in Explorer'")
      return
    }
    if (contextMenu.rect?.node.path && window.electronAPI) {
      window.electronAPI.revealInExplorer(contextMenu.rect.node.path)
    }
    setContextMenu({ visible: false, x: 0, y: 0, rect: null })
  }

  const handleOpenDeleteModal = (permanent: boolean) => {
    if (!contextMenu.rect?.node) return
    if (!isPro) {
      setContextMenu({ visible: false, x: 0, y: 0, rect: null })
      openUpgradeModal('Delete files within the app')
      return
    }
    setConfirmModal({
      isOpen: true,
      node: contextMenu.rect.node,
      permanent,
      isDeleting: false,
      errorMessage: null,
    })
    setContextMenu({ visible: false, x: 0, y: 0, rect: null })
  }

  const handleConfirmDelete = async (permanent: boolean) => {
    const node = confirmModal.node
    if (!node || !window.electronAPI) return

    setConfirmModal((prev) => ({ ...prev, isDeleting: true, errorMessage: null }))

    try {
      const res = permanent
        ? await window.electronAPI.deletePermanently(node.path)
        : await window.electronAPI.moveToTrash(node.path)

      if (res.success) {
        const { freedBytes } = deleteNodeFromTree(node.path)
        setConfirmModal({
          isOpen: false,
          node: null,
          permanent: false,
          isDeleting: false,
          errorMessage: null,
        })
        setToastMessage(
          permanent
            ? `Permanently deleted "${node.name}" (Freed ${formatBytes(freedBytes)})`
            : `Moved "${node.name}" to Recycle Bin (Freed ${formatBytes(freedBytes)})`
        )
        setTimeout(() => setToastMessage(null), 3500)
      } else {
        setConfirmModal((prev) => ({
          ...prev,
          isDeleting: false,
          errorMessage: res.error || 'Failed to delete item.',
        }))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setConfirmModal((prev) => ({
        ...prev,
        isDeleting: false,
        errorMessage: msg,
      }))
    }
  }

  const handleExcludeFolder = () => {
    if (contextMenu.rect?.node.path) {
      addExcludedPath(contextMenu.rect.node.path)
      setToastMessage(`Added "${contextMenu.rect.node.name}" to scan exclusions`)
      setTimeout(() => setToastMessage(null), 3000)
    }
    setContextMenu({ visible: false, x: 0, y: 0, rect: null })
  }

  const handleCopyPath = () => {
    if (contextMenu.rect?.node.path) {
      navigator.clipboard.writeText(contextMenu.rect.node.path)
      setCopiedNotification(true)
      setTimeout(() => setCopiedNotification(false), 2000)
    }
    setContextMenu({ visible: false, x: 0, y: 0, rect: null })
  }

  const handleDrillFromMenu = () => {
    if (contextMenu.rect?.node.type === 'directory') {
      onDrillDown(contextMenu.rect.node)
    }
    setContextMenu({ visible: false, x: 0, y: 0, rect: null })
  }

  // Close context menu on global click
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, rect: null })
      }
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [contextMenu.visible])

  const totalChildCount = currentViewNode?.children?.length || 0
  const canGoBack = breadcrumbs.length > 1

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#191d24] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs relative select-none">
      {/* Header bar with Navigation, Breadcrumbs & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#15181f]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <LayoutGrid className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mr-1 flex-shrink-0">
              Disk Treemap
            </span>
          </div>

          {canGoBack && (
            <button
              onClick={() => onDrillUp(breadcrumbs.length - 2)}
              title="Go up one level"
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs"
            >
              <ArrowUpLeft className="w-3.5 h-3.5" />
              <span>Up</span>
            </button>
          )}

          {breadcrumbs.length > 0 && (
            <Breadcrumb items={breadcrumbs} onSelect={onDrillUp} />
          )}
        </div>

        {/* Details & Legend */}
        <div className="flex items-center gap-3">
          {currentViewNode && (
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatBytes(currentViewNode.size)}
              </span>
              <span>•</span>
              <span>{totalChildCount.toLocaleString()} items</span>
            </div>
          )}

          <div className="hidden lg:flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            {Object.entries(CATEGORY_COLORS).slice(0, 6).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1 flex-shrink-0">
                <span
                  className="w-2.5 h-2.5 rounded-xs"
                  style={{ backgroundColor: color }}
                />
                <span className="capitalize">{cat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-[380px] p-2 bg-slate-950 flex items-center justify-center overflow-hidden"
      >
        {/* Non-blocking Floating Scanning HUD Bar */}
        {isScanning && (
          <div className="absolute top-3 left-4 right-4 z-30 flex items-center justify-between px-3.5 py-2 rounded-lg bg-slate-900/95 border border-white/[0.1] shadow-lg text-xs animate-fade-in pointer-events-auto">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-6 h-6 rounded bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100">Scanning Disk</span>
                  <span className="text-blue-400 font-mono text-[11px]">
                    {scannedFiles.toLocaleString()} files ({formatBytes(scannedBytes)})
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate max-w-lg font-mono">
                  {currentScanPath || 'Traversing folders…'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="w-28 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, scanProgressPercentage)}%` }}
                />
              </div>
              {onCancelScan && (
                <button
                  onClick={onCancelScan}
                  className="px-2.5 py-0.5 rounded text-xs font-medium bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 transition-colors"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        )}

        {rootNode ? (
          <>
            {currentViewNode?.truncatedAtDepth && (
              <div className="absolute top-2 left-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-amber-500/15 backdrop-blur-sm border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between shadow-xs">
                <span className="flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Max scan depth reached for this folder. Sub-items beyond this depth were not scanned.</span>
                </span>
              </div>
            )}
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              onContextMenu={handleContextMenu}
              className="w-full h-full block cursor-pointer"
            />
          </>
        ) : isScanning ? (
          <div className="w-full max-w-sm p-6 rounded-xl bg-slate-900/80 border border-white/[0.08] text-center space-y-3 shadow-lg animate-fade-in">
            <div className="w-10 h-10 mx-auto rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-blue-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-slate-100">Scanning Filesystem…</h4>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-xs mx-auto px-2 py-0.5 rounded bg-black/30 border border-white/[0.04]">
                {currentScanPath || 'Locating files…'}
              </p>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              {scannedFiles.toLocaleString()} files scanned so far
            </p>
          </div>
        ) : (
          <EmptyState
            icon={<LayoutGrid className="w-7 h-7" />}
            title="No Active Drive Scan"
            description="Select a drive or click 'Scan Home' to generate an interactive squarified treemap of your disk space."
            className="w-full max-w-lg border-none bg-transparent"
          />
        )}

        {/* Floating Tooltip Card */}
        {hoveredRect && (
          <div
            className="fixed z-50 pointer-events-none p-3 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 text-white shadow-2xl text-xs space-y-1.5 max-w-xs transition-all transform -translate-y-full -translate-x-1/2"
            style={{
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y - 12}px`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-xs flex-shrink-0"
                style={{ backgroundColor: hoveredRect.color }}
              />
              <span className="font-bold truncate text-slate-100">
                {hoveredRect.node.name}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono truncate">
              {hoveredRect.node.path || 'Aggregated group'}
            </div>
            <div className="pt-1 border-t border-slate-800 flex justify-between items-center text-[11px]">
              <span className="font-semibold text-blue-400">
                {hoveredRect.formattedSize}
              </span>
              <span className="text-slate-400">
                {hoveredRect.percentageOfParent}% of parent
              </span>
            </div>
            {hoveredRect.node.type === 'directory' && (
              <div className="text-[10px] text-blue-300 font-medium flex items-center gap-1">
                <span>📁 Click to drill down into folder</span>
              </div>
            )}
            {hoveredRect.node.truncatedAtDepth && (
              <div className="text-[10px] text-amber-300 font-medium flex items-center gap-1">
                <span>⚠️ Max scan depth reached — contents not fully indexed</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu.visible && contextMenu.rect && (
        <div
          className="fixed z-50 py-1.5 px-1 min-w-[190px] rounded-xl bg-white/95 dark:bg-[#1f242d]/95 backdrop-blur-md border border-slate-200 dark:border-slate-700/80 shadow-2xl text-xs space-y-0.5 text-slate-800 dark:text-slate-200"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1">
            {contextMenu.rect.node.name}
          </div>

          {contextMenu.rect.node.type === 'directory' &&
            contextMenu.rect.node.children &&
            contextMenu.rect.node.children.length > 0 && (
              <button
                onClick={handleDrillFromMenu}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors font-medium text-blue-600 dark:text-blue-400"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>
                  {contextMenu.rect.node.id === '__aggregated_others__'
                    ? 'Inspect Other Items'
                    : 'Drill into Folder'}
                </span>
              </button>
            )}

          {/* Only show filesystem actions for real physical files/folders with valid paths */}
          {contextMenu.rect.node.id !== '__aggregated_others__' && Boolean(contextMenu.rect.node.path) && (
            <>
              <button
                onClick={handleRevealInExplorer}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                <span>Reveal in File Explorer</span>
              </button>

              <button
                onClick={handleCopyPath}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy Full Path</span>
              </button>

              {contextMenu.rect.node.type === 'directory' && (
                <button
                  onClick={handleExcludeFolder}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-500" />
                  <span>Exclude from Scans</span>
                </button>
              )}

              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

              <button
                onClick={() => handleOpenDeleteModal(false)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-left transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Recycle Bin</span>
              </button>

              <button
                onClick={() => handleOpenDeleteModal(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-left transition-colors font-medium"
              >
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                <span>Delete Permanently</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Copy notification popup */}
      {copiedNotification && (
        <div className="absolute bottom-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs shadow-lg animate-fade-in">
          <Check className="w-3.5 h-3.5" />
          <span>Path copied to clipboard</span>
        </div>
      )}

      {/* Reclaimed toast notification */}
      {toastMessage && (
        <div className="absolute bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs shadow-2xl border border-slate-700 dark:border-slate-200 animate-fade-in font-medium">
          <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={confirmModal.isOpen}
        targetNode={confirmModal.node}
        initialPermanent={confirmModal.permanent}
        onConfirm={handleConfirmDelete}
        onCancel={() =>
          setConfirmModal({
            isOpen: false,
            node: null,
            permanent: false,
            isDeleting: false,
            errorMessage: null,
          })
        }
        isDeleting={confirmModal.isDeleting}
        errorMessage={confirmModal.errorMessage}
      />

      {/* Footer Details */}
      <div className="px-4 py-2 bg-slate-50/80 dark:bg-[#14171d] border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span>💡 Tip: Click blocks to drill down; right-click for Explorer and Recycle Bin actions</span>
        </div>
        {rootNode && (
          <button
            onClick={onResetView}
            className="font-medium text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            Reset to Drive Root
          </button>
        )}
      </div>
    </div>
  )
}
