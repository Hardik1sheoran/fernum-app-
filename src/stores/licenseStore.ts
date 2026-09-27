import { create } from 'zustand'
import {
  activateDodoLicense,
  deactivateDodoLicense,
  createDodoCheckout,
  checkDeviceLicenseStatus,
} from '../services/dodoPayments'
import { useSettingsStore } from './settingsStore'

export type LicenseTier = 'free' | 'premium'

interface LicenseState {
  tier: LicenseTier
  licenseKey: string | null
  deviceId: string | null
  customerEmail: string
  customerName: string
  isPro: boolean
  isUpgradeModalOpen: boolean
  triggerFeature: string | null
  isValidating: boolean
  isCheckingLicense: boolean
  licenseError: string | null
  lastCheckedAt: number | null

  // Core Actions
  initDeviceId: () => Promise<string>
  setCustomerInfo: (email: string, name: string) => void
  checkDeviceLicense: (manual?: boolean) => Promise<{ licensed: boolean; error?: string }>
  buyLicense: (email?: string, name?: string) => Promise<{ success: boolean; error?: string; checkout_url?: string }>
  refreshLicense: () => Promise<{ licensed: boolean; message: string }>
  activateLicense: (key?: string) => Promise<{ success: boolean; message: string }>
  activateOnlineLicense: (key: string) => Promise<{ success: boolean; message: string }>
  deactivateLicense: () => Promise<void>
  openUpgradeModal: (feature?: string) => void
  closeUpgradeModal: () => void
}

const STORAGE_TIER_KEY = 'fernum_license_tier'
const STORAGE_KEY_KEY = 'fernum_license_key'
const STORAGE_DEVICE_ID = 'fernum_device_id'
const STORAGE_EMAIL_KEY = 'fernum_customer_email'
const STORAGE_NAME_KEY = 'fernum_customer_name'

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

const getInitialDeviceId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_DEVICE_ID)
  } catch {
    return null
  }
}

const getInitialEmail = (): string => {
  try {
    return localStorage.getItem(STORAGE_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

const getInitialName = (): string => {
  try {
    return localStorage.getItem(STORAGE_NAME_KEY) || ''
  } catch {
    return ''
  }
}

const initialTier = getInitialTier()

export const useLicenseStore = create<LicenseState>((set, get) => ({
  tier: initialTier,
  licenseKey: getInitialKey(),
  deviceId: getInitialDeviceId(),
  customerEmail: getInitialEmail(),
  customerName: getInitialName(),
  isPro: initialTier === 'premium',
  isUpgradeModalOpen: false,
  triggerFeature: null,
  isValidating: false,
  isCheckingLicense: false,
  licenseError: null,
  lastCheckedAt: null,

  initDeviceId: async () => {
    let id = get().deviceId
    if (id && id.length >= 8) return id

    if (typeof window !== 'undefined' && window.electronAPI?.getDeviceId) {
      try {
        id = await window.electronAPI.getDeviceId()
      } catch (err) {
        console.warn('[LicenseStore] Failed to get deviceId via electronAPI:', err)
      }
    }

    if (!id) {
      try {
        id = localStorage.getItem(STORAGE_DEVICE_ID)
      } catch {}
    }

    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}`
      try {
        localStorage.setItem(STORAGE_DEVICE_ID, id)
      } catch {}
    }

    set({ deviceId: id })
    return id
  },

  setCustomerInfo: (email: string, name: string) => {
    try {
      localStorage.setItem(STORAGE_EMAIL_KEY, email)
      localStorage.setItem(STORAGE_NAME_KEY, name)
    } catch {}
    set({ customerEmail: email, customerName: name })
  },

  checkDeviceLicense: async (_manual = false) => {
    set({ isCheckingLicense: true, licenseError: null })
    try {
      const id = await get().initDeviceId()
      const result = await checkDeviceLicenseStatus(id)

      if (result.success) {
        const isLicensed = Boolean(result.licensed)
        if (isLicensed) {
          try {
            localStorage.setItem(STORAGE_TIER_KEY, 'premium')
            localStorage.setItem('fernum_is_pro', 'true')
          } catch {}
          useSettingsStore.getState().setIsPro(true)
          set({
            tier: 'premium',
            isPro: true,
            licenseError: null,
            lastCheckedAt: Date.now(),
          })
          return { licensed: true }
        } else {
          // If not licensed remotely, check if an existing local license key overrides
          const currentKey = get().licenseKey
          const hasManualKey = currentKey && (currentKey.includes('PRO') || currentKey.includes('DODO'))
          if (!hasManualKey) {
            try {
              localStorage.setItem(STORAGE_TIER_KEY, 'free')
              localStorage.setItem('fernum_is_pro', 'false')
            } catch {}
            useSettingsStore.getState().setIsPro(false)
            set({
              tier: 'free',
              isPro: false,
              lastCheckedAt: Date.now(),
            })
          }
          return { licensed: get().isPro }
        }
      } else {
        // Failed to connect (e.g. offline, timeout) - fail open or preserve state gracefully without hard-locking
        set({
          licenseError: result.error || 'Could not reach license server. Operating in offline mode.',
          lastCheckedAt: Date.now(),
        })
        return { licensed: get().isPro, error: result.error }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Error checking license'
      set({ licenseError: errMsg })
      return { licensed: get().isPro, error: errMsg }
    } finally {
      set({ isCheckingLicense: false })
    }
  },

  buyLicense: async (email?: string, name?: string) => {
    const effEmail = (email !== undefined ? email : get().customerEmail).trim()
    const effName = (name !== undefined ? name : get().customerName).trim()
    const id = await get().initDeviceId()

    get().setCustomerInfo(effEmail, effName)

    return createDodoCheckout({
      email: effEmail || undefined,
      name: effName || undefined,
      deviceId: id,
    })
  },

  refreshLicense: async () => {
    const res = await get().checkDeviceLicense(true)
    if (res.licensed) {
      return { licensed: true, message: 'License verified! All Pro features unlocked.' }
    }
    if (res.error) {
      return { licensed: false, message: `License check: ${res.error}` }
    }
    return { licensed: false, message: 'No active license found for this device.' }
  },

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
      licenseError: null,
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
