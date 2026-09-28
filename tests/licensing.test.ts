import { describe, it, expect, beforeEach, vi } from 'vitest'

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

import {
  useLicenseStore,
  STORAGE_LICENSE_CACHE_KEY,
  STORAGE_DEVICE_ID,
  STORAGE_TIER_KEY,
  getValidCachedLicense,
} from '../src/stores/licenseStore'

describe('Licensing Security & Verification Invariants', () => {
  beforeEach(() => {
    storageMap.clear()
    useLicenseStore.getState().deactivateLicense()
    vi.restoreAllMocks()
  })

  it('initializes with Free tier ("The Essentials") by default with isPro=false', () => {
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

  it('proves license CANNOT become true on network error / offline when never confirmed by server', async () => {
    // Mock fetch to simulate offline / network error
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (offline)'))

    const result = await useLicenseStore.getState().checkDeviceLicense()
    expect(result.licensed).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
  })

  it('proves license CANNOT become true on server timeout', async () => {
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr)

    const result = await useLicenseStore.getState().checkDeviceLicense()
    expect(result.licensed).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
  })

  it('proves license CANNOT become true when server returns 500 error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    } as unknown as Response)

    const result = await useLicenseStore.getState().checkDeviceLicense()
    expect(result.licensed).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
  })

  it('proves failed create-checkout call NEVER unlocks Pro', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Bad Gateway from payment gateway' }),
    } as unknown as Response)

    const res = await useLicenseStore.getState().buyLicense('test@example.com', 'Tester')
    expect(res.success).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
  })

  it('proves arbitrary key strings or mock keys CANNOT unlock Pro', async () => {
    const res = await useLicenseStore.getState().activateLicense('FERNUM-PRO-TEST-KEY-2026')
    expect(res.success).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')

    const res2 = await useLicenseStore.getState().activateOnlineLicense('DODO-PRO-1234')
    expect(res2.success).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
  })

  it('unlocks Pro ONLY when server GET /api/license/{deviceId} returns licensed: true', async () => {
    const deviceId = await useLicenseStore.getState().initDeviceId()
    expect(deviceId).toBeTruthy()

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes(`/api/license/${deviceId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deviceId,
            licensed: true,
            updatedAt: new Date().toISOString(),
          }),
        } as unknown as Response
      }
      return { ok: false, status: 404 } as unknown as Response
    })

    const result = await useLicenseStore.getState().checkDeviceLicense()
    expect(result.licensed).toBe(true)
    expect(useLicenseStore.getState().isPro).toBe(true)
    expect(useLicenseStore.getState().tier).toBe('premium')
    expect(localStorage.getItem(STORAGE_TIER_KEY)).toBe('premium')
  })

  it('revokes Pro immediately when server returns licensed: false', async () => {
    const deviceId = await useLicenseStore.getState().initDeviceId()

    // 1. First server confirms licensed: true
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deviceId, licensed: true }),
    } as unknown as Response)

    await useLicenseStore.getState().checkDeviceLicense()
    expect(useLicenseStore.getState().isPro).toBe(true)

    // 2. Next server check returns licensed: false
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deviceId, licensed: false }),
    } as unknown as Response)

    const secondResult = await useLicenseStore.getState().checkDeviceLicense()
    expect(secondResult.licensed).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
    expect(localStorage.getItem(STORAGE_LICENSE_CACHE_KEY)).toBeNull()
  })

  it('trusts cached license during offline grace period ONLY for same confirmed deviceId', async () => {
    const testDeviceId = 'device-confirmed-uuid-111'
    localStorage.setItem(STORAGE_DEVICE_ID, testDeviceId)
    useLicenseStore.setState({ deviceId: testDeviceId })

    // Simulate prior server confirmation
    const cacheData = {
      deviceId: testDeviceId,
      licensed: true,
      confirmedAt: Date.now() - 3600 * 1000, // 1 hour ago
    }
    localStorage.setItem(STORAGE_LICENSE_CACHE_KEY, JSON.stringify(cacheData))

    // Confirm validator approves
    expect(getValidCachedLicense(testDeviceId)).toBe(true)

    // Network is offline
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network unavailable'))

    const res = await useLicenseStore.getState().checkDeviceLicense()
    expect(res.licensed).toBe(true)
    expect(useLicenseStore.getState().isPro).toBe(true)
    expect(useLicenseStore.getState().tier).toBe('premium')
  })

  it('rejects cached license if deviceId does NOT match (different PC)', async () => {
    const otherPcDeviceId = 'other-pc-uuid-999'
    const thisPcDeviceId = 'this-pc-uuid-000'
    localStorage.setItem(STORAGE_DEVICE_ID, thisPcDeviceId)
    useLicenseStore.setState({ deviceId: thisPcDeviceId })

    // Cached license belongs to a different PC
    const cacheData = {
      deviceId: otherPcDeviceId,
      licensed: true,
      confirmedAt: Date.now() - 1000,
    }
    localStorage.setItem(STORAGE_LICENSE_CACHE_KEY, JSON.stringify(cacheData))

    // Validation must fail
    expect(getValidCachedLicense(thisPcDeviceId)).toBe(false)

    // Offline check must NOT unlock
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'))
    const res = await useLicenseStore.getState().checkDeviceLicense()
    expect(res.licensed).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
  })

  it('rejects cached license if grace period has expired', async () => {
    const testDeviceId = 'device-expired-uuid'
    localStorage.setItem(STORAGE_DEVICE_ID, testDeviceId)
    useLicenseStore.setState({ deviceId: testDeviceId })

    // Confirmation was 10 days ago (grace period is 7 days)
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
    const cacheData = {
      deviceId: testDeviceId,
      licensed: true,
      confirmedAt: tenDaysAgo,
    }
    localStorage.setItem(STORAGE_LICENSE_CACHE_KEY, JSON.stringify(cacheData))

    expect(getValidCachedLicense(testDeviceId)).toBe(false)

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'))
    const res = await useLicenseStore.getState().checkDeviceLicense()
    expect(res.licensed).toBe(false)
    expect(useLicenseStore.getState().isPro).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
  })
})
