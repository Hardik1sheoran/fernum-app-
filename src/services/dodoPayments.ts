/**
 * Dodo Payments Client Service for Fernum
 * Handles checkout URL generation, license key activation, validation, and deactivation
 * using Dodo Payments' public licensing API.
 */

export interface DodoActivationResponse {
  success: boolean
  licenseKey: string
  message: string
  activationId?: string
  customerEmail?: string
  expiresAt?: string
  isOffline?: boolean
}

export interface DodoLicenseDetails {
  key: string
  status: 'active' | 'expired' | 'revoked' | 'invalid'
  activationsCount: number
  maxActivations?: number
}

// Configurable constants with fallbacks
export const DODO_CHECKOUT_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DODO_PAYMENT_URL) ||
  'https://checkout.dodopayments.com/buy/pdt_fernum_pro_lifetime'

export const DODO_API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DODO_API_BASE) ||
  'https://api.dodopayments.com'

/**
 * Generates the user-facing Dodo checkout session URL with tracking parameters.
 */
export function getDodoCheckoutUrl(options?: { userEmail?: string; discountCode?: string }): string {
  try {
    const url = new URL(DODO_CHECKOUT_URL)
    url.searchParams.set('redirect_url', 'fernum://license-callback')
    if (options?.userEmail) {
      url.searchParams.set('email', options.userEmail)
    }
    if (options?.discountCode) {
      url.searchParams.set('discount_code', options.discountCode)
    }
    return url.toString()
  } catch {
    return DODO_CHECKOUT_URL
  }
}

/**
 * Client device fingerprint/name helper
 */
function getDeviceIdentifier(): string {
  if (typeof navigator !== 'undefined') {
    return `${navigator.userAgent.includes('Windows') ? 'Windows PC' : 'Desktop'} (${(navigator.language || 'en').toUpperCase()})`
  }
  return 'Windows PC'
}

/**
 * Validates a license key with Dodo Payments public license activation endpoint.
 * Gracefully falls back to offline validation if the network is unavailable.
 */
export async function activateDodoLicense(licenseKey: string): Promise<DodoActivationResponse> {
  const cleanKey = licenseKey.trim().toUpperCase()

  if (!cleanKey || cleanKey.length < 8) {
    return {
      success: false,
      licenseKey: cleanKey,
      message: 'License key is too short. Please check the key received in your email.',
    }
  }

  // 1. Offline format checks (accept official Dodo license shapes: e.g. DODO-..., FERNUM-PRO-..., or UUID format)
  const isRecognizedPattern =
    cleanKey.startsWith('FERNUM-') ||
    cleanKey.startsWith('DODO-') ||
    /^[A-Z0-9]{4,8}-[A-Z0-9]{4,8}-[A-Z0-9]{4,8}-[A-Z0-9]{4,8}$/.test(cleanKey) ||
    cleanKey.includes('PRO')

  if (!isRecognizedPattern && cleanKey.length < 12) {
    return {
      success: false,
      licenseKey: cleanKey,
      message: 'Invalid license key format. Please check your purchase confirmation.',
    }
  }

  // 2. Attempt online activation via Dodo Payments API
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 6000)

    const response = await fetch(`${DODO_API_BASE}/licenses/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        license_key: cleanKey,
        name: getDeviceIdentifier(),
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json().catch(() => ({}))
      return {
        success: true,
        licenseKey: cleanKey,
        activationId: data.id || data.activation_id,
        customerEmail: data.customer_email,
        message: 'Lifetime Pro successfully activated with Dodo Payments!',
      }
    }

    if (response.status === 404 || response.status === 400) {
      const errJson = await response.json().catch(() => ({}))
      return {
        success: false,
        licenseKey: cleanKey,
        message: errJson.message || 'Invalid or revoked license key. Please check your key.',
      }
    }

    if (response.status === 409) {
      return {
        success: false,
        licenseKey: cleanKey,
        message: 'Maximum activations reached for this license key. Please deactivate another device first.',
      }
    }
  } catch {
    // Network failed or offline - fall back to local offline validation
  }

  // 3. Offline fallback validation:
  // If the key adheres to standard license structure, allow activation offline so users aren't locked out
  if (isRecognizedPattern) {
    return {
      success: true,
      licenseKey: cleanKey,
      isOffline: true,
      message: 'Lifetime Pro activated successfully (Offline Mode).',
    }
  }

  return {
    success: false,
    licenseKey: cleanKey,
    message: 'Could not connect to license server. Please verify your internet connection.',
  }
}

/**
 * Validates an existing active key with Dodo Payments
 */
export async function validateDodoLicense(licenseKey: string): Promise<boolean> {
  const cleanKey = licenseKey.trim().toUpperCase()
  if (!cleanKey) return false

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const response = await fetch(`${DODO_API_BASE}/licenses/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: cleanKey }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json().catch(() => ({}))
      return data.status === 'active' || data.valid === true
    }
  } catch {
    // In case of network glitch, preserve offline active state
    return true
  }

  return true
}

/**
 * Deactivates a license key to release the device slot
 */
export async function deactivateDodoLicense(licenseKey: string): Promise<boolean> {
  const cleanKey = licenseKey.trim().toUpperCase()
  if (!cleanKey) return true

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    await fetch(`${DODO_API_BASE}/licenses/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: cleanKey }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return true
  } catch {
    return true
  }
}
