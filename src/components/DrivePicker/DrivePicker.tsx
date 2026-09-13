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
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#171717] text-slate-200 divide-y divide-white/10 select-none">
      {/* 1. Top Action Buttons (DissectMac Parity: Scan Full PC, Scan Home, Choose Folder) */}
      <div className="space-y-2 p-3">
        <button
          disabled={!active || isScanning}
          onClick={() => active && onStartScan(active)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
        >
          {isScanning ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <HardDrive className="h-4 w-4" />
          )}
          <span>{isScanning ? 'Scanning in Progress…' : 'Scan Full PC'}</span>
        </button>

        <button
          disabled={isScanning}
          onClick={onScanHome}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/15 active:scale-[0.98] disabled:opacity-50"
        >
          <Home className="h-3.5 w-3.5 text-amber-400" />
          <span>Scan Home</span>
        </button>

        <button
          disabled={isScanning}
          onClick={onSelectCustomFolder}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
        >
          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
          <span>Choose Folder</span>
        </button>
      </div>

      {/* 2. Disk Storage Gauge (Matching DissectMac Circular Gauge) */}
      <div className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Disk Storage
        </p>
        {active?.totalBytes ? (
          <div className="flex items-center gap-3.5">
            <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full border-[4.5px] border-rose-500 bg-rose-500/10 shadow-inner">
              <span className="text-xs font-extrabold text-white">{usage}%</span>
            </div>
            <dl className="grid flex-1 grid-cols-2 gap-y-1 text-[11px]">
              <dt className="text-slate-400">Total</dt>
              <dd className="text-right font-bold text-slate-200">{gb(active.totalBytes)} GB</dd>
              <dt className="text-slate-400">Used</dt>
              <dd className="text-right font-bold text-rose-400">{gb(active.usedBytes)} GB</dd>
              <dt className="text-slate-400">Available</dt>
              <dd className="text-right font-bold text-emerald-400">{gb(active.freeBytes)} GB</dd>
            </dl>
          </div>
        ) : (
          <p className="text-xs text-slate-400">{errorMessage || 'No storage volume detected.'}</p>
        )}
      </div>

      {/* 3. Current View & Reveal in Explorer (Matching DissectMac Sidebar) */}
      <div className="p-3.5 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Current View
        </p>
        <div>
          <p className="truncate text-xs font-bold text-slate-100">{currentName}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{currentPath}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs py-1">
          <div className="rounded-lg bg-black/40 border border-white/5 p-2">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Size</span>
            <span className="font-bold text-slate-200 font-mono">{formatBytes(currentSize)}</span>
          </div>
          <div className="rounded-lg bg-black/40 border border-white/5 p-2">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Files</span>
            <span className="font-bold text-slate-200 font-mono">
              {currentFolderFiles > 0 ? currentFolderFiles.toLocaleString() : '—'}
            </span>
          </div>
        </div>

        <button
          onClick={() => onRevealInExplorer?.(currentPath)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 active:scale-[0.98]"
        >
          <ExternalLink className="h-3.5 w-3.5 text-blue-400" />
          <span>Reveal in Explorer</span>
        </button>
      </div>

      {/* 4. Category Quick Filters (DissectMac Parity: Node.js, Build Artifacts, Docker, Videos, etc.) */}
      <div className="p-3.5 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Categories
        </p>
        <div className="space-y-1.5 text-xs">
          {[
            { label: 'Node.js', iconColor: 'bg-emerald-400' },
            { label: 'Build Artifacts', iconColor: 'bg-amber-400' },
            { label: 'Visual Studio / Code', iconColor: 'bg-blue-400' },
            { label: 'Docker & Containers', iconColor: 'bg-cyan-400' },
            { label: 'Videos & Media', iconColor: 'bg-purple-400' },
            { label: 'Disk Images & ISOs', iconColor: 'bg-rose-400' },
          ].map((cat) => (
            <div
              key={cat.label}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 text-slate-300 cursor-pointer"
            >
              <span className={`w-2 h-2 rounded-full ${cat.iconColor}`} />
              <span className="truncate">{cat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. File Types Legend (Matching DissectMac Color Legend) */}
      <div className="p-3.5 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          File Types
        </p>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#a855f7]" />
            <span>Video</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#ec4899]" />
            <span>Image</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#f59e0b]" />
            <span>Audio</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#3b82f6]" />
            <span>Document</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#10b981]" />
            <span>Developer</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#06b6d4]" />
            <span>Archive</span>
          </div>
        </div>
      </div>

      {/* 6. Drives List */}
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Drives</p>
        <div className="space-y-1">
          {drives.map((drive) => (
            <button
              key={drive.id}
              onClick={() => onSelectDrive(drive)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                selectedDrive?.id === drive.id
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <HardDrive className="h-3.5 w-3.5 text-slate-400" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {drive.id} · {drive.name}
              </span>
              {drive.totalBytes > 0 && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {gb(drive.freeBytes)} GB free
                </span>
              )}
            </button>
          ))}
          {!drives.length && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage ? 'Drive Read Error' : 'No Drives Detected'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 7. Quick Folders List */}
      {quickFolders.length > 0 && (
        <div className="p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Quick Folders</p>
          <div className="space-y-1">
            {quickFolders.slice(1).map((folder) => (
              <button
                key={folder.id}
                disabled={isScanning}
                onClick={() => onSelectQuickFolder?.(folder)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
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
