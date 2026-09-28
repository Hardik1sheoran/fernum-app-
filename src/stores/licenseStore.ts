import { create } from 'zustand'
import {
  createDodoCheckout,
  checkDeviceLicenseStatus,
} from '../services/dodoPayments'
import { useSettingsStore } from './settingsStore'

export type LicenseTier = 'free' | 'premium'

export interface LicenseServerCache {
  deviceId: string
  licensed: boolean
  confirmedAt: number
}

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

export const STORAGE_TIER_KEY = 'fernum_license_tier'
export const STORAGE_KEY_KEY = 'fernum_license_key'
export const STORAGE_DEVICE_ID = 'fernum_device_id'
export const STORAGE_EMAIL_KEY = 'fernum_customer_email'
export const STORAGE_NAME_KEY = 'fernum_customer_name'
export const STORAGE_LICENSE_CACHE_KEY = 'fernum_license_confirmed_cache'
export const LICENSE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000 // 7 days limited grace period

function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {}
  return null
}

/**
 * Validates whether cached license data was previously confirmed by the server
 * for this exact deviceId and is within the allowed grace period.
 */
export function getValidCachedLicense(deviceId: string | null, maxGraceMs = LICENSE_GRACE_PERIOD_MS): boolean {
  if (!deviceId) return false
  try {
    const storage = getLocalStorage()
    const raw = storage ? storage.getItem(STORAGE_LICENSE_CACHE_KEY) : null
    if (!raw) return false
    const parsed: LicenseServerCache = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return false
    if (parsed.deviceId !== deviceId) return false
    if (parsed.licensed !== true) return false
    const confirmedAt = Number(parsed.confirmedAt)
    if (!confirmedAt || Number.isNaN(confirmedAt)) return false
    const elapsed = Date.now() - confirmedAt
    if (elapsed < 0 || elapsed > maxGraceMs) return false
    return true
  } catch {
    return false
  }
}

const getInitialDeviceId = (): string | null => {
  try {
    return getLocalStorage()?.getItem(STORAGE_DEVICE_ID) || null
  } catch {
    return null
  }
}

const getInitialTier = (): LicenseTier => {
  try {
    const id = getInitialDeviceId()
    if (getValidCachedLicense(id)) {
      return 'premium'
    }
  } catch {
    // LocalStorage unavailable
  }
  return 'free'
}

const getInitialEmail = (): string => {
  try {
    return getLocalStorage()?.getItem(STORAGE_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

const getInitialName = (): string => {
  try {
    return getLocalStorage()?.getItem(STORAGE_NAME_KEY) || ''
  } catch {
    return ''
  }
}

const initialTier = getInitialTier()

export const useLicenseStore = create<LicenseState>((set, get) => ({
  tier: initialTier,
  licenseKey: null,
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
        id = getLocalStorage()?.getItem(STORAGE_DEVICE_ID) || null
      } catch {}
    }

    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}`
      try {
        getLocalStorage()?.setItem(STORAGE_DEVICE_ID, id)
      } catch {}
    }

    set({ deviceId: id })
    return id
  },

  setCustomerInfo: (email: string, name: string) => {
    try {
      getLocalStorage()?.setItem(STORAGE_EMAIL_KEY, email)
      getLocalStorage()?.setItem(STORAGE_NAME_KEY, name)
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
          // Strictly verified: server confirmed licensed: true for this deviceId
          const cacheEntry: LicenseServerCache = {
            deviceId: id,
            licensed: true,
            confirmedAt: Date.now(),
          }
          try {
            getLocalStorage()?.setItem(STORAGE_LICENSE_CACHE_KEY, JSON.stringify(cacheEntry))
            getLocalStorage()?.setItem(STORAGE_TIER_KEY, 'premium')
            getLocalStorage()?.setItem('fernum_is_pro', 'true')
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
          // Server explicitly returned licensed: false! Revoke Pro immediately and clear cache.
          try {
            getLocalStorage()?.removeItem(STORAGE_LICENSE_CACHE_KEY)
            getLocalStorage()?.setItem(STORAGE_TIER_KEY, 'free')
            getLocalStorage()?.setItem('fernum_is_pro', 'false')
          } catch {}
          useSettingsStore.getState().setIsPro(false)
          set({
            tier: 'free',
            isPro: false,
            lastCheckedAt: Date.now(),
          })
          return { licensed: false }
        }
      } else {
        // Failed to connect (network error, timeout, server offline).
        // Fail-open ONLY if previously confirmed by server for this exact deviceId within grace period.
        const hasValidCache = getValidCachedLicense(id)
        if (hasValidCache) {
          useSettingsStore.getState().setIsPro(true)
          set({
            tier: 'premium',
            isPro: true,
            licenseError: result.error || 'Server unreachable. Using verified offline grace period.',
            lastCheckedAt: Date.now(),
          })
          return { licensed: true, error: result.error }
        } else {
          // Never confirmed by server, or expired grace period, or different device: MUST STAY FREE
          try {
            getLocalStorage()?.removeItem(STORAGE_LICENSE_CACHE_KEY)
            getLocalStorage()?.setItem(STORAGE_TIER_KEY, 'free')
            getLocalStorage()?.setItem('fernum_is_pro', 'false')
          } catch {}
          useSettingsStore.getState().setIsPro(false)
          set({
            tier: 'free',
            isPro: false,
            licenseError: result.error || 'Could not reach license server.',
            lastCheckedAt: Date.now(),
          })
          return { licensed: false, error: result.error }
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Error checking license'
      const id = get().deviceId
      const hasValidCache = getValidCachedLicense(id)
      if (hasValidCache) {
        set({ licenseError: errMsg })
        return { licensed: true, error: errMsg }
      }
      set({ tier: 'free', isPro: false, licenseError: errMsg })
      return { licensed: false, error: errMsg }
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

  // Mock / demo key activations removed. Pro only unlocks via server confirmation.
  activateLicense: async () => {
    return {
      success: false,
      message: 'License activation is tied directly to your Device ID. Please click "Refresh License" to verify your status.',
    }
  },

  activateOnlineLicense: async () => {
    return {
      success: false,
      message: 'License activation is tied directly to your Device ID. Please click "Refresh License" to verify your status.',
    }
  },

  deactivateLicense: async () => {
    try {
      localStorage.removeItem(STORAGE_LICENSE_CACHE_KEY)
      localStorage.setItem(STORAGE_TIER_KEY, 'free')
      localStorage.removeItem(STORAGE_KEY_KEY)
      localStorage.setItem('fernum_is_pro', 'false')
    } catch {}

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
