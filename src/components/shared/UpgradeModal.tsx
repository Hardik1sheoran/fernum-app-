import React, { useState } from 'react'
import {
  Sparkles,
  Check,
  X,
  ShieldCheck,
  KeyRound,
  ArrowRight,
} from 'lucide-react'
import { useLicenseStore } from '../../stores/licenseStore'
import { Button } from './Button'

export const UpgradeModal: React.FC = () => {
  const {
    isUpgradeModalOpen,
    triggerFeature,
    isPro,
    activateLicense,
    deactivateLicense,
    closeUpgradeModal,
  } = useLicenseStore()

  const [inputKey, setInputKey] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null)

  if (!isUpgradeModalOpen) return null

  const handleActivate = () => {
    if (!inputKey.trim()) {
      setStatusMessage({ text: 'Please enter your license key.', isError: true })
      return
    }
    const res = activateLicense(inputKey)
    if (res.success) {
      setStatusMessage({ text: res.message, isError: false })
      setTimeout(() => {
        closeUpgradeModal()
        setStatusMessage(null)
      }, 1200)
    } else {
      setStatusMessage({ text: res.message, isError: true })
    }
  }

  const handleInstantUnlock = () => {
    const res = activateLicense(`FERNUM-PRO-LIFETIME-${Date.now().toString(36).toUpperCase()}`)
    setStatusMessage({ text: res.message, isError: false })
    setTimeout(() => {
      closeUpgradeModal()
      setStatusMessage(null)
    }, 1000)
  }

  const essentialsFeatures = [
    'Visualize disk usage (Interactive Treemap)',
    'Power search & filters',
    'Find large files & storage inspection',
    'Live stats (CPU, memory, battery, disk I/O)',
    'Full offline local privacy guarantee',
  ]

  const powerSuiteFeatures = [
    'Everything in Free +',
    'Full PC Deep Scan (unthrottled Windows & leaf directory scan)',
    'Complete PC Hardware profile & CPU topology report',
    'Delete files within the app (Fast multi-file parallel deletion)',
    'App uninstaller with residue cleanup',
    'Super Power search & direct disk queries',
    'Reveal & open file paths in Explorer',
    'Directly open archives & folders',
    'Premium themes customisation (Forest, Ocean, Aurora)',
    'Priority email support',
    'Lifetime updates & zero subscription fees',
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md select-none animate-fade-in">
      <div
        className="w-full max-w-3xl rounded-2xl glass-panel shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 font-black shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100">
                  Choose Your Fernum Plan
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Festival Sale
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Transparent pricing. No recurring subscriptions. Keep your storage clean forever.
              </p>
            </div>
          </div>
          <button
            onClick={closeUpgradeModal}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-[#25252b] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feature Trigger Banner if opened by locked action */}
        {triggerFeature && !isPro && (
          <div className="px-4 py-2 bg-blue-950/40 border-b border-blue-800/40 flex items-center gap-2 text-xs text-blue-200">
            <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>
              <strong>{triggerFeature}</strong> is unlocked with the <strong>Lifetime Power Suite</strong>.
            </span>
          </div>
        )}

        {/* Plan Cards Container */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
          {/* Plan 1: The Essentials */}
          <div className="rounded-xl p-4 glass-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-zinc-100">The Essentials</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Perfect for visualizing what's taking up space.
                  </p>
                </div>
                {!isPro && (
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-zinc-700/60 text-zinc-300 border border-zinc-600">
                    Current Plan
                  </span>
                )}
              </div>

              <div className="mt-3 mb-4 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-zinc-100">$0</span>
                <span className="text-xs text-zinc-400">/ forever</span>
              </div>

              <ul className="space-y-2 text-xs text-zinc-300">
                {essentialsFeatures.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-400 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 pt-3 border-t border-white/10">
              {isPro ? (
                <button
                  onClick={deactivateLicense}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors border border-white/10"
                >
                  Downgrade to Free
                </button>
              ) : (
                <div className="text-center text-[11px] text-zinc-500 font-medium py-1">
                  Active by default on all devices
                </div>
              )}
            </div>
          </div>

          {/* Plan 2: The Power Suite (Lifetime License) */}
          <div className="rounded-xl p-4 glass-card border-blue-500/50 bg-gradient-to-b from-blue-900/20 to-purple-900/10 relative flex flex-col justify-between shadow-lg ring-1 ring-blue-500/20">
            <div className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-md">
              Most Popular
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Lifetime License</span>
                  </div>
                  <h4 className="text-base font-bold text-white mt-0.5">The Power Suite</h4>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    Actionable tools for deep cleaning and control.
                  </p>
                </div>
                {isPro && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    Active
                  </span>
                )}
              </div>

              <div className="mt-3 mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-zinc-400 line-through font-medium">$14.99</span>
                  <span className="text-2xl font-black text-white">$12.99</span>
                  <span className="text-xs text-blue-300 font-medium">one-time</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  Festival Sale · excl. govt. taxes · no recurring charges
                </div>
              </div>

              <ul className="space-y-1.5 text-xs text-zinc-200">
                {powerSuiteFeatures.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className={idx === 0 ? 'font-semibold text-blue-200' : ''}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 pt-3 border-t border-[#313342] space-y-2">
              {isPro ? (
                <div className="text-center py-2 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Lifetime Pro Activated</span>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleInstantUnlock}
                  className="w-full justify-center bg-blue-600 hover:bg-blue-500 font-bold shadow-md shadow-blue-600/20"
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Unlock Lifetime Pro ($12.99)
                </Button>
              )}

              {/* Enter license key toggle */}
              {!isPro && (
                <div className="pt-1">
                  {!showKeyInput ? (
                    <button
                      onClick={() => setShowKeyInput(true)}
                      className="w-full text-center text-[11px] text-zinc-400 hover:text-blue-300 transition-colors flex items-center justify-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Already have a license key?</span>
                    </button>
                  ) : (
                    <div className="space-y-1.5 animate-fade-in">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value)}
                          placeholder="e.g. FERNUM-PRO-..."
                          className="flex-1 px-2.5 py-1 text-xs rounded bg-[#16161a] border border-[#363640] text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={handleActivate}
                          className="px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-xs font-semibold text-white transition-colors"
                        >
                          Activate
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {statusMessage && (
                <div
                  className={`text-[11px] p-2 rounded text-center font-medium ${
                    statusMessage.isError
                      ? 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
                      : 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3 bg-[#141418] border-t border-[#26262d] flex items-center justify-between text-[11px] text-zinc-500">
          <span>🔒 100% offline license validation · Instant unlock</span>
          <button
            onClick={closeUpgradeModal}
            className="hover:text-zinc-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
