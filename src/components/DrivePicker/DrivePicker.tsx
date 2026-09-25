import React from 'react'
import {
  FolderOpen,
  HardDrive,
  Home,
  Check,
  Trash2,
  Boxes,
  Code2,
  Film,
  Disc,
  Archive,
  Smartphone,
  Layers,
  RotateCcw,
} from 'lucide-react'
import type { DriveInfo, QuickFolderInfo, FileNode } from '@shared/types'
import { useScanStore } from '../../stores/scanStore'

interface DrivePickerProps {
  drives: DriveInfo[]
  quickFolders?: QuickFolderInfo[]
  selectedDrive: DriveInfo | null
  currentViewNode?: FileNode | null
  errorMessage?: string | null
  onSelectDrive: (drive: DriveInfo) => void
  onStartScan: (drive: DriveInfo) => void
  onStartDeepScan?: (drive: DriveInfo) => void
  onScanHome: () => void
  onSelectQuickFolder?: (folder: QuickFolderInfo) => void
  onSelectCustomFolder?: () => void
  onRevealInExplorer?: (targetPath: string) => void
  isScanning: boolean
}

export const DrivePicker: React.FC<DrivePickerProps> = ({
  drives,
  selectedDrive,
  currentViewNode,
  onStartScan,
  onScanHome,
  onSelectCustomFolder,
  isScanning,
}) => {
  const { sidebarFilters, toggleSidebarFilter, resetSidebarFilters } = useScanStore()

  const active = selectedDrive || drives[0] || {
    id: 'C:',
    name: 'Local Disk (C:)',
    path: 'C:\\',
    totalBytes: 245.11 * 1024 ** 3,
    freeBytes: 19.97 * 1024 ** 3,
    usedBytes: 225.14 * 1024 ** 3,
    isSystem: true,
  }

  const percentage =
    active.totalBytes > 0
      ? Math.min(100, Math.max(0, Math.round((active.usedBytes / active.totalBytes) * 100)))
      : 0
  const strokeDashoffset = 175.93 * (1 - percentage / 100)
  const totalGB = (active.totalBytes / 1024 ** 3).toFixed(2)
  const usedGB = (active.usedBytes / 1024 ** 3).toFixed(2)
  const freeGB = (active.freeBytes / 1024 ** 3).toFixed(2)

  const hasAnyFilterActive = Object.values(sidebarFilters).some(Boolean)

  return (
    <aside className="w-64 h-full flex flex-col justify-between bg-[#111317] border-r border-[#1f2229] select-none text-zinc-300 p-3 overflow-y-auto">
      <div className="space-y-3.5">
        {/* 1. Primary Action Button: Scan Windows */}
        <button
          onClick={() => active && onStartScan(active)}
          disabled={isScanning}
          className="w-full py-2.5 px-3 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <span>{isScanning ? 'Scanning Windows…' : 'Scan Windows'}</span>
        </button>

        {/* 2. Secondary Action Buttons: Scan Home & Choose Folder */}
        <div className="space-y-1.5">
          <button
            onClick={onScanHome}
            disabled={isScanning}
            className="w-full py-1.5 px-3 rounded-md bg-[#191c23] hover:bg-[#20242e] border border-[#262b36] text-zinc-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Home className="w-3.5 h-3.5 text-zinc-400" />
            <span>Scan Home</span>
          </button>
          <button
            onClick={onSelectCustomFolder}
            disabled={isScanning}
            className="w-full py-1.5 px-3 rounded-md bg-[#191c23] hover:bg-[#20242e] border border-[#262b36] text-zinc-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            <span>Choose Folder</span>
          </button>
        </div>

        {/* 3. DISK STORAGE Section with Donut Gauge */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              DISK STORAGE
            </span>
            <span
              className="text-[10px] font-mono text-zinc-400 truncate max-w-[120px]"
              title={currentViewNode?.name || active.name}
            >
              {currentViewNode?.name || active.name || 'Local Disk (C:)'}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-[#161820] border border-[#222530] space-y-2.5">
            <div className="flex items-center gap-3">
              {/* Radial Donut Gauge */}
              <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="5"
                    fill="none"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="#f43f5e"
                    strokeWidth="5"
                    fill="none"
                    strokeDasharray="175.93"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <HardDrive className="w-3.5 h-3.5 text-zinc-400 mb-0.5" />
                  <span className="text-[11px] font-black text-white leading-none">
                    {percentage}%
                  </span>
                </div>
              </div>

              {/* Stats Numbers */}
              <div className="space-y-1 text-[11px] font-mono leading-tight flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 text-[10px] font-sans">Total</span>
                  <span className="text-zinc-100 font-semibold">{totalGB} GB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 text-[10px] font-sans">Used</span>
                  <span className="text-[#f43f5e] font-semibold">{usedGB} GB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 text-[10px] font-sans">Available</span>
                  <span className="text-[#10b981] font-semibold">{freeGB} GB</span>
                </div>
              </div>
            </div>

            {/* Coral Gradient Bar */}
            <div className="h-1.5 w-full rounded-full bg-zinc-800/80 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#f43f5e] to-[#fb7185] transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* 4. System Backups / Quick Categories Checklist */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-zinc-500">
              System Backups
            </span>
            {hasAnyFilterActive && (
              <button
                onClick={resetSidebarFilters}
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Show All</span>
              </button>
            )}
          </div>
          <div className="space-y-0.5 text-xs">
            {[
              { id: 'trash', label: 'Trash', icon: Trash2 },
              { id: 'nodejs', label: 'Node.js', icon: Code2 },
              { id: 'xcode', label: 'Xcode', icon: Code2 },
              { id: 'buildArtifacts', label: 'Build Artifacts', icon: Layers },
              { id: 'android', label: 'Android', icon: Smartphone },
              { id: 'docker', label: 'Docker', icon: Boxes },
              { id: 'videos', label: 'Videos', icon: Film },
              { id: 'diskImages', label: 'Disk Images', icon: Disc },
              { id: 'archives', label: 'Archives', icon: Archive },
              { id: 'iosBackups', label: 'iOS Backups', icon: Smartphone },
            ].map((item) => {
              const isChecked = Boolean(sidebarFilters[item.id])
              const Icon = item.icon
              return (
                <div
                  key={item.id}
                  onClick={() => toggleSidebarFilter(item.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-[#1b2230] text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#181a21]'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                      isChecked
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'border-zinc-600 bg-[#171a21]'
                    }`}
                  >
                    {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <Icon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="text-xs truncate">{item.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 5. Footer: File Types Legend & Version */}
      <div className="pt-3 border-t border-[#1f2229] space-y-2.5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
            FILE TYPES
          </span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0" />
              <span>Video</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#eab308] shrink-0" />
              <span>Image</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3b82f6] shrink-0" />
              <span>Doc</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981] shrink-0" />
              <span>Dev</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0" />
              <span>Archive</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#64748b] shrink-0" />
              <span>Other</span>
            </div>
          </div>
        </div>

        <div className="text-center">
          <span className="text-[10px] text-zinc-600 font-mono">
            Fernum v1.0.0
          </span>
        </div>
      </div>
    </aside>
  )
}
