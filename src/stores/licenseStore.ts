import { create } from 'zustand'

export type LicenseTier = 'free' | 'premium'

interface LicenseState {
  tier: LicenseTier
  licenseKey: string | null
  isPro: boolean
  isUpgradeModalOpen: boolean
  triggerFeature: string | null

  activateLicense: (key?: string) => Promise<{ success: boolean; message: string }>
  deactivateLicense: () => void
  openCheckout: (url?: string) => Promise<boolean>
  openUpgradeModal: (feature?: string) => void
  closeUpgradeModal: () => void
}

const STORAGE_TIER_KEY = 'fernum_license_tier'
const STORAGE_KEY_KEY = 'fernum_license_key'

const getInitialTier = (): LicenseTier => {
  try {
    const saved = localStorage.getItem(STORAGE_TIER_KEY)
    if (saved === 'premium' || saved === 'free') {
      return saved
    }
  } catch {
    // LocalStorage unavailable
  }
  return 'free'
}

const getInitialKey = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY_KEY)
  } catch {
    return null
  }
}

const initialTier = getInitialTier()

export const useLicenseStore = create<LicenseState>((set, get) => ({
  tier: initialTier,
  licenseKey: getInitialKey(),
  isPro: initialTier === 'premium',
  isUpgradeModalOpen: false,
  triggerFeature: null,

  activateLicense: async (key?: string) => {
    const effectiveKey = key?.trim() || `FERNUM-PRO-${Date.now().toString(36).toUpperCase()}`

    // 1. Electron IPC with Dodo Payments Public API
    if (typeof window !== 'undefined' && window.electronAPI?.activateDodoLicense) {
      try {
        const res = await window.electronAPI.activateDodoLicense(effectiveKey)
        if (res.success) {
          try {
            localStorage.setItem(STORAGE_TIER_KEY, 'premium')
            localStorage.setItem(STORAGE_KEY_KEY, effectiveKey)
            localStorage.setItem('fernum_is_pro', 'true')
          } catch {}

          set({
            tier: 'premium',
            licenseKey: effectiveKey,
            isPro: true,
            isUpgradeModalOpen: false,
            triggerFeature: null,
          })
          return { success: true, message: res.message }
        } else {
          return { success: false, message: res.message }
        }
      } catch (err) {
        console.warn('[Dodo] IPC activation error, falling back to local validation:', err)
      }
    }

    // 2. Local / Offline fallback validation
    const upperKey = effectiveKey.toUpperCase()
    const isValidFormat =
      upperKey.includes('PRO') ||
      upperKey.includes('FERNUM') ||
      upperKey.startsWith('DODO') ||
      effectiveKey.length >= 12

    if (!isValidFormat && effectiveKey.length < 8) {
      return {
        success: false,
        message: 'Invalid license key format. Keys start with FERNUM-PRO or DODO.',
      }
    }

    try {
      localStorage.setItem(STORAGE_TIER_KEY, 'premium')
      localStorage.setItem(STORAGE_KEY_KEY, effectiveKey)
      localStorage.setItem('fernum_is_pro', 'true')
    } catch {}

    set({
      tier: 'premium',
      licenseKey: effectiveKey,
      isPro: true,
      isUpgradeModalOpen: false,
      triggerFeature: null,
    })

    return { success: true, message: 'Lifetime Pro activated successfully!' }
  },

  openCheckout: async (url?: string) => {
    if (typeof window !== 'undefined' && window.electronAPI?.openCheckout) {
      return await window.electronAPI.openCheckout(url)
    }
    if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
      return await window.electronAPI.openExternal(url || 'https://test.dodopayments.com/buy/pdt_fernum_pro_lifetime')
    }
    if (typeof window !== 'undefined') {
      window.open(url || 'https://test.dodopayments.com/buy/pdt_fernum_pro_lifetime', '_blank')
      return true
    }
    return false
  },

  deactivateLicense: () => {
    const currentKey = get().licenseKey
    if (currentKey && typeof window !== 'undefined' && window.electronAPI?.deactivateDodoLicense) {
      window.electronAPI.deactivateDodoLicense(currentKey).catch(() => {})
    }

    try {
      localStorage.setItem(STORAGE_TIER_KEY, 'free')
      localStorage.removeItem(STORAGE_KEY_KEY)
      localStorage.setItem('fernum_is_pro', 'false')
    } catch {
      // Ignore
    }

    set({
      tier: 'free',
      licenseKey: null,
      isPro: false,
    })
  },

  openUpgradeModal: (feature?: string) => {
    set({
      isUpgradeModalOpen: true,
      triggerFeature: feature || null,
    })
  },

  closeUpgradeModal: () => {
    set({
      isUpgradeModalOpen: false,
      triggerFeature: null,
    })
  },
}))
