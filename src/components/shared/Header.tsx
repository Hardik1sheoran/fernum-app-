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
    <header className="h-11 border-b border-white/[0.08] bg-[#13161c] flex items-center justify-between px-3 select-none drag-region relative z-30">
      {/* Brand / Title */}
      <div className="flex items-center gap-2.5 no-drag">
        <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-black tracking-tighter">
          F
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-slate-100 tracking-tight">
            Fernum
          </span>
          <span className="text-[10px] text-slate-500 font-medium">
            Storage Analyzer
          </span>
        </div>
      </div>

      {/* Center status: active drive & reclaimed space */}
      <div className="hidden md:flex items-center gap-2 text-xs no-drag">
        {selectedDrive && (
          <div className="flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-slate-300">
            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium text-slate-200">
              {selectedDrive.id} ({selectedDrive.name})
            </span>
            <span className="text-white/20">·</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {(selectedDrive.freeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB free
            </span>
          </div>
        )}

        {reclaimedBytes > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium font-mono">
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
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline text-[11px]">Offline</span>
          </button>
        )}
        {onOpenExclusions && (
          <button
            onClick={onOpenExclusions}
            title="Exclusions"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
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
            className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrives ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        )}
        {/* Theme Picker Selector */}
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as any)}
          title="Switch Theme"
          className="text-[11px] py-0.5 px-2 rounded border border-white/[0.08] bg-white/[0.04] text-slate-300 font-medium focus:outline-none cursor-pointer"
        >
          <option value="dark" className="bg-[#12161d] text-white">Dark</option>
          <option value="forest" className="bg-[#0b1411] text-emerald-200">Forest</option>
          <option value="ocean" className="bg-[#09131f] text-cyan-200">Ocean</option>
          <option value="aurora" className="bg-[#110d1f] text-purple-200">Aurora</option>
          <option value="light" className="bg-slate-100 text-slate-900">Light</option>
        </select>
      </div>
    </header>
  )
}


