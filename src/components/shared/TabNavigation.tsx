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
      label: 'Disk Cleanup',
      icon: <Trash2 className="w-4 h-4" />,
    },
    {
      key: 'apps',
      label: 'Installed Apps',
      icon: <AppWindow className="w-4 h-4" />,
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
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs transition-colors ${
              isActive
                ? 'bg-[#2b2b32] text-white font-semibold shadow-sm'
                : 'text-zinc-400 hover:bg-[#25252b] hover:text-zinc-200'
            }`}
          >
            <span className={isActive ? 'text-blue-400' : 'text-zinc-400'}>
              {tab.icon}
            </span>
            <span className="tracking-tight">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}


