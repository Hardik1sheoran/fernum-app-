import React, { useEffect, useState, useMemo } from 'react'
import {
  AlertCircle,
  AppWindow,
  Search,
  Trash2,
  FolderSearch,
  ArrowUpDown,
  RefreshCw,
  Calendar,
  Building,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react'
import type { InstalledApp } from '@shared/types'
import { formatBytes } from '../Treemap/treemapLayout'
import { Button } from '../shared/Button'
import { EmptyState } from '../shared/EmptyState'
import { LeftoversModal } from './LeftoversModal'

type SortOption = 'size' | 'name' | 'date'

export const AppsList: React.FC = () => {
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('size')
  const [sortAsc, setSortAsc] = useState(false)
  const [selectedApp, setSelectedApp] = useState<InstalledApp | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{
    text: string
    type: 'info' | 'warning' | 'error' | 'success'
    actionApp?: InstalledApp
  } | null>(null)

  // Modals state
  const [leftoversTargetApp, setLeftoversTargetApp] = useState<InstalledApp | null>(null)
  const [uninstallConfirmApp, setUninstallConfirmApp] = useState<InstalledApp | null>(null)
  const [isLaunchingUninstall, setIsLaunchingUninstall] = useState(false)

  const loadApps = async () => {
    setIsLoading(true)
    setStatusMessage(null)
    setLoadError(null)
    try {
      if (window.electronAPI) {
        const list = await window.electronAPI.listInstalledApps()
        setApps(list)
      } else {
        const errMsg = 'Desktop integration bridge (electronAPI) is disconnected. Unable to query Windows registry.'
        setLoadError(errMsg)
        setStatusMessage({ text: errMsg, type: 'error' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to load apps:', err)
      setLoadError(`Failed to query installed software from registry: ${msg}`)
      setStatusMessage({ text: `Failed to load installed applications: ${msg}`, type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadApps()
  }, [])

  const filteredAndSortedApps = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        (app.publisher && app.publisher.toLowerCase().includes(q))
    )

    return filtered.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'size') {
        const sizeA = a.estimatedSizeBytes || 0
        const sizeB = b.estimatedSizeBytes || 0
        comparison = sizeB - sizeA
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name)
      } else if (sortBy === 'date') {
        const dateA = a.installDate || ''
        const dateB = b.installDate || ''
        comparison = dateB.localeCompare(dateA)
      }

      return sortAsc ? -comparison : comparison
    })
  }, [apps, search, sortBy, sortAsc])

  const totalInstalledSize = useMemo(() => {
    return apps.reduce((acc, app) => acc + (app.estimatedSizeBytes || 0), 0)
  }, [apps])

  const handleLaunchUninstall = async (app: InstalledApp) => {
    if (!window.electronAPI) return
    setIsLaunchingUninstall(true)
    try {
      const res = await window.electronAPI.uninstallApp(app.id)
      if (res.success) {
        setStatusMessage({
          text: res.message || `Uninstaller initiated for ${app.name}.`,
          type: 'info',
          actionApp: app,
        })
      } else {
        setStatusMessage({
          text: res.message || `Could not launch uninstaller for ${app.name}.`,
          type: 'warning',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ text: `Error launching uninstaller: ${msg}`, type: 'error' })
    } finally {
      setIsLaunchingUninstall(false)
      setUninstallConfirmApp(null)
    }
  }

  const toggleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortAsc(!sortAsc)
    } else {
      setSortBy(option)
      setSortAsc(false)
    }
  }

  return (
    <div className="flex flex-col h-full space-y-4 max-w-6xl mx-auto pb-4">
      {/* Top Header Card */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/80 border border-white/[0.08] p-5 rounded-xl shadow-lg flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight text-slate-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-300">
                <AppWindow className="w-4 h-4 text-blue-400" />
              </div>
              Installed Applications
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.06]">
              {apps.length} programs • {formatBytes(totalInstalledSize)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Launch native uninstallers with elevation and scan residual AppData & ProgramData leftovers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps or publisher…"
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Sort Buttons */}
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 text-xs">
            <button
              onClick={() => toggleSort('size')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
                sortBy === 'size'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Size
              {sortBy === 'size' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
            <button
              onClick={() => toggleSort('name')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
                sortBy === 'name'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Name
              {sortBy === 'name' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
            <button
              onClick={() => toggleSort('date')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
                sortBy === 'date'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Date
              {sortBy === 'date' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Status Notification Banner */}
      {statusMessage && (
        <div
          className={`text-xs p-3 rounded-lg border flex items-center justify-between flex-shrink-0 animate-fade-in ${
            statusMessage.type === 'error'
              ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
              : statusMessage.type === 'warning'
              ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
              : 'bg-blue-950/40 text-blue-300 border-blue-800/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-medium">{statusMessage.text}</span>
            {statusMessage.actionApp && (
              <button
                onClick={() => setLeftoversTargetApp(statusMessage.actionApp!)}
                className="font-medium underline hover:no-underline flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <FolderSearch className="w-3.5 h-3.5" />
                Scan for Leftover Residue
              </button>
            )}
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="opacity-70 hover:opacity-100 font-bold ml-3 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Applications List Table */}
      <div className="flex-1 bg-slate-900/60 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col min-h-0 shadow-lg">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            <span className="font-medium">Scanning Windows registry for installed software…</span>
          </div>
        ) : loadError && filteredAndSortedApps.length === 0 ? (
          <EmptyState
            variant="error"
            icon={<AlertCircle className="w-8 h-8" />}
            title="Unable to Load Installed Applications"
            description={loadError}
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={loadApps}
              >
                Retry Registry Scan
              </Button>
            }
            className="flex-1 border-none bg-transparent"
          />
        ) : filteredAndSortedApps.length === 0 ? (
          <EmptyState
            icon={<AppWindow className="w-8 h-8" />}
            title="No Applications Found"
            description={
              search
                ? `No applications matching "${search}" were found.`
                : 'No installed applications detected.'
            }
            className="flex-1 border-none bg-transparent"
          />
        ) : (
          <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
            {filteredAndSortedApps.map((app) => {
              const isSelected = selectedApp?.id === app.id

              return (
                <div
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className={`flex items-center justify-between p-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-950/20 border-l-2 border-blue-500'
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-300 font-mono font-medium text-xs flex-shrink-0 select-none">
                      {app.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs text-slate-100 truncate">
                          {app.name}
                        </span>
                        {app.version && (
                          <span className="text-[10px] text-slate-400 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.2 rounded font-mono">
                            v{app.version}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 truncate mt-0.5">
                        {app.publisher && (
                          <span className="flex items-center gap-1.5 truncate">
                            <Building className="w-3 h-3 flex-shrink-0 text-slate-500" />
                            {app.publisher}
                          </span>
                        )}
                        {app.installDate && (
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            <Calendar className="w-3 h-3 flex-shrink-0 text-slate-500" />
                            {app.installDate}
                          </span>
                        )}
                        {app.installLocation && (
                          <span className="font-mono text-[10px] text-slate-500 truncate hidden md:inline">
                            {app.installLocation}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <span className="font-medium text-xs text-slate-200 block font-mono">
                        {app.estimatedSizeBytes ? formatBytes(app.estimatedSizeBytes) : 'Unknown size'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<FolderSearch className="w-3.5 h-3.5 text-slate-400" />}
                        onClick={(e) => {
                          e.stopPropagation()
                          setLeftoversTargetApp(app)
                        }}
                      >
                        Residue
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 className="w-3 h-3" />}
                        title={
                          app.uninstallString
                            ? 'Launch Windows uninstaller'
                            : 'No uninstaller registered'
                        }
                        disabled={!app.uninstallString}
                        onClick={(e) => {
                          e.stopPropagation()
                          setUninstallConfirmApp(app)
                        }}
                      >
                        Uninstall
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Leftover Residue Modal */}
      <LeftoversModal
        isOpen={!!leftoversTargetApp}
        app={leftoversTargetApp}
        onClose={() => setLeftoversTargetApp(null)}
        onCleanComplete={(cleanedBytes) => {
          setStatusMessage({
            text: `Successfully reclaimed ${formatBytes(cleanedBytes)} in leftover junk!`,
            type: 'success',
          })
        }}
      />

      {/* Confirmation Modal before launching native uninstaller */}
      {uninstallConfirmApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-fade-in">
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1c2028] border border-slate-200 dark:border-slate-700/80 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Uninstall Application
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Windows native uninstaller launcher
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#14171d] border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {uninstallConfirmApp.name}
                </div>
                {uninstallConfirmApp.publisher && (
                  <div className="text-slate-500">Publisher: {uninstallConfirmApp.publisher}</div>
                )}
                {uninstallConfirmApp.estimatedSizeBytes && (
                  <div className="text-slate-500">
                    Reported Size: {formatBytes(uninstallConfirmApp.estimatedSizeBytes)}
                  </div>
                )}
                {uninstallConfirmApp.uninstallString && (
                  <div className="text-[10px] font-mono text-slate-400 truncate pt-1 border-t border-slate-200/50 dark:border-slate-800/50">
                    Cmd: {uninstallConfirmApp.uninstallString}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Fernum will launch the application's native Windows uninstaller with elevation. If Windows prompts for UAC administrator permission, select <strong>Yes</strong>.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setUninstallConfirmApp(null)}
                  disabled={isLaunchingUninstall}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={
                    isLaunchingUninstall ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3 h-3" />
                    )
                  }
                  disabled={isLaunchingUninstall}
                  onClick={() => handleLaunchUninstall(uninstallConfirmApp)}
                >
                  {isLaunchingUninstall ? 'Launching...' : 'Launch Uninstaller'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
