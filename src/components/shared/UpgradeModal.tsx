import React, { useState, useEffect } from 'react'
import {
  Check,
  X,
  ShieldCheck,
  KeyRound,
  CreditCard,
  Loader2,
  RefreshCw,
  Copy,
  CheckCheck,
  AlertCircle,
} from 'lucide-react'
import { useLicenseStore } from '../../stores/licenseStore'
import { Button } from './Button'
import { FernumLogo } from './FernumLogo'

export const UpgradeModal: React.FC = () => {
  const {
    isUpgradeModalOpen,
    triggerFeature,
    isPro,
    deviceId,
    customerEmail,
    customerName,
    isCheckingLicense,
    licenseError,
    initDeviceId,
    buyLicense,
    refreshLicense,
    deactivateLicense,
    closeUpgradeModal,
  } = useLicenseStore()

  const [inputEmail, setInputEmail] = useState(customerEmail || '')
  const [inputName, setInputName] = useState(customerName || '')
  const [inputKey, setInputKey] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null)

  useEffect(() => {
    if (isUpgradeModalOpen) {
      void initDeviceId()
      setInputEmail(customerEmail || '')
      setInputName(customerName || '')
    }
  }, [isUpgradeModalOpen, customerEmail, customerName, initDeviceId])

  // Listen for incoming deep links from Dodo Payments checkout redirect (e.g. fernum://license?key=...)
  useEffect(() => {
    if (window.electronAPI?.onDeepLinkLicense) {
      const unsubscribe = window.electronAPI.onDeepLinkLicense(() => {
        void refreshLicense().then((res) => {
          setStatusMessage({ text: res.message, isError: !res.licensed })
          if (res.licensed) {
            setTimeout(() => {
              closeUpgradeModal()
              setStatusMessage(null)
            }, 1500)
          }
        })
      })
      return unsubscribe
    }
  }, [refreshLicense, closeUpgradeModal])

  if (!isUpgradeModalOpen) return null

  const handleCopyDeviceId = () => {
    if (!deviceId) return
    navigator.clipboard.writeText(deviceId)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const handleBuyLicense = async () => {
    setIsOpeningCheckout(true)
    setStatusMessage(null)

    try {
      const res = await buyLicense(inputEmail, inputName)
      if (res.success) {
        setStatusMessage({
          text: 'Checkout opened in your browser. Once completed, your license is automatically activated for this device! You can also click "Refresh License" below.',
          isError: false,
        })
      } else {
        setStatusMessage({
          text: res.error || 'Failed to initiate checkout. Please check your internet connection.',
          isError: true,
        })
      }
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'Error opening checkout session.',
        isError: true,
      })
    } finally {
      setIsOpeningCheckout(false)
    }
  }

  const handleRefresh = async () => {
    setStatusMessage(null)
    const res = await refreshLicense()
    setStatusMessage({
      text: res.message,
      isError: !res.licensed && Boolean(res.message.includes('error') || res.message.includes('fail')),
    })
    if (res.licensed) {
      setTimeout(() => {
        closeUpgradeModal()
        setStatusMessage(null)
      }, 1500)
    }
  }

  const handleActivateManualKey = async () => {
    setStatusMessage(null)
    const res = await refreshLicense()
    if (res.licensed) {
      setStatusMessage({ text: 'License verified! Lifetime Pro is active.', isError: false })
      setTimeout(() => {
        closeUpgradeModal()
        setStatusMessage(null)
      }, 1500)
    } else {
      setStatusMessage({
        text: 'No active license found for this device on the server. If you completed checkout, please click "Refresh License" to sync.',
        isError: true,
      })
    }
  }

  const essentialsFeatures = [
    'Interactive Storage Treemap (visualize space hogs)',
    'Fast file search & extensions breakdown',
    'Free-tier capped scanning (up to 70GB total)',
    'Real-time live stats (CPU, RAM, disk throughput)',
    '100% offline local privacy guarantee',
  ]

  const powerSuiteFeatures = [
    'Everything in Free +',
    'Storage Manager (Unlock full interactive drive space management)',
    'The disk space analyzer that clears your Windows (Purge system junk, logs & caches)',
    'Uncapped Storage Scanning (Bypass 70GB Free-tier limit)',
    'Deep Duplicate File Hunter (SHA-256 detection & 1-click clean)',
    'Complete App Uninstaller with leftover residue cleaner',
    'Full PC Deep Scan (unthrottled Windows & leaf directory scan)',
    'Full PC Hardware Profile & CPU topology telemetry',
    'All premium themes unlocked (Forest, Ocean, Aurora, Rainbow)',
    'Lifetime license tied to this device · Zero recurring fees',
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md select-none animate-fade-in">
      <div
        className="w-full max-w-3xl rounded-2xl glass-panel shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <FernumLogo className="w-8 h-8 rounded-lg shadow-sm" variant="icon" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100">
                  Fernum Lifetime License
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Dodo Payments
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Single payment. Instant device activation. Keep your PC fast and clutter-free forever.
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
              <strong>{triggerFeature}</strong> is a Pro feature unlocked with a <strong>Lifetime License</strong>.
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
                    Standard drive inspection & visual treemap.
                  </p>
                </div>
                {!isPro && (
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-zinc-700/60 text-zinc-300 border border-zinc-600">
                    Current
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
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors border border-white/10 cursor-pointer"
                >
                  Downgrade to Free
                </button>
              ) : (
                <div className="text-center text-[11px] text-zinc-500 font-medium py-1">
                  Active by default
                </div>
              )}
            </div>
          </div>

          {/* Plan 2: The Power Suite (Lifetime License) */}
          <div className="rounded-xl p-4 glass-card border-blue-500/50 bg-gradient-to-b from-blue-900/20 to-purple-900/10 relative flex flex-col justify-between shadow-lg ring-1 ring-blue-500/20">
            <div className="absolute -top-2.5 right-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-md">
              Lifetime Pro
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Permanent Access</span>
                  <h4 className="text-base font-bold text-white mt-0.5">The Power Suite</h4>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    Uncapped scans, junk cleaner, duplicates & app manager.
                  </p>
                </div>
                {isPro && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    Active
                  </span>
                )}
              </div>

              <div className="mt-3 mb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-zinc-400 line-through font-medium">$14.99</span>
                  <span className="text-2xl font-black text-white">$12.99</span>
                  <span className="text-xs text-blue-300 font-medium">one-time payment</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  No monthly subscriptions · Instant activation
                </div>
              </div>

              <ul className="space-y-1.5 text-xs text-zinc-200">
                {powerSuiteFeatures.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className={idx === 0 || idx === 1 ? 'font-semibold text-blue-200' : ''}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-[#313342] space-y-3">
              {/* Device ID Display */}
              <div className="bg-[#12141a] border border-[#2b2f3a] rounded-lg p-2 flex items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Device ID</span>
                  <span className="font-mono text-zinc-200 truncate">{deviceId || 'Generating device ID…'}</span>
                </div>
                <button
                  onClick={handleCopyDeviceId}
                  className="px-2 py-1 rounded bg-[#202430] hover:bg-[#2b3040] text-zinc-300 text-[10px] font-semibold flex items-center gap-1 transition-colors flex-shrink-0 cursor-pointer"
                  title="Copy Device ID"
                >
                  {copiedId ? (
                    <>
                      <CheckCheck className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {isPro ? (
                <div className="space-y-2">
                  <div className="text-center py-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Lifetime Pro Activated on This Device</span>
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={isCheckingLicense}
                    className="w-full py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingLicense ? 'animate-spin text-blue-400' : ''}`} />
                    <span>Re-verify License Status</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Customer Prompt for Name & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-zinc-400 font-medium block mb-1">Your Name</label>
                      <input
                        type="text"
                        value={inputName}
                        onChange={(e) => setInputName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-2.5 py-1.5 rounded bg-[#16161c] border border-[#2e313c] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 font-medium block mb-1">Receipt Email</label>
                      <input
                        type="email"
                        value={inputEmail}
                        onChange={(e) => setInputEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="w-full px-2.5 py-1.5 rounded bg-[#16161c] border border-[#2e313c] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-xs"
                      />
                    </div>
                  </div>

                  {/* Buy License CTA */}
                  <Button
                    id="btn-buy-license-modal"
                    variant="primary"
                    size="md"
                    onClick={handleBuyLicense}
                    disabled={isOpeningCheckout}
                    className="w-full justify-center bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-indigo-500 font-bold shadow-lg shadow-blue-600/25 text-white py-2.5 cursor-pointer"
                    icon={
                      isOpeningCheckout ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <CreditCard className="w-4 h-4 text-blue-100" />
                      )
                    }
                  >
                    {isOpeningCheckout ? 'Connecting to Dodo Checkout…' : 'Buy License ($12.99)'}
                  </Button>

                  {/* Manual Refresh License CTA */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      id="btn-refresh-license-modal"
                      onClick={handleRefresh}
                      disabled={isCheckingLicense}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 font-medium transition-colors cursor-pointer py-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCheckingLicense ? 'animate-spin text-blue-400' : ''}`} />
                      <span>{isCheckingLicense ? 'Checking license…' : 'Refresh License'}</span>
                    </button>

                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <span>Card</span>
                      <span>·</span>
                      <span>PayPal</span>
                      <span>·</span>
                      <span>Google Pay</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Enter license key toggle / input */}
              {!isPro && (
                <div className="pt-2 border-t border-white/[0.06] space-y-2">
                  {!showKeyInput ? (
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <button
                        onClick={() => setShowKeyInput(true)}
                        className="hover:text-blue-300 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Already purchased a license?</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 animate-fade-in">
                      <label className="text-[10px] font-medium text-zinc-400 flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-blue-400" />
                        <span>Enter License Key:</span>
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && void handleActivateManualKey()}
                          placeholder="e.g. FERNUM-PRO-..."
                          className="flex-1 px-2.5 py-1.5 text-xs rounded bg-[#16161a] border border-[#363640] text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={handleActivateManualKey}
                          className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Activate</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status Message or License Error Banner */}
              {(statusMessage || licenseError) && (
                <div
                  className={`text-[11px] p-2.5 rounded-lg flex items-start gap-2 font-medium animate-fade-in ${
                    statusMessage?.isError || (!statusMessage && licenseError)
                      ? 'bg-rose-950/50 text-rose-200 border border-rose-800/60'
                      : 'bg-emerald-950/50 text-emerald-200 border border-emerald-800/60'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span>{statusMessage ? statusMessage.text : licenseError}</span>
                    {licenseError && !statusMessage && (
                      <button
                        onClick={handleRefresh}
                        className="ml-2 underline font-bold hover:text-white"
                      >
                        Retry Check
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info with Dodo Payments badge */}
        <div className="p-3 bg-[#141418] border-t border-[#26262d] flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-300">Powered by Dodo Payments</span>
            <span className="text-zinc-600">|</span>
            <span>https://fernum-license-api.onrender.com</span>
            <span className="text-zinc-600">|</span>
            <span>256-bit SSL</span>
          </div>
          <button
            onClick={closeUpgradeModal}
            className="hover:text-zinc-200 transition-colors px-2 py-0.5 rounded cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
