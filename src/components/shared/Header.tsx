import React from 'react'
import { HardDrive, RefreshCw, SlidersHorizontal, ShieldCheck } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useScanStore } from '../../stores/scanStore'
import { formatBytes } from '../Treemap/treemapLayout'

interface HeaderProps {
  onRefreshDrives?: () => void
  onOpenExclusions?: () => void
  onOpenPrivacy?: () => void
}

export const Header: React.FC<HeaderProps> = ({ onRefreshDrives, onOpenExclusions, onOpenPrivacy }) => {
  const { theme, setTheme } = useTheme()
  const { selectedDrive, isLoadingDrives, reclaimedBytes } = useScanStore()

  return (
    <header className="h-11 border-b border-[#2c2c32] bg-[#1c1c20] flex items-center justify-between px-3 select-none drag-region relative z-30">
      {/* Brand / Title */}
      <div className="flex items-center gap-2.5 no-drag">
        <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-black tracking-tighter shadow-sm">
          F
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-zinc-100 tracking-tight">
            Fernum
          </span>
          <span className="text-[10px] text-zinc-400 font-medium">
            Storage Analyzer
          </span>
        </div>
      </div>

      {/* Center status: active drive & reclaimed space */}
      <div className="hidden md:flex items-center gap-2 text-xs no-drag">
        {selectedDrive && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#242429] border border-[#2f2f36] text-zinc-300">
            <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
            <span className="font-medium text-zinc-200">
              {selectedDrive.id} ({selectedDrive.name})
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400 font-mono text-[11px]">
              {(selectedDrive.freeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB free
            </span>
          </div>
        )}

        {reclaimedBytes > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1e2e22] border border-[#2d5034] text-emerald-400 text-xs font-medium font-mono">
            <span>Freed: {formatBytes(reclaimedBytes)}</span>
          </div>
        )}
      </div>

      {/* Right controls: privacy + exclusions + refresh drives + theme toggle */}
      <div className="flex items-center gap-1.5 no-drag mr-36">
        {onOpenPrivacy && (
          <button
            onClick={onOpenPrivacy}
            title="Local Privacy"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-[#25252b] transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline text-[11px]">Offline</span>
          </button>
        )}
        {onOpenExclusions && (
          <button
            onClick={onOpenExclusions}
            title="Exclusions"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-[#25252b] transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Filter</span>
          </button>
        )}
        {onRefreshDrives && (
          <button
            onClick={onRefreshDrives}
            disabled={isLoadingDrives}
            title="Refresh drives"
            className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-[#25252b] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrives ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        )}
        {/* Theme Picker Selector */}
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as any)}
          title="Switch Theme"
          className="text-[11px] py-1 px-2 rounded border border-[#2f2f36] bg-[#242429] text-zinc-300 font-medium focus:outline-none cursor-pointer"
        >
          <option value="dark" className="bg-[#18181b] text-white">Dark</option>
          <option value="forest" className="bg-[#0b1411] text-emerald-200">Forest</option>
          <option value="ocean" className="bg-[#09131f] text-cyan-200">Ocean</option>
          <option value="aurora" className="bg-[#110d1f] text-purple-200">Aurora</option>
          <option value="light" className="bg-zinc-100 text-zinc-900">Light</option>
        </select>
      </div>
    </header>
  )
}


