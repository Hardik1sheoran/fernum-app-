import React, { useState } from 'react'
import {
  HardDrive,
  RefreshCw,
  Sparkles,
  Search,
  ChevronDown,
  LayoutGrid,
  Activity,
  Palette,
  Home,
  ExternalLink,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useScanStore } from '../../stores/scanStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { formatBytes } from '../Treemap/treemapLayout'
import type { ThemeMode } from '../../stores/settingsStore'
import type { TabKey } from './TabNavigation'
import { FernumLogo } from './FernumLogo'

interface HeaderProps {
  activeTab?: TabKey
  onSelectTab?: (tab: TabKey) => void
  onRefreshDrives?: () => void
  onOpenExclusions?: () => void
  onOpenPrivacy?: () => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onRevealExplorer?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  activeTab = 'storage',
  onSelectTab,
  onRefreshDrives,
  onOpenExclusions,
  onOpenPrivacy,
  searchQuery,
  onSearchChange,
  onRevealExplorer,
}) => {
  const { theme, setTheme } = useTheme()
  const {
    selectedDrive,
    isLoadingDrives,
    drives,
    setSelectedDrive,
    currentViewNode,
    rootNode,
    scanProgress,
    searchQuery: storeSearchQuery,
    setSearchQuery: storeSetSearchQuery,
  } = useScanStore()
  const { isPro, openUpgradeModal } = useLicenseStore()
  const [isDriveMenuOpen, setIsDriveMenuOpen] = useState(false)
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [searchScope, setSearchScope] = useState<'Home' | 'Drive' | 'Folder'>('Home')

  const query = searchQuery !== undefined ? searchQuery : storeSearchQuery
  const handleQueryChange = (val: string) => {
    if (onSearchChange) onSearchChange(val)
    storeSetSearchQuery(val)
  }

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme)
    setIsThemeMenuOpen(false)
  }

  const active = selectedDrive || drives[0] || {
    id: 'C:',
    name: 'Local Disk (C:)',
    path: 'C:\\',
    totalBytes: 245.11 * 1024 ** 3,
    freeBytes: 19.97 * 1024 ** 3,
    usedBytes: 225.14 * 1024 ** 3,
    isSystem: true,
  }

  const displayTotalGB = (active.totalBytes / 1024 ** 3).toFixed(2)

  return (
    <div className="flex flex-col select-none border-b border-[#242429] bg-[#0d0f12] text-zinc-100 relative z-30">
      {/* 1. Native Windows 11 Fluent Title Bar */}
      <div className="h-8 pl-3 pr-0 flex items-center justify-between bg-[#0a0c10] border-b border-[#1b1e24] drag-region text-xs">
        {/* Left Windows App Brand & System Identity */}
        <div className="flex items-center gap-2.5 no-drag">
          <FernumLogo className="w-4 h-4" variant="icon" />
          <span className="font-semibold text-zinc-200 text-xs tracking-tight">
            Fernum
          </span>
          <span className="text-zinc-600 text-[11px]">|</span>
          <span className="text-zinc-400 text-[11px] font-medium hidden sm:inline">
            Storage Analyzer for Windows
          </span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Windows 11
          </span>
        </div>

        {/* Right Native Windows Window Caption Buttons */}
        <div className="no-drag flex items-center h-full">
          <button
            onClick={() => window.electronAPI?.minimizeWindow?.()}
            title="Minimize"
            aria-label="Minimize"
            className="h-8 w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 10 1" fill="none">
              <path d="M0 0.5H10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI?.maximizeWindow?.()}
            title="Maximize"
            aria-label="Maximize"
            className="h-8 w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI?.closeWindow?.()}
            title="Close"
            aria-label="Close"
            className="h-8 w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#e81123] active:bg-[#c4101e] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="h-12 px-3 flex items-center justify-between gap-4 bg-[#14161a] border-b border-[#22252c]">
        {/* Brand */}
        <div
          className="flex items-center gap-2.5 shrink-0 cursor-pointer group"
          onClick={() => onSelectTab?.('storage')}
        >
          <FernumLogo className="w-5 h-5 group-hover:scale-105 transition-transform" variant="cyan" glow />
          <span className="font-bold text-sm tracking-tight text-white group-hover:text-blue-400 transition-colors">
            Fernum
          </span>
        </div>

        {/* Center Search Bar with scope pill */}
        <div className="flex-1 max-w-xl flex items-center">
          <div className="w-full flex items-center bg-[#1c1f26] border border-[#2d313b] rounded-md px-3 py-1.5 text-xs text-zinc-200 focus-within:border-blue-500/80 transition-all shadow-inner">
            <Search className="w-3.5 h-3.5 text-zinc-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Quick power search..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-xs text-zinc-200 placeholder-zinc-500 font-normal"
            />
            {/* Scope Pill inside search */}
            <div
              onClick={() =>
                setSearchScope((prev) =>
                  prev === 'Home' ? 'Drive' : prev === 'Drive' ? 'Folder' : 'Home'
                )
              }
              className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded bg-[#282c37] border border-[#373c4a] text-zinc-300 text-[11px] font-medium shrink-0 cursor-pointer hover:bg-[#323745] transition-colors"
              title="Click to toggle search scope (Home / Drive / Folder)"
            >
              <Home className="w-3 h-3 text-zinc-400" />
              <span>{searchScope}</span>
              <ChevronDown className="w-2.5 h-2.5 text-zinc-400 ml-0.5" />
            </div>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Apps Button */}
          <button
            onClick={() => onSelectTab?.(activeTab === 'apps' ? 'storage' : 'apps')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'apps'
                ? 'bg-blue-600/30 border border-blue-500/50 text-blue-200'
                : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Installed Applications and Cleanup"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-zinc-400" />
            <span>Apps</span>
          </button>

          {/* Activity / Monitor Button */}
          <button
            onClick={() => onSelectTab?.(activeTab === 'monitor' ? 'storage' : 'monitor')}
            className={`p-1.5 rounded transition-colors ${
              activeTab === 'monitor'
                ? 'bg-blue-600/30 border border-blue-500/50 text-blue-200'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Live Performance & Hardware Monitor"
          >
            <Activity className="w-4 h-4" />
          </button>

          {/* Theme Palette Button with Popover */}
          <div className="relative">
            <button
              onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
              className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Theme Customisation"
            >
              <Palette className="w-4 h-4" />
            </button>
            {isThemeMenuOpen && (
              <div className="absolute right-0 mt-1 w-36 py-1 bg-[#1a1c22] border border-[#2d313b] rounded-lg shadow-xl text-xs z-50 animate-fade-in">
                {(['dark', 'forest', 'ocean', 'aurora', 'rainbow', 'light'] as ThemeMode[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    className={`w-full px-3 py-1.5 text-left capitalize flex items-center justify-between hover:bg-white/[0.08] ${
                      theme === t ? 'text-amber-400 font-semibold' : 'text-zinc-300'
                    }`}
                  >
                    <span>{t}</span>
                    {theme === t && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PRO ACTIVATED Badge */}
          {isPro ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-bold shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>PRO ACTIVATED</span>
            </div>
          ) : (
            <button
              onClick={() => openUpgradeModal()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Unlock Lifetime Pro for $12.99"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>PRO ACTIVATED</span>
            </button>
          )}

          {/* Offline Local Privacy */}
          {onOpenPrivacy && (
            <button
              onClick={onOpenPrivacy}
              title="100% Offline Local Privacy"
              className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          )}

          {/* Scan Exclusions & Filter */}
          {onOpenExclusions && (
            <button
              onClick={onOpenExclusions}
              title="Scan Exclusions & Filters"
              className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Refresh / Reload */}
          <button
            onClick={onRefreshDrives}
            disabled={isLoadingDrives}
            className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Refresh System Drives"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrives ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3. Sub-Header Bar (Drive Picker & Target Stats) */}
      <div className="h-9 px-3 flex items-center justify-between bg-[#111317] border-b border-[#1f2229] text-xs">
        {/* Left: Local Disk Selector Pill */}
        <div className="relative">
          <button
            onClick={() => setIsDriveMenuOpen(!isDriveMenuOpen)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#1d2027] border border-[#2b303a] hover:bg-[#252933] text-zinc-200 font-medium transition-colors cursor-pointer"
          >
            <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
            <span>{active.name || 'Local Disk (C:)'}</span>
            <ChevronDown className="w-3 h-3 text-zinc-400 ml-0.5" />
          </button>

          {isDriveMenuOpen && (
            <div className="absolute left-0 mt-1 w-56 py-1 bg-[#1a1c22] border border-[#2d313b] rounded-lg shadow-xl text-xs z-50 animate-fade-in">
              {drives.map((d) => (
                <button
                  key={d.id || d.path}
                  onClick={() => {
                    setSelectedDrive(d)
                    setIsDriveMenuOpen(false)
                  }}
                  className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-white/[0.08] ${
                    selectedDrive?.id === d.id ? 'text-blue-400 font-semibold' : 'text-zinc-300'
                  }`}
                >
                  <span className="truncate">{d.name} ({d.id})</span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {(d.freeBytes / 1024 ** 3).toFixed(0)} GB free
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Size, Items Count & Explorer Button */}
        <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
          <span className="text-zinc-200 font-medium font-sans">
            {currentViewNode?.size ? formatBytes(currentViewNode.size) : `${displayTotalGB} GB`}
          </span>
          <span className="text-zinc-600">•</span>
          <span>
            {currentViewNode?.children?.length
              ? `${currentViewNode.children.length.toLocaleString()} items`
              : rootNode?.children?.length
              ? `${rootNode.children.length.toLocaleString()} items`
              : scanProgress.scannedFiles > 0
              ? `${scanProgress.scannedFiles.toLocaleString()} files scanned`
              : 'Ready to scan'}
          </span>
          <button
            onClick={onRevealExplorer}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1d2027] border border-[#2b303a] text-zinc-300 hover:text-white hover:bg-[#252933] text-[11px] transition-colors"
            title="Open Current Folder in Windows File Explorer"
          >
            <ExternalLink className="w-3 h-3 text-zinc-400" />
            <span>Explorer</span>
          </button>
        </div>
      </div>
    </div>
  )
}
