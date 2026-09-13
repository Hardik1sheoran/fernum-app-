import React, { useEffect, useState, useMemo } from 'react'
import {
  AlertCircle,
  AppWindow,
  Search,
  Trash2,
  Sparkles,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Calendar,
  Building,
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
    <div className="flex flex-col h-full space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-white dark:bg-[#181b21] p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <AppWindow className="w-4 h-4 text-blue-500" />
              Installed Applications
            </h2>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {apps.length} programs • {formatBytes(totalInstalledSize)} total
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Launch native uninstallers and deep-clean leftover caches, configuration files, and residual data
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps or publisher..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14171d] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Sort Buttons */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14171d] p-0.5 text-xs">
            <button
              onClick={() => toggleSort('size')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                sortBy === 'size'
                  ? 'bg-white dark:bg-slate-800 font-semibold text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Size
              {sortBy === 'size' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
            <button
              onClick={() => toggleSort('name')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                sortBy === 'name'
                  ? 'bg-white dark:bg-slate-800 font-semibold text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Name
              {sortBy === 'name' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
            <button
              onClick={() => toggleSort('date')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                sortBy === 'date'
                  ? 'bg-white dark:bg-slate-800 font-semibold text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Date
              {sortBy === 'date' && (
                <ArrowUpDown className={`w-3 h-3 ${sortAsc ? 'rotate-180' : ''}`} />
              )}
            </button>
          </div>

          {/* Refresh Button */}
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={loadApps}
            disabled={isLoading}
            title="Refresh installed software list"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Notification Banner */}
      {statusMessage && (
        <div
          className={`text-xs p-3 rounded-xl border flex items-center justify-between flex-shrink-0 animate-fade-in ${
            statusMessage.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
              : statusMessage.type === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900'
          }`}
        >
          <div className="flex items-center gap-3">
            <span>{statusMessage.text}</span>
            {statusMessage.actionApp && (
              <button
                onClick={() => setLeftoversTargetApp(statusMessage.actionApp!)}
                className="font-bold underline hover:no-underline flex items-center gap-1 text-amber-600 dark:text-amber-400"
              >
                <Sparkles className="w-3 h-3" />
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
      <div className="flex-1 bg-white dark:bg-[#181b21] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-0">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span>Scanning Windows registry for installed software...</span>
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
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredAndSortedApps.map((app) => {
              const isSelected = selectedApp?.id === app.id

              return (
                <div
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className={`flex items-center justify-between p-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/50 dark:bg-blue-950/20'
                      : 'hover:bg-slate-50 dark:hover:bg-[#1f242d]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0 select-none">
                      {app.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                          {app.name}
                        </span>
                        {app.version && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                            v{app.version}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 truncate mt-0.5">
                        {app.publisher && (
                          <span className="flex items-center gap-1 truncate">
                            <Building className="w-3 h-3 flex-shrink-0" />
                            {app.publisher}
                          </span>
                        )}
                        {app.installDate && (
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            {app.installDate}
                          </span>
                        )}
                        {app.installLocation && (
                          <span className="font-mono text-[10px] text-slate-400/80 truncate hidden md:inline">
                            {app.installLocation}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 block">
                        {app.estimatedSizeBytes ? formatBytes(app.estimatedSizeBytes) : 'Unknown size'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Sparkles className="w-3 h-3 text-amber-500" />}
                        title="Scan and clean leftover cache and files"
                        onClick={(e) => {
                          e.stopPropagation()
                          setLeftoversTargetApp(app)
                        }}
                      >
                        Clean Junk
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
