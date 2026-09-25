import React, { useState } from 'react'
import { Trash2, ChevronUp, ChevronDown, Check } from 'lucide-react'
import { formatBytes } from './treemapLayout'

export const CleanupQueueDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isCleaned, setIsCleaned] = useState(false)
  const [items, setItems] = useState([
    { id: '1', name: 'Android build cache', size: 3050000000, category: 'Dev' },
    { id: '2', name: 'Google Chrome Profile 5 Cache', size: 889000000, category: 'Cache' },
    { id: '3', name: 'sha256-dde5aa3fc5... blob', size: 2020000000, category: 'Model' },
    { id: '4', name: 'Node.js build artifacts', size: 1200000000, category: 'Dev' },
  ])

  const totalBytes = items.reduce((acc, item) => acc + item.size, 0)

  const handleClean = () => {
    setIsCleaned(true)
    setTimeout(() => {
      setItems([])
      setIsOpen(false)
      setIsCleaned(false)
    }, 1200)
  }

  if (items.length === 0) return null

  return (
    <div className="absolute bottom-4 right-4 z-40 select-none font-sans">
      {isOpen ? (
        <div className="w-80 rounded-xl bg-[#14161c]/95 backdrop-blur-xl border border-[#282d38] shadow-2xl p-3 space-y-3 animate-fade-in text-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#222733] pb-2">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <Trash2 className="w-3 h-3" />
              </div>
              <span className="font-bold text-zinc-100">Cleanup Queue</span>
              <span className="rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold px-1.5 py-0.2">
                {items.length}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Items List */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-lg bg-[#1c2029] border border-[#2a303e] text-zinc-200"
              >
                <div className="truncate mr-2">
                  <p className="font-medium truncate text-zinc-200 text-[11px]">{item.name}</p>
                  <span className="text-[10px] text-zinc-500">{item.category}</span>
                </div>
                <span className="font-mono text-zinc-400 shrink-0 text-[11px]">
                  {formatBytes(item.size)}
                </span>
              </div>
            ))}
          </div>

          {/* Action Footer */}
          <div className="pt-1">
            <button
              onClick={handleClean}
              disabled={isCleaned}
              className="w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-70"
            >
              {isCleaned ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Cleaned {formatBytes(totalBytes)}!</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clean Queue ({formatBytes(totalBytes)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#181a21]/95 hover:bg-[#20232d] backdrop-blur-md border border-[#2f3542] text-zinc-100 shadow-xl transition-all hover:scale-102 cursor-pointer group"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400 group-hover:text-rose-300 transition-colors" />
          <span className="text-xs font-semibold">Cleanup Queue</span>
          <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-xs">
            {items.length}
          </span>
          <ChevronUp className="w-3.5 h-3.5 text-zinc-400 ml-0.5 group-hover:text-zinc-200" />
        </button>
      )}
    </div>
  )
}
