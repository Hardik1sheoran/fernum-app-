import React from 'react'
import { ShieldCheck, Lock, HardDrive, Cpu, X, CheckCircle2 } from 'lucide-react'
import { Button } from './Button'

interface PrivacyModalProps {
  isOpen: boolean
  onClose: () => void
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-fade-in">
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#191d24] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Privacy First Architecture
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  100% Local
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Your personal files, documents, and disk contents never leave your PC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Core Pillars */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 dark:bg-[#14171d] border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Zero Cloud Uploads or Telemetry
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  All scanning algorithms, treemap layout calculations, and file indexing run exclusively on your machine's CPU worker threads. No telemetry or file listings are transmitted over the network.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 dark:bg-[#14171d] border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Native Windows Filesystem Sandboxing
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Protected Windows system directories (like <code className="font-mono text-slate-600 dark:text-slate-300">C:\Windows</code> and recovery partitions) are shielded by path security validation to safeguard your operating system.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-50 dark:bg-[#14171d] border border-slate-200/80 dark:border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Recycle Bin Default Safety
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  File operations default to your Windows native Recycle Bin, allowing instant restoration if an item is moved inadvertently.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>Air-gapped safe: Fernum functions seamlessly without any internet connection.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50/80 dark:bg-[#14171d] border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Got It
          </Button>
        </div>
      </div>
    </div>
  )
}
