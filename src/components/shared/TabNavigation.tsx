import React from 'react'
import { HardDrive, Sparkles, AppWindow, Search, Activity } from 'lucide-react'

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
    badge?: string
    badgeColor?: string
  }[] = [
    {
      key: 'storage',
      label: 'Storage & Tree',
      icon: <HardDrive className="w-4 h-4" />,
    },
    {
      key: 'cleaner',
      label: 'Junk Cleaner',
      icon: <Sparkles className="w-4 h-4" />,
      badge: 'Safe',
      badgeColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20',
    },
    {
      key: 'apps',
      label: 'Applications',
      icon: <AppWindow className="w-4 h-4" />,
    },
    {
      key: 'search',
      label: 'Instant Search',
      icon: <Search className="w-4 h-4" />,
    },
    {
      key: 'monitor',
      label: 'Live Monitor',
      icon: <Activity className="w-4 h-4" />,
      badge: 'Live',
      badgeColor: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/20 animate-pulse',
    },
  ]

  return (
    <nav className="p-3 space-y-1 select-none border-b border-white/[0.06]">
      <div className="px-2 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Navigation
      </div>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        return (
          <button
            id={`tab-${tab.key}`}
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            className={`group relative flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition-all duration-200 ${
              isActive
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25 scale-[1.01]'
                : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 active:scale-[0.99]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`transition-colors duration-200 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                }`}
              >
                {tab.icon}
              </span>
              <span className="tracking-tight">{tab.label}</span>
            </div>
            {tab.badge && (
              <span
                className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                  isActive
                    ? 'bg-white/20 text-white border-white/30'
                    : tab.badgeColor || 'bg-white/5 text-slate-400 border-white/10'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

