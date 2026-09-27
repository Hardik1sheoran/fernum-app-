import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

let cachedDeviceId: string | null = null

/**
 * Checks for a device-id.txt file in Electron's userData directory.
 * If it doesn't exist, generates a standard UUID and saves it there.
 * Returns the deviceId string.
 */
export function getOrCreateDeviceId(): string {
  if (cachedDeviceId) {
    return cachedDeviceId
  }

  try {
    const userDataPath = app.getPath('userData')
    const deviceIdPath = path.join(userDataPath, 'device-id.txt')

    if (fs.existsSync(deviceIdPath)) {
      const existing = fs.readFileSync(deviceIdPath, 'utf-8').trim()
      if (existing && existing.length >= 8) {
        cachedDeviceId = existing
        return existing
      }
    }

    // Generate fresh UUID and persist to userData/device-id.txt
    const newId = crypto.randomUUID()
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    fs.writeFileSync(deviceIdPath, newId, 'utf-8')
    cachedDeviceId = newId
    return newId
  } catch (err) {
    console.error('[DeviceID] Error reading or writing device-id.txt:', err)
    // Non-fatal fallback: generate session UUID
    const fallbackId = crypto.randomUUID()
    cachedDeviceId = fallbackId
    return fallbackId
  }
}
