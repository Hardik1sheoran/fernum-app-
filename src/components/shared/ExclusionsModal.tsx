import React, { useState } from 'react'
import { Shield, Plus, Trash2, FolderOpen, X, AlertCircle } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { Button } from './Button'

interface ExclusionsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ExclusionsModal: React.FC<ExclusionsModalProps> = ({ isOpen, onClose }) => {
  const { excludedPaths, addExcludedPath, removeExcludedPath } = useSettingsStore()
  const [newPath, setNewPath] = useState('')

  if (!isOpen) return null

  const handleAdd = () => {
    if (newPath.trim()) {
      addExcludedPath(newPath.trim())
      setNewPath('')
    }
  }

  const handleBrowseFolder = async () => {
    if (window.electronAPI?.selectFolder) {
      const selected = await window.electronAPI.selectFolder()
      if (selected) {
        addExcludedPath(selected)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-fade-in">
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1c2028] border border-slate-200 dark:border-slate-700/80 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-500 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Scan Exclusions
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Folders matching these paths will be skipped during drive scans
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Add Path Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. C:\Users\User\AppData\Local\Temp or node_modules"
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14171d] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<FolderOpen className="w-3.5 h-3.5" />}
              onClick={handleBrowseFolder}
              title="Browse folder"
            >
              Browse
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleAdd}
              disabled={!newPath.trim()}
            >
              Add
            </Button>
          </div>

          {/* List of Exclusions */}
          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
            {excludedPaths.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                No custom exclusions configured.
              </div>
            ) : (
              excludedPaths.map((path) => (
                <div
                  key={path}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#14171d] border border-slate-200/60 dark:border-slate-800/80 group"
                >
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate max-w-sm">
                    {path}
                  </span>
                  <button
                    onClick={() => removeExcludedPath(path)}
                    className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                    title="Remove exclusion"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
            <span>Exclusions apply automatically to your next scan.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50/80 dark:bg-[#15181f] border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
