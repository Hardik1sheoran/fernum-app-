import React from 'react'
import { HardDrive, Trash2, AppWindow, Search, Activity, Loader2 } from 'lucide-react'
import { useLicenseStore } from '../../stores/licenseStore'
import { useScanStore } from '../../stores/scanStore'

export type TabKey = 'storage' | 'cleaner' | 'apps' | 'search' | 'monitor'

interface TabNavigationProps {
  activeTab: TabKey
  onSelectTab: (tab: TabKey) => void
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onSelectTab }) => {
  const { isPro } = useLicenseStore()
  const { scanProgress } = useScanStore()
  const isBackgroundScanning = scanProgress.status === 'scanning'

  const tabs: {
    key: TabKey
    label: string
    icon: React.ReactNode
    isProFeature?: boolean
  }[] = [
    {
      key: 'storage',
      label: 'Storage',
      icon: <HardDrive className="w-4 h-4" />,
    },
    {
      key: 'cleaner',
      label: 'Disk Cleanup',
      icon: <Trash2 className="w-4 h-4" />,
      isProFeature: true,
    },
    {
      key: 'apps',
      label: 'Installed Apps',
      icon: <AppWindow className="w-4 h-4" />,
      isProFeature: true,
    },
    {
      key: 'search',
      label: 'Search Files',
      icon: <Search className="w-4 h-4" />,
    },
    {
      key: 'monitor',
      label: 'Performance',
      icon: <Activity className="w-4 h-4" />,
    },
  ]

  return (
    <nav className="p-2 space-y-1 select-none border-b border-[#2d2d33]">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        return (
          <button
            id={`tab-${tab.key}`}
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
              isActive
                ? 'bg-[#2b2b32] text-white font-semibold shadow-sm'
                : 'text-zinc-400 hover:bg-[#25252b] hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className={isActive ? 'text-blue-400' : 'text-zinc-400'}>
                {tab.icon}
              </span>
              <span className="tracking-tight">{tab.label}</span>
            </div>
            {tab.key === 'storage' && isBackgroundScanning && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-medium animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.25)]">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>Scanning</span>
              </div>
            )}
            {tab.isProFeature && !isPro && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Pro
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
