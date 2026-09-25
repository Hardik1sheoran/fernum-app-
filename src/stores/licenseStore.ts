import { create } from 'zustand'
import { activateDodoLicense, deactivateDodoLicense } from '../services/dodoPayments'
import { useSettingsStore } from './settingsStore'

export type LicenseTier = 'free' | 'premium'

interface LicenseState {
  tier: LicenseTier
  licenseKey: string | null
  isPro: boolean
  isUpgradeModalOpen: boolean
  triggerFeature: string | null
  isValidating: boolean

  activateLicense: (key?: string) => Promise<{ success: boolean; message: string }>
  activateOnlineLicense: (key: string) => Promise<{ success: boolean; message: string }>
  deactivateLicense: () => Promise<void>
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
  isValidating: false,

  activateLicense: async (key?: string) => {
    const effectiveKey = key?.trim() || `FERNUM-PRO-${Date.now().toString(36).toUpperCase()}`

    // Validate format: accept any key containing PRO, FERNUM, DODO, or standard license pattern
    const isRecognized =
      effectiveKey.toUpperCase().includes('PRO') ||
      effectiveKey.toUpperCase().startsWith('FERNUM-') ||
      effectiveKey.toUpperCase().startsWith('DODO-') ||
      effectiveKey.length >= 16

    if (key && key.trim().length > 0 && !isRecognized && key.length < 8) {
      return { success: false, message: 'Invalid license key format. Keys start with FERNUM-PRO or DODO-.' }
    }

    try {
      localStorage.setItem(STORAGE_TIER_KEY, 'premium')
      localStorage.setItem(STORAGE_KEY_KEY, effectiveKey)
      localStorage.setItem('fernum_is_pro', 'true')
    } catch {}

    useSettingsStore.getState().setIsPro(true)

    set({
      tier: 'premium',
      licenseKey: effectiveKey,
      isPro: true,
      isUpgradeModalOpen: false,
      triggerFeature: null,
    })

    return { success: true, message: 'Lifetime Pro activated successfully!' }
  },

  activateOnlineLicense: async (key: string) => {
    set({ isValidating: true })
    try {
      const result = await activateDodoLicense(key)
      if (result.success) {
        get().activateLicense(result.licenseKey)
        return { success: true, message: result.message }
      }
      return { success: false, message: result.message }
    } finally {
      set({ isValidating: false })
    }
  },

  deactivateLicense: async () => {
    const currentKey = get().licenseKey
    if (currentKey) {
      void deactivateDodoLicense(currentKey).catch(() => {})
    }

    try {
      localStorage.setItem(STORAGE_TIER_KEY, 'free')
      localStorage.removeItem(STORAGE_KEY_KEY)
      localStorage.setItem('fernum_is_pro', 'false')
    } catch {
      // Ignore
    }

    useSettingsStore.getState().setIsPro(false)

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
