import React from 'react'
import { HardDrive, Trash2, AppWindow, Search, Activity } from 'lucide-react'

export type TabKey = 'storage' | 'cleaner' | 'apps' | 'search' | 'monitor'

interface TabNavigationProps {
  activeTab: TabKey
  onSelectTab: (tab: TabKey) => void
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onSelectTab }) => {
  const tabs: {
    key: TabKey
    label: string
    icon: React.ReactNode
  }[] = [
    {
      key: 'storage',
      label: 'Storage',
      icon: <HardDrive className="w-4 h-4" />,
    },
    {
      key: 'cleaner',
      label: 'Junk Cleaner',
      icon: <Trash2 className="w-4 h-4" />,
    },
    {
      key: 'apps',
      label: 'Applications',
      icon: <AppWindow className="w-4 h-4" />,
    },
    {
      key: 'search',
      label: 'Search',
      icon: <Search className="w-4 h-4" />,
    },
    {
      key: 'monitor',
      label: 'Telemetry',
      icon: <Activity className="w-4 h-4" />,
    },
  ]

  return (
    <nav className="p-2 space-y-0.5 select-none border-b border-white/[0.06]">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        return (
          <button
            id={`tab-${tab.key}`}
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
              isActive
                ? 'bg-blue-600/15 text-blue-400 font-medium'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <span className={isActive ? 'text-blue-400' : 'text-slate-500'}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}


