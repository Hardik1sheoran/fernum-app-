import React, { useState } from 'react'
import { Trash2, AlertTriangle, RefreshCw, X, ShieldAlert, Files } from 'lucide-react'
import type { FileNode } from '@shared/types'
import { formatBytes } from '../Treemap/treemapLayout'
import { Button } from './Button'

export interface DeleteTargetItem {
  name: string
  path: string
  size: number
  type?: 'file' | 'directory'
}

interface ConfirmDeleteModalProps {
  isOpen: boolean
  targetNode?: FileNode | DeleteTargetItem | null
  targetNodes?: DeleteTargetItem[]
  initialPermanent?: boolean
  onConfirm: (permanent: boolean) => Promise<void>
  onCancel: () => void
  isDeleting: boolean
  errorMessage?: string | null
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  targetNode,
  targetNodes,
  initialPermanent = false,
  onConfirm,
  onCancel,
  isDeleting,
  errorMessage,
}) => {
  const [permanent, setPermanent] = useState(initialPermanent)

  if (!isOpen) return null

  const isMultiple = Boolean(targetNodes && targetNodes.length > 1)
  const effectiveItems = isMultiple
    ? targetNodes!
    : targetNode
    ? [targetNode]
    : targetNodes && targetNodes.length === 1
    ? targetNodes
    : []

  if (effectiveItems.length === 0) return null

  const firstItem = effectiveItems[0]
  const totalSize = effectiveItems.reduce((acc, item) => acc + item.size, 0)
  const isDirectory = !isMultiple && 'type' in firstItem && firstItem.type === 'directory'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none animate-fade-in">
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1c2028] border border-slate-200 dark:border-slate-700/80 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                permanent
                  ? 'bg-rose-500/15 text-rose-500'
                  : 'bg-blue-500/15 text-blue-500'
              }`}
            >
              {permanent ? (
                <ShieldAlert className="w-4 h-4" />
              ) : isMultiple ? (
                <Files className="w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {isMultiple
                  ? permanent
                    ? `Permanently Delete ${effectiveItems.length} Items`
                    : `Move ${effectiveItems.length} Items to Recycle Bin`
                  : permanent
                  ? 'Permanently Delete'
                  : 'Move to Recycle Bin'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isMultiple
                  ? `${effectiveItems.length} items selected · ${formatBytes(totalSize)}`
                  : isDirectory
                  ? 'Directory & all contents'
                  : 'File'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {isMultiple ? (
            <div className="rounded-xl bg-slate-50 dark:bg-[#14171d] border border-slate-200/80 dark:border-slate-800 overflow-hidden">
              <div className="p-3 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Selected Items ({effectiveItems.length})</span>
                <span className="text-blue-500 font-mono">{formatBytes(totalSize)}</span>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {effectiveItems.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {item.path}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 flex-shrink-0">
                      {formatBytes(item.size)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#14171d] border border-slate-200/80 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                  {firstItem.name}
                </span>
                <span className="font-bold text-xs text-blue-500 font-mono">
                  {formatBytes(firstItem.size)}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono break-all line-clamp-2">
                {firstItem.path}
              </div>
            </div>
          )}

          {/* Delete Mode Option */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Deletion Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPermanent(false)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  !permanent
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/40'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="font-semibold text-xs block">Recycle Bin</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Can be restored later
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPermanent(true)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  permanent
                    ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/40'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="font-semibold text-xs block text-rose-600 dark:text-rose-400">
                  Permanent Delete
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Cannot be undone
                </span>
              </button>
            </div>
          </div>

          {permanent && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span>
                Permanently deleted files bypass the Windows Recycle Bin and cannot be recovered.
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-xs">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-3 bg-slate-50/80 dark:bg-[#15181f] border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant={permanent ? 'danger' : 'primary'}
            size="sm"
            onClick={() => onConfirm(permanent)}
            disabled={isDeleting}
            icon={isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : undefined}
          >
            {isDeleting
              ? 'Deleting...'
              : permanent
              ? isMultiple
                ? `Delete ${effectiveItems.length} Files`
                : 'Delete Permanently'
              : isMultiple
              ? `Move ${effectiveItems.length} to Recycle Bin`
              : 'Move to Recycle Bin'}
          </Button>
        </div>
      </div>
    </div>
  )
}
