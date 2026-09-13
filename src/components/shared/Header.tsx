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
    <header className="h-12 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-[#14171d]/90 backdrop-blur-md flex items-center justify-between px-4 select-none drag-region">
      {/* Brand / Title */}
      <div className="flex items-center gap-2.5 no-drag">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-glow">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-sm tracking-tight text-slate-800 dark:text-slate-100">
            Fernum
          </span>
          <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
            Storage Analyzer
          </span>
        </div>
      </div>

      {/* Center status: active drive & reclaimed space */}
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 no-drag">
        {selectedDrive && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1f242d] border border-slate-200/80 dark:border-slate-700/60">
            <HardDrive className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {selectedDrive.id} ({selectedDrive.name})
            </span>
            <span className="text-slate-400 dark:text-slate-500">|</span>
            <span>
              {(selectedDrive.freeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB free
            </span>
          </div>
        )}

        {reclaimedBytes > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in">
            <span>✨ Freed {formatBytes(reclaimedBytes)}</span>
          </div>
        )}
      </div>

      {/* Right controls: privacy + exclusions + refresh drives + theme toggle, spaced away from Windows titlebar buttons */}
      <div className="flex items-center gap-1.5 no-drag mr-36">
        {onOpenPrivacy && (
          <button
            onClick={onOpenPrivacy}
            title="100% Local Privacy Guarantee"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">100% Local</span>
          </button>
        )}
        {onOpenExclusions && (
          <button
            onClick={onOpenExclusions}
            title="Scan Exclusions Settings"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden sm:inline">Exclusions</span>
          </button>
        )}
        {onRefreshDrives && (
          <button
            onClick={onRefreshDrives}
            disabled={isLoadingDrives}
            title="Refresh drives"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingDrives ? 'animate-spin' : ''}`} />
          </button>
        )}
        {/* Theme Picker Selector */}
        <div className="relative flex items-center">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            title="Switch Theme (Forest, Ocean, Aurora, Dark, Light)"
            className="text-xs py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium focus:outline-none cursor-pointer"
          >
            <option value="dark">🌙 Dark Mode</option>
            <option value="forest">🌲 Forest</option>
            <option value="ocean">🌊 Ocean</option>
            <option value="aurora">✨ Aurora</option>
            <option value="light">☀️ Light</option>
          </select>
        </div>
      </div>
    </header>
  )
}
