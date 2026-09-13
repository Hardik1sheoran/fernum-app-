import React from 'react'
import { ChevronRight, HardDrive, Folder } from 'lucide-react'
import type { FileNode } from '@shared/types'

interface BreadcrumbProps {
  items: FileNode[]
  onSelect: (index: number) => void
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, onSelect }) => {
  if (items.length === 0) return null

  return (
    <nav className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400 overflow-x-auto py-1 px-2 bg-slate-100/60 dark:bg-[#1a1d24] rounded-md border border-slate-200/80 dark:border-slate-800">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const isDrive = index === 0

        return (
          <React.Fragment key={item.id || item.path || index}>
            <button
              onClick={() => onSelect(index)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap ${
                isLast
                  ? 'font-semibold text-slate-900 dark:text-slate-100 bg-white/70 dark:bg-slate-800/80 shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
              }`}
            >
              {isDrive ? (
                <HardDrive className="w-3.5 h-3.5 text-blue-500" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span>{item.name}</span>
            </button>
            {!isLast && <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600 flex-shrink-0" />}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
