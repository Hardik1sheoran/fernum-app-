import {
  AlertCircle,
  FolderOpen,
  HardDrive,
  Home,
  ExternalLink,
  Loader2,
  Folder,
} from 'lucide-react'
import type { DriveInfo, QuickFolderInfo, FileNode } from '@shared/types'
import { formatBytes } from '../Treemap/treemapLayout'

interface DrivePickerProps {
  drives: DriveInfo[]
  quickFolders?: QuickFolderInfo[]
  selectedDrive: DriveInfo | null
  currentViewNode?: FileNode | null
  errorMessage?: string | null
  onSelectDrive: (drive: DriveInfo) => void
  onStartScan: (drive: DriveInfo) => void
  onScanHome: () => void
  onSelectQuickFolder?: (folder: QuickFolderInfo) => void
  onSelectCustomFolder?: () => void
  onRevealInExplorer?: (targetPath: string) => void
  isScanning: boolean
}

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1)

function countFilesInTree(node: FileNode | null): number {
  if (!node) return 0
  if (node.type === 'file') return 1
  let count = 0
  if (node.children) {
    for (const child of node.children) {
      count += countFilesInTree(child)
    }
  }
  return count
}

export const DrivePicker: React.FC<DrivePickerProps> = ({
  drives,
  quickFolders = [],
  selectedDrive,
  currentViewNode,
  errorMessage,
  onSelectDrive,
  onStartScan,
  onScanHome,
  onSelectQuickFolder,
  onSelectCustomFolder,
  onRevealInExplorer,
  isScanning,
}) => {
  const active = selectedDrive || drives[0]
  const usage = active?.totalBytes ? Math.round((active.usedBytes / active.totalBytes) * 100) : 0

  const currentFolderFiles = countFilesInTree(currentViewNode || null)
  const currentPath = currentViewNode?.path || active?.path || 'C:\\'
  const currentName = currentViewNode?.name || active?.name || 'Local Disk (C:)'
  const currentSize = currentViewNode?.size ?? active?.usedBytes ?? 0

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent text-slate-200 divide-y divide-white/[0.06] select-none">
      {/* 1. Top Action Buttons */}
      <div className="space-y-2 p-3">
        <button
          disabled={!active || isScanning}
          onClick={() => active && onStartScan(active)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 px-3.5 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
        >
          {isScanning ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <HardDrive className="h-4 w-4 text-blue-200" />
          )}
          <span>{isScanning ? 'Scanning in Progress…' : 'Scan Full PC'}</span>
        </button>

        <button
          disabled={isScanning}
          onClick={onScanHome}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] px-3 py-2 text-xs font-semibold text-slate-100 transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
        >
          <Home className="h-3.5 w-3.5 text-amber-400" />
          <span>Scan User Home</span>
        </button>

        <button
          disabled={isScanning}
          onClick={onSelectCustomFolder}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] px-3 py-2 text-xs font-medium text-slate-300 transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
        >
          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
          <span>Choose Specific Folder</span>
        </button>
      </div>

      {/* 2. Disk Storage Gauge (High-Tech SVG Radial Meter) */}
      <div className="p-3.5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Disk Volume
        </p>
        {active?.totalBytes ? (
          <div className="flex items-center gap-4 rounded-xl bg-white/[0.02] border border-white/[0.05] p-3">
            {/* SVG Circular Gauge */}
            <div className="relative h-16 w-16 shrink-0 flex items-center justify-center">
              <svg className="h-16 w-16 -rotate-90 transform" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="currentColor"
                  strokeWidth="5"
                  className="text-white/10"
                  fill="transparent"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeDasharray={163.36}
                  strokeDashoffset={163.36 - (163.36 * Math.min(100, usage)) / 100}
                  strokeLinecap="round"
                  className={
                    usage > 85
                      ? 'text-rose-500 transition-all duration-500'
                      : usage > 65
                      ? 'text-amber-500 transition-all duration-500'
                      : 'text-blue-500 transition-all duration-500'
                  }
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xs font-extrabold text-white tracking-tight">{usage}%</span>
                <span className="text-[8px] uppercase font-bold text-slate-400">used</span>
              </div>
            </div>

            <dl className="grid flex-1 grid-cols-2 gap-y-1.5 text-[11px]">
              <dt className="text-slate-400">Total</dt>
              <dd className="text-right font-bold text-slate-200 font-mono">{gb(active.totalBytes)} GB</dd>
              <dt className="text-slate-400">Used</dt>
              <dd className="text-right font-bold text-rose-400 font-mono">{gb(active.usedBytes)} GB</dd>
              <dt className="text-slate-400">Available</dt>
              <dd className="text-right font-bold text-emerald-400 font-mono">{gb(active.freeBytes)} GB</dd>
            </dl>
          </div>
        ) : (
          <p className="text-xs text-slate-400">{errorMessage || 'No storage volume detected.'}</p>
        )}
      </div>

      {/* 3. Current View & Reveal in Explorer */}
      <div className="p-3.5 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Inspected Target
        </p>
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 space-y-2">
          <div>
            <p className="truncate text-xs font-bold text-slate-100">{currentName}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={currentPath}>
              {currentPath}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-black/30 border border-white/[0.04] p-2">
              <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Size</span>
              <span className="font-bold text-blue-400 font-mono">{formatBytes(currentSize)}</span>
            </div>
            <div className="rounded-lg bg-black/30 border border-white/[0.04] p-2">
              <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Files</span>
              <span className="font-bold text-slate-200 font-mono">
                {currentFolderFiles > 0 ? currentFolderFiles.toLocaleString() : '—'}
              </span>
            </div>
          </div>

          <button
            onClick={() => onRevealInExplorer?.(currentPath)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] py-1.5 text-xs font-semibold text-slate-200 transition-all duration-200"
          >
            <ExternalLink className="h-3.5 w-3.5 text-blue-400" />
            <span>Reveal in Explorer</span>
          </button>
        </div>
      </div>

      {/* 4. Category Quick Legend */}
      <div className="p-3.5 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          File Categories
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {[
            { label: 'Video', color: 'bg-[#a855f7]' },
            { label: 'Image', color: 'bg-[#ec4899]' },
            { label: 'Audio', color: 'bg-[#f59e0b]' },
            { label: 'Document', color: 'bg-[#3b82f6]' },
            { label: 'Developer', color: 'bg-[#10b981]' },
            { label: 'Archive', color: 'bg-[#06b6d4]' },
          ].map((cat) => (
            <div
              key={cat.label}
              className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.02] border border-white/[0.03] text-slate-300 text-[11px]"
            >
              <span className={`w-2 h-2 rounded-full ${cat.color} shrink-0`} />
              <span className="truncate">{cat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Drives List */}
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Drives</p>
        <div className="space-y-1.5">
          {drives.map((drive) => {
            const driveUsage = drive.totalBytes ? Math.round((drive.usedBytes / drive.totalBytes) * 100) : 0
            const isSelected = selectedDrive?.id === drive.id
            return (
              <button
                key={drive.id}
                onClick={() => onSelectDrive(drive)}
                className={`group flex w-full flex-col gap-1.5 rounded-xl p-2.5 text-left text-xs transition-all duration-200 border ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-200 shadow-sm shadow-blue-500/10'
                    : 'bg-white/[0.02] border-white/[0.05] text-slate-300 hover:bg-white/[0.05] hover:border-white/[0.1]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 truncate">
                    <HardDrive className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="font-semibold truncate">
                      {drive.id} · {drive.name}
                    </span>
                  </div>
                  {drive.totalBytes > 0 && (
                    <span className="text-[10px] font-mono text-slate-400">
                      {gb(drive.freeBytes)} GB free
                    </span>
                  )}
                </div>
                {drive.totalBytes > 0 && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        driveUsage > 85 ? 'bg-rose-500' : driveUsage > 65 ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, driveUsage)}%` }}
                    />
                  </div>
                )}
              </button>
            )
          })}
          {!drives.length && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage ? 'Drive Read Error' : 'No Drives Detected'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. Quick Folders List */}
      {quickFolders.length > 0 && (
        <div className="p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Quick Access</p>
          <div className="grid grid-cols-2 gap-1.5">
            {quickFolders.slice(1).map((folder) => (
              <button
                key={folder.id}
                disabled={isScanning}
                onClick={() => onSelectQuickFolder?.(folder)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] transition-all duration-200 disabled:opacity-40"
              >
                <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
