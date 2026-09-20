import {
  AlertCircle,
  FolderOpen,
  HardDrive,
  Home,
  ExternalLink,
  Loader2,
  Folder,
  Zap,
} from 'lucide-react'
import type { DriveInfo, QuickFolderInfo, FileNode } from '@shared/types'
import { formatBytes } from '../Treemap/treemapLayout'
import { useLicenseStore } from '../../stores/licenseStore'

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
  onStartDeepScan,
  onScanHome,
  onSelectQuickFolder,
  onSelectCustomFolder,
  onRevealInExplorer,
  isScanning,
}) => {
  const { isPro, openUpgradeModal } = useLicenseStore()
  const active = selectedDrive || drives[0]
  const usage = active?.totalBytes ? Math.round((active.usedBytes / active.totalBytes) * 100) : 0

  const currentFolderFiles = countFilesInTree(currentViewNode || null)
  const currentPath = currentViewNode?.path || active?.path || 'C:\\'
  const currentName = currentViewNode?.name || active?.name || 'Local Disk (C:)'
  const currentSize = currentViewNode?.size ?? active?.usedBytes ?? 0

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent text-zinc-200 divide-y divide-[#2d2d33] select-none">
      {/* 1. Top Action Buttons */}
      <div className="space-y-1.5 p-2.5">
        {/* Full PC Deep Scan (Pro) */}
        <button
          disabled={!active || isScanning}
          onClick={() => {
            if (!isPro) {
              openUpgradeModal('Full PC Deep Scan & Windows Diagnostics')
              return
            }
            if (active) {
              if (onStartDeepScan) onStartDeepScan(active)
              else onStartScan(active)
            }
          }}
          className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-all ${
            isPro
              ? 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200'
              : 'bg-[#242429] hover:bg-[#2c2c33] border border-amber-500/30 text-zinc-200 hover:border-amber-500/60'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isPro ? 'Perform unthrottled deep scan across full PC directories' : 'Pro Feature: Full PC Deep Scan'}
        >
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Full PC Deep Scan</span>
          </div>
          <span className="rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
            PRO
          </span>
        </button>

        <button
          disabled={!active || isScanning}
          onClick={() => active && onStartScan(active)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
          ) : (
            <HardDrive className="h-3.5 w-3.5 text-blue-200" />
          )}
          <span>{isScanning ? 'Scanning…' : 'Scan Full Drive'}</span>
        </button>

        <button
          disabled={isScanning}
          onClick={onScanHome}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#242429] hover:bg-[#2c2c33] border border-[#2f2f36] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors disabled:opacity-50"
        >
          <Home className="h-3.5 w-3.5 text-zinc-400" />
          <span>Scan User Profile</span>
        </button>

        <button
          disabled={isScanning}
          onClick={onSelectCustomFolder}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#242429] hover:bg-[#2c2c33] border border-[#2f2f36] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors disabled:opacity-50"
        >
          <FolderOpen className="h-3.5 w-3.5 text-zinc-400" />
          <span>Select Folder…</span>
        </button>
      </div>

      {/* 2. Disk Storage Volume Bar */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Drive Volume
          </p>
          {active?.totalBytes ? (
            <span className="text-[10px] font-mono font-medium text-zinc-400">
              {usage}% used
            </span>
          ) : null}
        </div>
        {active?.totalBytes ? (
          <div className="rounded-md bg-[#242429] border border-[#2f2f36] p-2.5 space-y-2.5">
            {/* Storage Progress Bar */}
            <div className="h-2 w-full rounded-full bg-zinc-700/40 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  usage > 85 ? 'bg-rose-500' : usage > 70 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, usage)}%` }}
              />
            </div>

            <dl className="grid grid-cols-3 gap-1.5 text-center text-xs">
              <div className="p-1 rounded bg-[#202024] border border-[#2d2d33]">
                <dt className="text-[10px] text-zinc-400 mb-0.5">Used</dt>
                <dd className="font-mono font-medium text-zinc-200">{gb(active.usedBytes)} GB</dd>
              </div>
              <div className="p-1 rounded bg-[#202024] border border-[#2d2d33]">
                <dt className="text-[10px] text-zinc-400 mb-0.5">Free</dt>
                <dd className="font-mono font-medium text-emerald-400">{gb(active.freeBytes)} GB</dd>
              </div>
              <div className="p-1 rounded bg-[#202024] border border-[#2d2d33]">
                <dt className="text-[10px] text-zinc-400 mb-0.5">Total</dt>
                <dd className="font-mono font-medium text-zinc-400">{gb(active.totalBytes)} GB</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-xs text-zinc-400">{errorMessage || 'No storage volume detected.'}</p>
        )}
      </div>

      {/* 3. Current View & Reveal in Explorer */}
      <div className="p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          Selected Target
        </p>
        <div className="rounded-md bg-[#242429] border border-[#2f2f36] p-2.5 space-y-2">
          <div>
            <p className="truncate text-xs font-semibold text-zinc-200">{currentName}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-400" title={currentPath}>
              {currentPath}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-[#202024] border border-[#2d2d33] p-1.5">
              <span className="text-[9px] uppercase font-semibold text-zinc-400 block mb-0.5">Size</span>
              <span className="font-mono font-medium text-blue-400">{formatBytes(currentSize)}</span>
            </div>
            <div className="rounded bg-[#202024] border border-[#2d2d33] p-1.5">
              <span className="text-[9px] uppercase font-semibold text-zinc-400 block mb-0.5">Files</span>
              <span className="font-mono font-medium text-zinc-200">
                {currentFolderFiles > 0 ? currentFolderFiles.toLocaleString() : '—'}
              </span>
            </div>
          </div>

          <button
            onClick={() => onRevealInExplorer?.(currentPath)}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-[#2f2f36] bg-[#202024] hover:bg-[#28282e] py-1.5 text-xs font-medium text-zinc-200 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
            <span>Reveal in Explorer</span>
          </button>
        </div>
      </div>

      {/* 4. Category Quick Legend */}
      <div className="p-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          File Types
        </p>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {[
            { label: 'Video', color: 'bg-purple-500' },
            { label: 'Image', color: 'bg-pink-500' },
            { label: 'Audio', color: 'bg-amber-500' },
            { label: 'Document', color: 'bg-blue-500' },
            { label: 'Developer', color: 'bg-emerald-500' },
            { label: 'Archive', color: 'bg-cyan-500' },
          ].map((cat) => (
            <div
              key={`legend-${cat.label}`}
              className="flex items-center gap-2 px-2 py-1 rounded bg-[#242429] border border-[#2f2f36] text-zinc-300 text-[11px]"
            >
              <span className={`w-2 h-2 rounded-full ${cat.color} shrink-0`} />
              <span className="truncate">{cat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Drives List */}
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Drives</p>
        <div className="space-y-1">
          {drives.map((drive, driveIdx) => {
            const driveUsage = drive.totalBytes ? Math.round((drive.usedBytes / drive.totalBytes) * 100) : 0
            const isSelected = selectedDrive?.id === drive.id
            return (
              <button
                key={`drive-entry-${drive.id || drive.path || driveIdx}-${driveIdx}`}
                onClick={() => onSelectDrive(drive)}
                className={`group flex w-full flex-col gap-1 rounded-md p-2 text-left text-xs transition-colors border ${
                  isSelected
                    ? 'bg-[#282830] border-blue-500/40 text-blue-200'
                    : 'bg-[#242429] border-[#2f2f36] text-zinc-300 hover:bg-[#28282e]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 truncate">
                    <HardDrive className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-zinc-400'}`} />
                    <span className="font-medium truncate">
                      {drive.id} · {drive.name}
                    </span>
                  </div>
                  {drive.totalBytes > 0 && (
                    <span className="text-[10px] font-mono text-zinc-400">
                      {gb(drive.freeBytes)} GB free
                    </span>
                  )}
                </div>
                {drive.totalBytes > 0 && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700/40">
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
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 space-y-2">
              <div className="flex items-center gap-1.5 font-medium text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage ? 'Drive Notice' : 'No Drives Detected'}</span>
              </div>
              {errorMessage && (
                <p className="text-[11px] text-zinc-400 leading-tight">
                  {errorMessage}
                </p>
              )}
              <button
                type="button"
                onClick={() =>
                  onSelectDrive({
                    id: 'C:',
                    name: 'Local Disk (C:) (System)',
                    path: 'C:\\',
                    totalBytes: 512 * 1024 * 1024 * 1024,
                    freeBytes: 120 * 1024 * 1024 * 1024,
                    usedBytes: 392 * 1024 * 1024 * 1024,
                    filesystem: 'NTFS',
                    isSystem: true,
                  })
                }
                className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 border border-blue-500/40 text-xs font-medium transition-colors"
              >
                Scan Primary Drive (C:) Directly
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 6. Quick Folders List */}
      {quickFolders.length > 0 && (
        <div className="p-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Quick Access</p>
          <div className="grid grid-cols-2 gap-1">
            {quickFolders.slice(1).map((folder, folderIdx) => (
              <button
                key={`quick-folder-${folder.id || folder.path || folderIdx}-${folderIdx}`}
                disabled={isScanning}
                onClick={() => onSelectQuickFolder?.(folder)}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-zinc-300 bg-[#242429] hover:bg-[#28282e] border border-[#2f2f36] transition-colors disabled:opacity-40"
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
