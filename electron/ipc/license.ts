import { ipcMain, shell } from 'electron'
import type { DodoActivationResult, DodoValidationResult } from '../../shared/types'
import { getOrCreateDeviceId } from '../services/deviceService'

export const FERNUM_LICENSE_API_URL =
  process.env.LICENSE_SERVER_URL || 'https://fernum-license-api.onrender.com'

export const DODO_CHECKOUT_URL =
  process.env.DODO_CHECKOUT_URL ||
  (process.env.DODO_PRODUCT_ID
    ? `https://checkout.dodopayments.com/buy/${process.env.DODO_PRODUCT_ID}`
    : 'https://checkout.dodopayments.com/buy/pdt_fernum_pro_lifetime')

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
        console.error('[LicenseIPC] create-checkout error:', err?.message || err)
        const isAbort = err?.name === 'AbortError'
        return {
          success: false,
          error: isAbort
            ? 'Connection timed out contacting license server. Please try again.'
            : 'Unable to reach checkout server. Please check your internet connection.',
        }
      }
    }
  )

  // 2. Check license status for a given deviceId via Render backend
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
          error: res.status === 429 ? 'Too many verification attempts. Please wait.' : `License server returned HTTP ${res.status}`,
        }
      }

      const data: any = await res.json()
      return {
        success: true,
        licensed: Boolean(data?.licensed),
      }
    } catch (err: any) {
      console.warn('[LicenseIPC] check license error:', err?.message || err)
      return {
        success: false,
        licensed: false,
        offline: true,
        error: 'Unable to reach license server. Operating in offline mode.',
      }
    }
  })

  // Open external checkout link in default OS browser
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

  // Generic shell openExternal helper
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

  // Deprecated legacy manual key activation IPC - mock keys removed
  ipcMain.handle('dodo:activate-license', async (): Promise<DodoActivationResult> => {
    return {
      success: false,
      message: 'License activation is managed automatically via device ID after checkout.',
    }
  })

  // Deprecated legacy validation IPC
  ipcMain.handle('dodo:validate-license', async (): Promise<DodoValidationResult> => {
    return { valid: false, message: 'Please use device license verification.' }
  })

  // Deprecated legacy deactivation IPC
  ipcMain.handle('dodo:deactivate-license', async () => {
    return { success: true }
  })
}
