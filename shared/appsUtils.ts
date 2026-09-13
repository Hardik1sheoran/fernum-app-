import type { InstalledApp } from './types'

export interface RawRegistryApp {
  PSChildName?: string | null
  DisplayName?: string | null
  DisplayVersion?: string | null
  Publisher?: string | null
  InstallDate?: string | null
  EstimatedSize?: number | null
  InstallLocation?: string | null
  UninstallString?: string | null
}

/**
 * Normalizes raw date strings (e.g. "20260827") into "YYYY-MM-DD" format.
 */
export function formatInstallDate(rawDate?: string | null): string | undefined {
  if (!rawDate) return undefined
  const cleaned = String(rawDate).trim()
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`
  }
  return cleaned
}

/**
 * Creates a clean unique slug from application name.
 */
export function slugifyAppName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown-app'
  )
}

/**
 * Parses and deduplicates raw registry entries from PowerShell query output.
 */
export function parseRegistryApps(rawJson: string): InstalledApp[] {
  let parsed: RawRegistryApp[] | RawRegistryApp
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return []
  }

  const list: RawRegistryApp[] = Array.isArray(parsed) ? parsed : [parsed]
  const appMap = new Map<string, InstalledApp>()

  for (const item of list) {
    if (!item.DisplayName || typeof item.DisplayName !== 'string') continue
    const name = item.DisplayName.trim()
    if (!name) continue

    const key = name.toLowerCase()
    const sizeKb =
      typeof item.EstimatedSize === 'number' && item.EstimatedSize > 0 ? item.EstimatedSize : 0
    const estimatedSizeBytes = sizeKb > 0 ? sizeKb * 1024 : undefined

    const existing = appMap.get(key)
    if (existing) {
      // Keep entry with higher information density (size or uninstall command)
      if (!existing.estimatedSizeBytes && estimatedSizeBytes) {
        existing.estimatedSizeBytes = estimatedSizeBytes
      }
      if (!existing.uninstallString && item.UninstallString) {
        existing.uninstallString = item.UninstallString
      }
      if (!existing.installLocation && item.InstallLocation) {
        existing.installLocation = item.InstallLocation
      }
      continue
    }

    appMap.set(key, {
      // Registry key names (usually product GUIDs) remain stable across UI refreshes.
      id: item.PSChildName ? `registry:${String(item.PSChildName).trim()}` : slugifyAppName(name),
      name,
      version: item.DisplayVersion ? String(item.DisplayVersion).trim() : undefined,
      publisher: item.Publisher ? String(item.Publisher).trim() : undefined,
      installDate: formatInstallDate(item.InstallDate),
      installLocation: item.InstallLocation ? String(item.InstallLocation).trim() : undefined,
      uninstallString: item.UninstallString ? String(item.UninstallString).trim() : undefined,
      estimatedSizeBytes,
    })
  }

  // Sort descending by size, then alphabetically by name
  return Array.from(appMap.values()).sort((a, b) => {
    const sizeA = a.estimatedSizeBytes || 0
    const sizeB = b.estimatedSizeBytes || 0
    if (sizeB !== sizeA) return sizeB - sizeA
    return a.name.localeCompare(b.name)
  })
}

/**
 * Extract meaningful search keywords from an app name and publisher.
 */
export function extractKeywords(appName: string, publisher?: string): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'app',
    'application',
    'desktop',
    'client',
    'windows',
    'edition',
    'version',
    'release',
    'software',
    'corporation',
    'inc',
    'ltd',
    'gmbh',
    'llc',
    'community',
  ])

  const tokens: string[] = []

  const clean = (str: string) =>
    str
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 3 && !stopWords.has(t))

  tokens.push(...clean(appName))
  if (publisher) {
    tokens.push(...clean(publisher))
  }

  return Array.from(new Set(tokens))
}

/**
 * Checks if a candidate directory matches the application search tokens.
 */
export function isResidueMatch(folderName: string, keywords: string[]): boolean {
  const lowerFolder = folderName.toLowerCase()
  return keywords.some(
    (kw) =>
      lowerFolder === kw ||
      lowerFolder.startsWith(`${kw}-`) ||
      lowerFolder.startsWith(`${kw}_`) ||
      lowerFolder.endsWith(`-${kw}`)
  )
}
