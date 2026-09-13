import React from 'react'
import { HardDrive, Sparkles, AppWindow, Search, Activity } from 'lucide-react'

export type TabKey = 'storage' | 'cleaner' | 'apps' | 'search' | 'monitor'

interface TabNavigationProps {
  activeTab: TabKey
  onSelectTab: (tab: TabKey) => void
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onSelectTab }) => {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      key: 'storage',
      label: 'Storage',
      icon: <HardDrive className="w-4 h-4" />,
    },
    {
      key: 'cleaner',
      label: 'Cleaner',
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      key: 'apps',
      label: 'Apps',
      icon: <AppWindow className="w-4 h-4" />,
    },
    {
      key: 'search',
      label: 'Search',
      icon: <Search className="w-4 h-4" />,
    },
    {
      key: 'monitor',
      label: 'Monitor',
      icon: <Activity className="w-4 h-4" />,
    },
  ]

  return (
    <nav className="space-y-1 border-b border-white/10 bg-[#1d1d1d] p-3">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        return (
          <button
            id={`tab-${tab.key}`}
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-white/10 hover:text-slate-100'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
