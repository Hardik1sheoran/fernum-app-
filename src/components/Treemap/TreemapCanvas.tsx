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
  Sparkles,
  Download,
  AlertTriangle,
  Columns,
  List,
  PlusCircle,
} from 'lucide-react'
import type { FileNode } from '@shared/types'
import {
  computeNestedTreemapLayout,
  findInnermostRect,
  CATEGORY_COLORS,
  formatBytes,
  type NestedTreemapRect,
} from './treemapLayout'

function nodeMatchesSidebarFilters(node: FileNode, filters: Record<string, boolean>): boolean {
  const activeKeys = Object.keys(filters).filter((k) => filters[k])
  if (activeKeys.length === 0) return true

  const name = (node.name || '').toLowerCase()
  const p = (node.path || '').toLowerCase()
  const cat = node.category || ''

  return activeKeys.some((k) => {
    switch (k) {
      case 'trash':
        return name.includes('recycle') || p.includes('recycle') || name.includes('trash')
      case 'nodejs':
        return name.includes('node_modules') || p.includes('node_modules') || (cat === 'code' && /\.(js|ts|jsx|tsx|json)$/i.test(name))
      case 'xcode':
        return name.includes('xcode') || p.includes('deriveddata')
      case 'buildArtifacts':
        return /^(build|dist|target|bin|obj|\.next|\.turbo|out)$/i.test(name) || p.includes('\\target\\') || p.includes('\\dist\\') || p.includes('\\build\\')
      case 'android':
        return name.includes('android') || p.includes('android') || name.includes('.gradle') || p.includes('.gradle')
      case 'docker':
        return name.includes('docker') || p.includes('docker') || p.includes('wsl')
      case 'videos':
        return cat === 'video' || /\.(mp4|mkv|mov|avi|webm|flv|wmv)$/i.test(name)
      case 'diskImages':
        return /\.(iso|img|vhd|vhdx|vmdk|dmg)$/i.test(name)
      case 'archives':
        return cat === 'archive' || /\.(zip|rar|7z|tar|gz|bz2|xz)$/i.test(name)
      case 'iosBackups':
        return name.includes('mobilesync') || p.includes('mobilesync') || name.includes('backup')
      default:
        return false
    }
  })
}
import { Breadcrumb } from '../shared/Breadcrumb'
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal'
import { FileTableView } from './FileTableView'
import { CleanupQueueDrawer } from './CleanupQueueDrawer'
import { DEMO_ROOT_NODE } from './demoTreeData'
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

  const {
    selectedDrive,
    deleteNodeFromTree,
    sidebarFilters,
    searchQuery: storeSearchQuery,
    cleanupQueue,
    addToCleanupQueue,
    removeFromCleanupQueue,
  } = useScanStore()

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
  const [viewMode, setViewMode] = useState<'treemap' | 'table' | 'split'>('treemap')
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedTableNode, setSelectedTableNode] = useState<FileNode | null>(null)

  // Dedicated treemap renderer function for zero-latency drawing
  const drawTreemap = useCallback((rects: NestedTreemapRect[], hovered: NestedTreemapRect | null) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.width / dpr
    const height = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const renderRect = (r: NestedTreemapRect) => {
      if (r.width <= 0 || r.height <= 0) return

      const isHovered = hovered?.node.id === r.node.id
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
        ctx.font = '600 11px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
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
          ctx.font = '600 11px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
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

    for (const r of rects) {
      renderRect(r)
    }
  }, [])

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

    const effectiveRoot = rootNode || DEMO_ROOT_NODE
    const effectiveView = currentViewNode || effectiveRoot

    let nodesToRender = effectiveView?.type === 'file'
      ? [effectiveView]
      : (effectiveView?.children && effectiveView.children.length > 0
          ? effectiveView.children
          : [effectiveView])

    if (activeCategoryFilter !== 'all') {
      if (activeCategoryFilter === 'large') {
        nodesToRender = nodesToRender.filter((n) => n.type === 'file' && (n.size || 0) >= 100 * 1024 * 1024)
      } else {
        nodesToRender = nodesToRender.filter((n) => n.category === activeCategoryFilter || (activeCategoryFilter === 'directory' && n.type === 'directory'))
      }
    }

    const hasActiveSidebarFilter = Object.values(sidebarFilters).some(Boolean)
    if (hasActiveSidebarFilter) {
      nodesToRender = nodesToRender.filter((n) => {
        if (nodeMatchesSidebarFilters(n, sidebarFilters)) return true
        if (n.children && n.children.length > 0) {
          return n.children.some((c) => nodeMatchesSidebarFilters(c, sidebarFilters))
        }
        return false
      })
    }

    const effectiveQuery = (searchQuery.trim() || storeSearchQuery.trim()).toLowerCase()
    if (effectiveQuery) {
      nodesToRender = nodesToRender.filter((n) => n.name.toLowerCase().includes(effectiveQuery) || (n.path && n.path.toLowerCase().includes(effectiveQuery)))
    }

    const computed = computeNestedTreemapLayout(
      nodesToRender,
      { x: 0, y: 0, width, height },
      0,
      { maxDepth: 4, minContainerWidth: 44, minContainerHeight: 40 }
    )
    setLayoutRects(computed)
    drawTreemap(computed, hoveredRectRef.current)
  }, [currentViewNode, rootNode, drawTreemap, activeCategoryFilter, searchQuery, storeSearchQuery, sidebarFilters, viewMode])

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

  // Canvas paint effect: Multi-Level Nested Treemap on layout or hover update
  useEffect(() => {
    drawTreemap(layoutRects, hoveredRect)
  }, [layoutRects, hoveredRect, drawTreemap])

  // Dismiss context menu on outside click or Escape key
  useEffect(() => {
    if (!contextMenu.visible) return

    const handleOutsideClick = () => {
      setContextMenu({ visible: false, x: 0, y: 0, rect: null })
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu({ visible: false, x: 0, y: 0, rect: null })
      }
    }

    window.addEventListener('click', handleOutsideClick)
    window.addEventListener('contextmenu', handleOutsideClick)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleOutsideClick)
      window.removeEventListener('contextmenu', handleOutsideClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu.visible])

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

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (contextMenu.visible) {
      setContextMenu({ visible: false, x: 0, y: 0, rect: null })
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const target = findInnermostRect(layoutRects, mx, my) || hoveredRect
    if (target) {
      setSelectedTableNode(target.node)
      if (target.node.type === 'directory' && target.node.children && target.node.children.length > 0) {
        onDrillDown(target.node)
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

  const { addExcludedPath } = useSettingsStore()
  const { isPro, openUpgradeModal } = useLicenseStore()

  const isItemInCleanupQueue = Boolean(
    contextMenu.rect?.node &&
      cleanupQueue.some(
        (q) => q.path === contextMenu.rect?.node.path || q.id === contextMenu.rect?.node.id
      )
  )

  const handleToggleCleanupQueue = () => {
    if (!contextMenu.rect?.node) return
    const n = contextMenu.rect.node
    if (isItemInCleanupQueue) {
      removeFromCleanupQueue(n.path || n.id)
      setToastMessage(`Removed "${n.name}" from Cleanup Queue`)
    } else {
      addToCleanupQueue(n)
      setToastMessage(`Added "${n.name}" to Cleanup Queue`)
    }
    setTimeout(() => setToastMessage(null), 3000)
    setContextMenu({ visible: false, x: 0, y: 0, rect: null })
  }

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

  const handleRevealPath = (targetPath: string) => {
    if (targetPath && window.electronAPI) {
      window.electronAPI.revealInExplorer(targetPath)
    }
  }

  const handleDeleteItem = (targetNode: FileNode, permanent: boolean) => {
    if (!isPro) {
      openUpgradeModal('Delete files within the app')
      return
    }
    setConfirmModal({
      isOpen: true,
      node: targetNode,
      permanent,
      isDeleting: false,
      errorMessage: null,
    })
  }

  const handleCopyAnyPath = (targetPath: string) => {
    if (targetPath) {
      navigator.clipboard.writeText(targetPath)
      setCopiedNotification(true)
      setTimeout(() => setCopiedNotification(false), 2000)
    }
  }

  const handleDrillFromMenu = () => {
    if (contextMenu.rect?.node.type === 'directory') {
      onDrillDown(contextMenu.rect.node)
    }
    setContextMenu({ visible: false, x: 0, y: 0, rect: null })
  }

  const handleUpgradeToPro = () => {
    openUpgradeModal('Unlock Full Drive Storage Scan (Remove 70GB Cap)')
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

  // Storage Audit Report Exporter (Pro)
  const handleExportReport = (format: 'csv' | 'html') => {
    if (!isPro) {
      openUpgradeModal('Storage Audit Reports (CSV & HTML Export)')
      return
    }
    if (!currentViewNode) return

    const items = currentViewNode.children || []
    const totalSize = currentViewNode.size || 1

    if (format === 'csv') {
      const headers = ['Name', 'Path', 'Type', 'Category', 'Size (Bytes)', 'Formatted Size', 'Share (%)']
      const rows = items.map((item) => {
        const share = ((item.size / totalSize) * 100).toFixed(2)
        return `"${item.name.replace(/"/g, '""')}","${item.path.replace(/"/g, '""')}","${item.type}","${item.category}",${item.size},"${formatBytes(item.size)}","${share}%"`
      })
      const csvContent = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fernum-storage-audit-${Date.now()}.csv`
      link.click()
      URL.revokeObjectURL(url)
      setToastMessage('Storage audit CSV exported successfully!')
      setTimeout(() => setToastMessage(null), 3000)
    } else {
      const rowsHtml = items.slice(0, 50).map((item) => {
        const share = ((item.size / totalSize) * 100).toFixed(1)
        return `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; font-weight: 500;">${item.name}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; font-family: monospace; color: #a1a1aa; font-size: 11px;">${item.path}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; text-transform: capitalize; color: #60a5fa;">${item.category}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; text-align: right; font-family: monospace; font-weight: bold; color: #38bdf8;">${formatBytes(item.size)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #27272a; text-align: right; color: #e4e4e7;">${share}%</td>
          </tr>
        `
      }).join('')

      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fernum Storage Audit - ${currentViewNode.name}</title>
  <style>
    body { font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; background: #0f1117; color: #f4f4f5; margin: 0; padding: 32px; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; max-width: 960px; margin: 0 auto; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; font-size: 20px; color: #ffffff; display: flex; align-items: center; justify-content: space-between; }
    .meta { font-size: 13px; color: #a1a1aa; margin-bottom: 24px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat-box { background: #27272a; border-radius: 8px; padding: 12px 16px; flex: 1; }
    .stat-label { font-size: 11px; text-transform: uppercase; color: #a1a1aa; letter-spacing: 0.5px; }
    .stat-val { font-size: 20px; font-weight: bold; color: #38bdf8; margin-top: 4px; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { background: #27272a; padding: 10px 12px; font-weight: 600; color: #e4e4e7; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="card">
    <h1><span>Fernum Storage Audit Report</span><span style="font-size: 11px; background: rgba(59,130,246,0.2); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); padding: 4px 8px; border-radius: 4px;">Verified Pro Report</span></h1>
    <div class="meta">Target: <strong>${currentViewNode.path}</strong> &bull; Generated on: ${new Date().toLocaleString()}</div>
    <div class="stats">
      <div class="stat-box"><div class="stat-label">Total Volume Analyzed</div><div class="stat-val">${formatBytes(currentViewNode.size)}</div></div>
      <div class="stat-box"><div class="stat-label">Sub-items Count</div><div class="stat-val" style="color: #e4e4e7;">${items.length}</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Item Name</th>
          <th>File Path</th>
          <th>Category</th>
          <th style="text-align: right;">Size</th>
          <th style="text-align: right;">Share</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fernum-storage-report-${Date.now()}.html`
      link.click()
      URL.revokeObjectURL(url)
      setToastMessage('Storage audit HTML report exported!')
      setTimeout(() => setToastMessage(null), 3000)
    }
  }

  const isLowSpace = Boolean(
    selectedDrive &&
    selectedDrive.totalBytes > 0 &&
    (selectedDrive.freeBytes / selectedDrive.totalBytes) < 0.15
  )

  const totalChildCount = currentViewNode?.children?.length || 0
  const canGoBack = breadcrumbs.length > 1

  const renderCanvasContent = () => (
    <>
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

      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className="w-full h-full block cursor-pointer"
      />

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

      {/* Floating Cleanup Queue in bottom right */}
      <CleanupQueueDrawer />
    </>
  )

  return (
    <div className="flex flex-col h-full bg-[#0c0e12] overflow-hidden select-none">
      {/* Header bar with Navigation, Breadcrumbs & Stats (rendered when in split/table mode or drilled down) */}
      {(viewMode !== 'treemap' || breadcrumbs.length > 1) && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 border-b border-[#1f2229] bg-[#111317]">
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

          {/* View Mode Segmented Controls */}
          {rootNode && (
            <div className="flex items-center rounded-lg bg-[#242429] border border-[#2f2f36] p-0.5 text-xs ml-1 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                  viewMode === 'split'
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Split View: Organized Table & Treemap together"
              >
                <Columns className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Split</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="File List: Organized table sorted by size & type"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden md:inline">File List</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('treemap')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer ${
                  viewMode === 'treemap'
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Treemap: Full visual squarified treemap"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Treemap</span>
              </button>
            </div>
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

          {/* Export Report Buttons */}
          <div className="flex items-center gap-1.5 ml-1">
            <button
              onClick={() => handleExportReport('csv')}
              title={isPro ? "Export storage audit CSV" : "Pro Feature: Export storage audit CSV"}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#28282e] hover:bg-[#32323a] text-zinc-300 border border-[#363640] text-[11px] transition-colors"
            >
              <Download className="w-3 h-3 text-blue-400" />
              <span>CSV</span>
              {!isPro && <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 rounded font-bold">PRO</span>}
            </button>
            <button
              onClick={() => handleExportReport('html')}
              title={isPro ? "Export storage audit HTML report" : "Pro Feature: Export storage audit HTML report"}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#28282e] hover:bg-[#32323a] text-zinc-300 border border-[#363640] text-[11px] transition-colors"
            >
              <Download className="w-3 h-3 text-emerald-400" />
              <span>HTML</span>
              {!isPro && <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 rounded font-bold">PRO</span>}
            </button>
          </div>
        </div>
        </div>
      )}

      {/* Low Disk Space Guardian Banner */}
      {isLowSpace && selectedDrive && (
        <div className="mx-3 mt-2 px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 backdrop-blur-md text-rose-200 text-xs flex items-center justify-between shadow-md shrink-0 z-10 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>Storage Guardian:</strong> {selectedDrive.name} has only{' '}
              <strong className="font-mono text-white">{(selectedDrive.freeBytes / (1024 ** 3)).toFixed(1)} GB</strong> free ({Math.round((selectedDrive.freeBytes / selectedDrive.totalBytes) * 100)}%). Run Disk Cleanup or Duplicate Hunter to reclaim space.
            </span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30">
            Low Storage Alert
          </span>
        </div>
      )}

      {/* Free Tier 70GB Capped Banner */}
      {rootNode && rootNode?.capped && !isPro && (
        <div className="mx-3 mt-2 px-4 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 dark:bg-gradient-to-r dark:from-amber-950/70 dark:via-amber-900/45 dark:to-slate-900/75 backdrop-blur-md text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between shadow-md animate-fade-in ring-1 ring-amber-500/25 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.7)] flex-shrink-0" />
            <span className="font-medium tracking-tight">
              Free version shows the first 70GB scanned. Upgrade to Pro to see your entire drive.
            </span>
          </div>
          <button
            onClick={handleUpgradeToPro}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 shadow-md transition-all flex items-center gap-1.5 flex-shrink-0 active:scale-95 cursor-pointer font-sans"
          >
            <Sparkles className="w-3.5 h-3.5 fill-current" />
            Upgrade to Pro
          </button>
        </div>
      )}

      {currentViewNode?.truncatedAtDepth && (
        <div className="mx-3 mt-2 px-3 py-1.5 rounded-lg bg-amber-500/15 backdrop-blur-sm border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between shadow-xs shrink-0 z-10">
          <span className="flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Max scan depth reached for this folder. Sub-items beyond this depth were not scanned.</span>
          </span>
        </div>
      )}

      {/* Main Canvas Area */}
      {viewMode === 'table' ? (
        <div className="flex-1 min-h-[400px] flex flex-col overflow-hidden bg-[#13151b]">
          <FileTableView
            currentViewNode={currentViewNode || rootNode || DEMO_ROOT_NODE}
            selectedNode={selectedTableNode}
            onSelectNode={(node) => {
              setSelectedTableNode(node)
            }}
            onDrillDown={(node) => {
              onDrillDown(node)
              setSelectedTableNode(null)
            }}
            onRevealInExplorer={handleRevealPath}
            onDeleteNode={handleDeleteItem}
            onCopyPath={handleCopyAnyPath}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            activeCategoryFilter={activeCategoryFilter}
            onCategoryFilterChange={setActiveCategoryFilter}
            className="flex-1 h-full"
          />
        </div>
      ) : viewMode === 'split' ? (
        <div className="flex-1 min-h-[460px] flex flex-col overflow-hidden">
          {/* Top Panel: Organized File Explorer Table */}
          <div className="h-[46%] min-h-[190px] border-b border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden bg-[#13151b]">
            <FileTableView
              currentViewNode={currentViewNode || rootNode || DEMO_ROOT_NODE}
              selectedNode={selectedTableNode}
              onSelectNode={(node) => {
                setSelectedTableNode(node)
              }}
              onDrillDown={(node) => {
                onDrillDown(node)
                setSelectedTableNode(null)
              }}
              onRevealInExplorer={handleRevealPath}
              onDeleteNode={handleDeleteItem}
              onCopyPath={handleCopyAnyPath}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              activeCategoryFilter={activeCategoryFilter}
              onCategoryFilterChange={setActiveCategoryFilter}
              className="flex-1 h-full"
            />
          </div>

          {/* Bottom Panel: Interactive Squarified Treemap */}
          <div
            ref={containerRef}
            className="relative flex-1 min-h-[220px] bg-[#0c0e12] flex items-center justify-center overflow-hidden"
          >
            {renderCanvasContent()}
          </div>
        </div>
      ) : (
        /* Full Treemap Mode */
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[380px] bg-[#0c0e12] flex items-center justify-center overflow-hidden"
        >
          {renderCanvasContent()}
        </div>
      )}

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
                onClick={handleToggleCleanupQueue}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/10 text-amber-400 text-left transition-colors font-medium"
              >
                <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>{isItemInCleanupQueue ? 'Remove from Cleanup Queue' : 'Add to Cleanup Queue'}</span>
              </button>

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
