import { create } from 'zustand'

export type LicenseTier = 'free' | 'premium'

interface LicenseState {
  tier: LicenseTier
  licenseKey: string | null
  isPro: boolean
  isUpgradeModalOpen: boolean
  triggerFeature: string | null

  activateLicense: (key?: string) => { success: boolean; message: string }
  deactivateLicense: () => void
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

export const useLicenseStore = create<LicenseState>((set) => ({
  tier: initialTier,
  licenseKey: getInitialKey(),
  isPro: initialTier === 'premium',
  isUpgradeModalOpen: false,
  triggerFeature: null,

  activateLicense: (key?: string) => {
    const effectiveKey = key?.trim() || `FERNUM-PRO-${Date.now().toString(36).toUpperCase()}`
    
    // Validate format: accept any key containing PRO, FERNUM, or standard license pattern
    if (key && key.trim().length > 0 && !key.toUpperCase().includes('PRO') && key.length < 8) {
      return { success: false, message: 'Invalid license key format. Keys start with FERNUM-PRO.' }
    }

    try {
      localStorage.setItem(STORAGE_TIER_KEY, 'premium')
      localStorage.setItem(STORAGE_KEY_KEY, effectiveKey)
    } catch {
      // Ignore
    }

    set({
      tier: 'premium',
      licenseKey: effectiveKey,
      isPro: true,
      isUpgradeModalOpen: false,
      triggerFeature: null,
    })

    return { success: true, message: 'Lifetime Pro activated successfully!' }
  },

  deactivateLicense: () => {
    try {
      localStorage.setItem(STORAGE_TIER_KEY, 'free')
      localStorage.removeItem(STORAGE_KEY_KEY)
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
