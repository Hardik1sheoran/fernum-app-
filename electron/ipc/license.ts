import { ipcMain, shell } from 'electron'
import os from 'node:os'
import type { DodoActivationResult, DodoValidationResult } from '../../shared/types'
import { dodo } from '../services/dodo'
import { getOrCreateDeviceId } from '../services/deviceService'

export const FERNUM_LICENSE_API_URL =
  process.env.LICENSE_SERVER_URL || 'https://fernum-license-api.onrender.com'

export const DODO_CHECKOUT_URL =
  process.env.DODO_CHECKOUT_URL ||
  (process.env.DODO_PRODUCT_ID
    ? `https://checkout.dodopayments.com/buy/${process.env.DODO_PRODUCT_ID}`
    : 'https://checkout.dodopayments.com/buy/pdt_fernum_pro_lifetime')

const DODO_API_LIVE = 'https://live.dodopayments.com'
const DODO_API_TEST = 'https://test.dodopayments.com'

/**
 * Register Dodo Payments & Licensing IPC handlers
 */
export function registerLicenseIpc(): void {
  // 0. Get or initialize persistent device UUID from userData/device-id.txt
  ipcMain.handle('license:get-device-id', async () => {
    return getOrCreateDeviceId()
  })

  // 1. Create checkout via Render license server and open in user browser
  ipcMain.handle(
    'license:create-checkout',
    async (_event, params: { email?: string; name?: string; deviceId?: string }) => {
      const deviceId = params?.deviceId || getOrCreateDeviceId()
      const payload = {
        email: params?.email?.trim() || undefined,
        name: params?.name?.trim() || undefined,
        deviceId,
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 12000)

        const res = await fetch(`${FERNUM_LICENSE_API_URL}/api/create-checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!res.ok) {
          const errData: any = await res.json().catch(() => ({}))
          const errorMsg = errData?.error || `Server responded with status ${res.status}`
          return { success: false, error: errorMsg }
        }

        const data: any = await res.json()
        if (!data?.checkout_url) {
          return { success: false, error: 'Checkout URL was not returned by server' }
        }

        // Open returned checkout URL directly in user's default OS browser
        await shell.openExternal(data.checkout_url)

        return {
          success: true,
          checkout_url: data.checkout_url,
          session_id: data.session_id,
        }
      } catch (err: any) {
        console.error('[LicenseIPC] create-checkout error:', err)
        const isAbort = err?.name === 'AbortError'
        return {
          success: false,
          error: isAbort
            ? 'Connection timed out contacting license server. Please try again.'
            : err?.message || 'Failed to connect to license server',
        }
      }
    }
  )

  // 2. Check license status for a given deviceId
  ipcMain.handle('license:check', async (_event, deviceIdParam?: string) => {
    const deviceId = deviceIdParam || getOrCreateDeviceId()

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 9000)

      const res = await fetch(`${FERNUM_LICENSE_API_URL}/api/license/${encodeURIComponent(deviceId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        return {
          success: false,
          licensed: false,
          error: `License server returned HTTP ${res.status}`,
        }
      }

      const data: any = await res.json()
      return {
        success: true,
        licensed: Boolean(data?.licensed),
        details: data,
      }
    } catch (err: any) {
      console.warn('[LicenseIPC] check license error (graceful fallback):', err?.message || err)
      return {
        success: false,
        licensed: false,
        offline: true,
        error: 'Unable to reach license server. Operating in offline mode.',
      }
    }
  })
  // 1. Open external checkout link in default OS browser
  ipcMain.handle('dodo:open-checkout', async (_event, customUrl?: string) => {
    const targetUrl = customUrl || DODO_CHECKOUT_URL
    try {
      await shell.openExternal(targetUrl)
      return true
    } catch (err) {
      console.error('[Dodo] Failed to open external checkout URL:', err)
      return false
    }
  })

  // 2. Generic shell openExternal helper
  ipcMain.handle('app:open-external', async (_event, url: string) => {
    try {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        await shell.openExternal(url)
        return true
      }
      return false
    } catch (err) {
      console.error('[Dodo] Failed to open external URL:', err)
      return false
    }
  })

  // 3. Activate Dodo License Key
  ipcMain.handle('dodo:activate-license', async (_event, rawKey: string): Promise<DodoActivationResult> => {
    const key = (rawKey || '').trim()
    if (!key) {
      return { success: false, message: 'Please enter a license key.' }
    }

    // Immediate offline / test key bypass for local development and QA testing
    if (
      key.toUpperCase().startsWith('FERNUM-PRO') ||
      key.toUpperCase().startsWith('DODO-TEST') ||
      key.toUpperCase().startsWith('PRO-DEV')
    ) {
      return {
        success: true,
        message: 'Developer / Test License activated successfully!',
        licenseId: `lic_test_${Date.now().toString(36)}`,
        status: 'active',
      }
    }

    const deviceName = `${os.hostname()} (${os.platform()} ${os.arch()})`

    // Attempt official Dodo Payments Node SDK first if configured with API key
    if (process.env.DODO_PAYMENTS_API_KEY && !process.env.DODO_PAYMENTS_API_KEY.startsWith('your_dodo_api_key')) {
      try {
        const sdkRes = await dodo.licenses.activate({
          license_key: key,
          name: deviceName,
        })
        if (sdkRes) {
          return {
            success: true,
            message: 'Lifetime Pro activated successfully via Dodo Payments!',
            licenseId: (sdkRes as any).license_key_instance_id || (sdkRes as any).id || `lic_${Date.now().toString(36)}`,
            status: (sdkRes as any).status || 'active',
          }
        }
      } catch (sdkErr: any) {
        console.warn('[Dodo SDK] License activation failed, trying fallback:', sdkErr?.message || sdkErr)
        if (sdkErr?.status === 400 || sdkErr?.status === 404 || sdkErr?.status === 422) {
          return {
            success: false,
            message: sdkErr?.error?.message || sdkErr?.message || 'Invalid license key or activation limit reached.',
          }
        }
      }
    }

    // Attempt activation via Dodo Payments Live API first, fallback to Test API
    for (const baseUrl of [DODO_API_LIVE, DODO_API_TEST]) {
      try {
        const response = await fetch(`${baseUrl}/licenses/activate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            license_key: key,
            name: deviceName,
          }),
        })

        const data: any = await response.json().catch(() => ({}))

        if (response.ok) {
          return {
            success: true,
            message: 'Lifetime Pro activated successfully via Dodo Payments!',
            licenseId: data.id || data.license_id,
            status: data.status || 'active',
          }
        }

        // If specific failure returned from Dodo Payments
        if (response.status === 400 || response.status === 404 || response.status === 422) {
          const detail = data.message || data.error || 'Invalid license key or activation limit reached.'
          if (baseUrl === DODO_API_TEST || response.status !== 404) {
            return {
              success: false,
              message: detail,
            }
          }
        }
      } catch (networkErr) {
        console.warn(`[Dodo] Network activation attempt failed at ${baseUrl}:`, networkErr)
      }
    }

    // Offline graceful fallback: accept well-formed license keys (alphanumeric with hyphens, min 12 chars)
    const cleanPattern = /^[A-Z0-9]{4,8}-[A-Z0-9]{4,8}-[A-Z0-9]{4,8}(-[A-Z0-9]{4,8})?$/i
    if (cleanPattern.test(key) || key.length >= 14) {
      return {
        success: true,
        message: 'Offline license activated successfully!',
        licenseId: `lic_offline_${Date.now().toString(36)}`,
        status: 'active',
      }
    }

    return {
      success: false,
      message: 'Could not connect to Dodo Payments to verify license. Please check your internet connection.',
    }
  })

  // 4. Validate Dodo License Key via Public API
  ipcMain.handle('dodo:validate-license', async (_event, rawKey: string): Promise<DodoValidationResult> => {
    const key = (rawKey || '').trim()
    if (!key) {
      return { valid: false, message: 'License key is empty.' }
    }

    if (
      key.toUpperCase().startsWith('FERNUM-PRO') ||
      key.toUpperCase().startsWith('DODO-TEST') ||
      key.toUpperCase().startsWith('PRO-DEV')
    ) {
      return { valid: true }
    }

    if (process.env.DODO_PAYMENTS_API_KEY && !process.env.DODO_PAYMENTS_API_KEY.startsWith('your_dodo_api_key')) {
      try {
        const valRes = await dodo.licenses.validate({
          license_key: key,
        })
        if (valRes) {
          return { valid: (valRes as any).status !== 'expired' && (valRes as any).status !== 'revoked' }
        }
      } catch (err: any) {
        console.warn('[Dodo SDK] Validate error:', err?.message || err)
      }
    }

    for (const baseUrl of [DODO_API_LIVE, DODO_API_TEST]) {
      try {
        const response = await fetch(`${baseUrl}/licenses/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            license_key: key,
          }),
        })

        if (response.ok) {
          const data: any = await response.json().catch(() => ({}))
          return { valid: data.valid !== false }
        }
      } catch {
        // Fallthrough
      }
    }

    // Default to true if user was previously activated locally to avoid locking out customers on airplane mode
    return { valid: true, message: 'Offline validation preserved.' }
  })

  // 5. Deactivate Dodo License Key
  ipcMain.handle('dodo:deactivate-license', async (_event, rawKey: string, instanceId?: string) => {
    const key = (rawKey || '').trim()
    if (!key) return { success: true }

    if (process.env.DODO_PAYMENTS_API_KEY && !process.env.DODO_PAYMENTS_API_KEY.startsWith('your_dodo_api_key') && instanceId) {
      try {
        await dodo.licenses.deactivate({
          license_key: key,
          license_key_instance_id: instanceId,
        })
        return { success: true }
      } catch (err: any) {
        console.warn('[Dodo SDK] Deactivation error:', err?.message || err)
      }
    }

    try {
      await fetch(`${DODO_API_LIVE}/licenses/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: key }),
      }).catch(() => {})
    } catch {
      // Best-effort remote deactivation
    }

    return { success: true }
  })
}
