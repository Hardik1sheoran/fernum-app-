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
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
          ) : (
            <HardDrive className="h-3.5 w-3.5 text-blue-200" />
          )}
          <span>{isScanning ? 'Scanning in progress…' : 'Scan Full Drive'}</span>
        </button>

        <button
          disabled={isScanning}
          onClick={onScanHome}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-200 transition-colors disabled:opacity-50"
        >
          <Home className="h-3.5 w-3.5 text-slate-400" />
          <span>Scan User Profile</span>
        </button>

        <button
          disabled={isScanning}
          onClick={onSelectCustomFolder}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] px-3 py-2 text-xs font-medium text-slate-300 transition-colors disabled:opacity-50"
        >
          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
          <span>Select Folder…</span>
        </button>
      </div>

      {/* 2. Disk Storage Volume Bar */}
      <div className="p-3.5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Drive Volume
          </p>
          {active?.totalBytes ? (
            <span className="text-[10px] font-mono font-medium text-slate-400">
              {usage}% used
            </span>
          ) : null}
        </div>
        {active?.totalBytes ? (
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-3">
            {/* Storage Progress Bar */}
            <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  usage > 85 ? 'bg-rose-500' : usage > 70 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, usage)}%` }}
              />
            </div>

            <dl className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.03]">
                <dt className="text-[10px] text-slate-400 mb-0.5">Used</dt>
                <dd className="font-mono font-medium text-slate-200">{gb(active.usedBytes)} GB</dd>
              </div>
              <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.03]">
                <dt className="text-[10px] text-slate-400 mb-0.5">Free</dt>
                <dd className="font-mono font-medium text-emerald-400">{gb(active.freeBytes)} GB</dd>
              </div>
              <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.03]">
                <dt className="text-[10px] text-slate-400 mb-0.5">Total</dt>
                <dd className="font-mono font-medium text-slate-400">{gb(active.totalBytes)} GB</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-xs text-slate-400">{errorMessage || 'No storage volume detected.'}</p>
        )}
      </div>

      {/* 3. Current View & Reveal in Explorer */}
      <div className="p-3.5 space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Selected Target
        </p>
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
          <div>
            <p className="truncate text-xs font-semibold text-slate-200">{currentName}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400" title={currentPath}>
              {currentPath}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-black/20 border border-white/[0.04] p-2">
              <span className="text-[9px] uppercase font-semibold text-slate-400 block mb-0.5">Size</span>
              <span className="font-mono font-medium text-blue-400">{formatBytes(currentSize)}</span>
            </div>
            <div className="rounded bg-black/20 border border-white/[0.04] p-2">
              <span className="text-[9px] uppercase font-semibold text-slate-400 block mb-0.5">Files</span>
              <span className="font-mono font-medium text-slate-200">
                {currentFolderFiles > 0 ? currentFolderFiles.toLocaleString() : '—'}
              </span>
            </div>
          </div>

          <button
            onClick={() => onRevealInExplorer?.(currentPath)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] py-1.5 text-xs font-medium text-slate-200 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            <span>Reveal in Explorer</span>
          </button>
        </div>
      </div>

      {/* 4. Category Quick Legend */}
      <div className="p-3.5 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          File Types
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {[
            { label: 'Video', color: 'bg-purple-500' },
            { label: 'Image', color: 'bg-pink-500' },
            { label: 'Audio', color: 'bg-amber-500' },
            { label: 'Document', color: 'bg-blue-500' },
            { label: 'Developer', color: 'bg-emerald-500' },
            { label: 'Archive', color: 'bg-cyan-500' },
          ].map((cat) => (
            <div
              key={cat.label}
              className="flex items-center gap-2 px-2 py-1 rounded bg-white/[0.02] border border-white/[0.03] text-slate-300 text-[11px]"
            >
              <span className={`w-2 h-2 rounded-full ${cat.color} shrink-0`} />
              <span className="truncate">{cat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Drives List */}
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Drives</p>
        <div className="space-y-1.5">
          {drives.map((drive) => {
            const driveUsage = drive.totalBytes ? Math.round((drive.usedBytes / drive.totalBytes) * 100) : 0
            const isSelected = selectedDrive?.id === drive.id
            return (
              <button
                key={drive.id}
                onClick={() => onSelectDrive(drive)}
                className={`group flex w-full flex-col gap-1.5 rounded-lg p-2.5 text-left text-xs transition-colors border ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500/30 text-blue-200'
                    : 'bg-white/[0.02] border-white/[0.05] text-slate-300 hover:bg-white/[0.05] hover:border-white/[0.08]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 truncate">
                    <HardDrive className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="font-medium truncate">
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
                      className={`h-full rounded-full transition-all duration-300 ${
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
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-rose-200">
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
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Quick Access</p>
          <div className="grid grid-cols-2 gap-1.5">
            {quickFolders.slice(1).map((folder) => (
              <button
                key={folder.id}
                disabled={isScanning}
                onClick={() => onSelectQuickFolder?.(folder)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] transition-colors disabled:opacity-40"
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
