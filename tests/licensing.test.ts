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

  it('successfully activates Lifetime Pro with valid license key', () => {
    const result = useLicenseStore.getState().activateLicense('FERNUM-PRO-TEST-KEY-2026')
    expect(result.success).toBe(true)
    expect(useLicenseStore.getState().tier).toBe('premium')
    expect(useLicenseStore.getState().isPro).toBe(true)
    expect(useLicenseStore.getState().licenseKey).toBe('FERNUM-PRO-TEST-KEY-2026')
    expect(localStorage.getItem('fernum_license_tier')).toBe('premium')
  })

  it('rejects malformed license key that is too short and lacks PRO indicator', () => {
    const result = useLicenseStore.getState().activateLicense('abc')
    expect(result.success).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
  })

  it('supports instant demo unlock and subsequent deactivation', () => {
    // Instant unlock (no key passed generates a lifetime key)
    const res = useLicenseStore.getState().activateLicense()
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

  it('generates a valid Dodo checkout URL with redirect parameters', async () => {
    const { getDodoCheckoutUrl } = await import('../src/services/dodoPayments')
    const url = getDodoCheckoutUrl({ userEmail: 'test@example.com', discountCode: 'EARLYBIRD' })
    expect(url).toContain('dodopayments.com')
    expect(url).toContain('email=test%40example.com')
    expect(url).toContain('discount_code=EARLYBIRD')
    expect(url).toContain('redirect_url=fernum%3A%2F%2Flicense-callback')
  })

  it('activates Pro via online Dodo license flow with recognized format', async () => {
    const res = await useLicenseStore.getState().activateOnlineLicense('DODO-PRO-9876-5432-1000')
    expect(res.success).toBe(true)
    expect(useLicenseStore.getState().isPro).toBe(true)
    expect(useLicenseStore.getState().licenseKey).toBe('DODO-PRO-9876-5432-1000')
  })

  it('rejects short or empty key in Dodo license activation', async () => {
    const res = await useLicenseStore.getState().activateOnlineLicense('short')
    expect(res.success).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
  })
})
