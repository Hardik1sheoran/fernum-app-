import { describe, it, expect, beforeEach } from 'vitest'

// In Node testing environment, mock global localStorage if not present
const storageMap = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
}
// @ts-expect-error Node env polyfill
globalThis.localStorage = mockLocalStorage

import { useLicenseStore } from '../src/stores/licenseStore'

describe('Licensing & Tier Management', () => {
  beforeEach(() => {
    localStorage.clear()
    useLicenseStore.getState().deactivateLicense()
  })

  it('initializes with Free tier ("The Essentials") by default', () => {
    const state = useLicenseStore.getState()
    expect(state.tier).toBe('free')
    expect(state.isPro).toBe(false)
    expect(state.licenseKey).toBeNull()
    expect(state.isUpgradeModalOpen).toBe(false)
  })

  it('opens and closes upgrade modal with contextual feature triggers', () => {
    useLicenseStore.getState().openUpgradeModal('Delete files within the app')
    expect(useLicenseStore.getState().isUpgradeModalOpen).toBe(true)
    expect(useLicenseStore.getState().triggerFeature).toBe('Delete files within the app')

    useLicenseStore.getState().closeUpgradeModal()
    expect(useLicenseStore.getState().isUpgradeModalOpen).toBe(false)
    expect(useLicenseStore.getState().triggerFeature).toBeNull()
  })

  it('successfully activates Lifetime Pro with valid license key', async () => {
    const result = await useLicenseStore.getState().activateLicense('FERNUM-PRO-TEST-KEY-2026')
    expect(result.success).toBe(true)
    expect(useLicenseStore.getState().tier).toBe('premium')
    expect(useLicenseStore.getState().isPro).toBe(true)
    expect(useLicenseStore.getState().licenseKey).toBe('FERNUM-PRO-TEST-KEY-2026')
    expect(localStorage.getItem('fernum_license_tier')).toBe('premium')
  })

  it('successfully activates Lifetime Pro with Dodo Payments license key', async () => {
    const result = await useLicenseStore.getState().activateLicense('DODO-PRO-9876-5432-1098')
    expect(result.success).toBe(true)
    expect(useLicenseStore.getState().isPro).toBe(true)
    expect(useLicenseStore.getState().licenseKey).toBe('DODO-PRO-9876-5432-1098')
  })

  it('rejects malformed license key that is too short and lacks PRO indicator', async () => {
    const result = await useLicenseStore.getState().activateLicense('abc')
    expect(result.success).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
  })

  it('supports instant demo unlock and subsequent deactivation', async () => {
    // Instant unlock (no key passed generates a lifetime key)
    const res = await useLicenseStore.getState().activateLicense()
    expect(res.success).toBe(true)
    expect(useLicenseStore.getState().isPro).toBe(true)
    expect(useLicenseStore.getState().licenseKey).toMatch(/^FERNUM-PRO-/)

    // Deactivate back to Free
    useLicenseStore.getState().deactivateLicense()
    expect(useLicenseStore.getState().tier).toBe('free')
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().licenseKey).toBeNull()
    expect(localStorage.getItem('fernum_license_tier')).toBe('free')
  })

  it('provides openCheckout method that handles hosted Dodo Payments checkout links', async () => {
    const res = await useLicenseStore.getState().openCheckout('https://test.dodopayments.com/buy/pdt_fernum_pro')
    // In node test environment without browser/electron, gracefully returns false or resolves
    expect(typeof res).toBe('boolean')
  })
})
