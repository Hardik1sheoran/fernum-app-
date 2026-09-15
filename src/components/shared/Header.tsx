import React from 'react'
import { HardDrive, Sparkles, RefreshCw, Shield, ShieldCheck } from 'lucide-react'
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
    <header className="h-13 border-b border-white/[0.08] bg-slate-950/70 backdrop-blur-xl flex items-center justify-between px-4 select-none drag-region relative z-30">
      {/* Brand / Title */}
      <div className="flex items-center gap-3 no-drag">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 p-[1px] shadow-glow flex items-center justify-center">
          <div className="w-full h-full bg-[#0d1117]/85 backdrop-blur-sm rounded-[11px] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse-subtle" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            Fernum
          </span>
          <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Storage Analyzer
          </span>
        </div>
      </div>

      {/* Center status: active drive & reclaimed space */}
      <div className="hidden md:flex items-center gap-2.5 text-xs no-drag">
        {selectedDrive && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md shadow-sm">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <HardDrive className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium text-slate-200">
              {selectedDrive.id} ({selectedDrive.name})
            </span>
            <span className="text-white/20">|</span>
            <span className="text-slate-400 font-mono">
              {(selectedDrive.freeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB free
            </span>
          </div>
        )}

        {reclaimedBytes > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold shadow-sm animate-pulse-subtle">
            <span>✨ Freed {formatBytes(reclaimedBytes)}</span>
          </div>
        )}
      </div>

      {/* Right controls: privacy + exclusions + refresh drives + theme toggle */}
      <div className="flex items-center gap-2 no-drag mr-36">
        {onOpenPrivacy && (
          <button
            onClick={onOpenPrivacy}
            title="100% Local Privacy Guarantee"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">100% Local</span>
          </button>
        )}
        {onOpenExclusions && (
          <button
            onClick={onOpenExclusions}
            title="Scan Exclusions Settings"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all duration-200"
          >
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Exclusions</span>
          </button>
        )}
        {onRefreshDrives && (
          <button
            onClick={onRefreshDrives}
            disabled={isLoadingDrives}
            title="Refresh drives"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrives ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        )}
        {/* Theme Picker Selector */}
        <div className="relative flex items-center">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            title="Switch Theme"
            className="text-xs py-1 px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.05] hover:bg-white/[0.08] text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer transition-all"
          >
            <option value="dark" className="bg-[#12161d] text-white">🌙 Dark</option>
            <option value="forest" className="bg-[#0b1411] text-emerald-200">🌲 Forest</option>
            <option value="ocean" className="bg-[#09131f] text-cyan-200">🌊 Ocean</option>
            <option value="aurora" className="bg-[#110d1f] text-purple-200">✨ Aurora</option>
            <option value="light" className="bg-slate-100 text-slate-900">☀️ Light</option>
          </select>
        </div>
      </div>
    </header>
  )
}

