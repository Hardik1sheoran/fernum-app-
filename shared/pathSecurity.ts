import path from 'node:path'

export function normalizeWindowsPath(filePath: string): string | null {
  if (!filePath || !path.win32.isAbsolute(filePath)) return null
  return path.win32.resolve(filePath).replace(/[\\/]+$/, '').toLowerCase()
}

/** True only for a descendant of one of the supplied roots; roots themselves are never allowed. */
export function isWithinAllowedCleanupRoot(targetPath: string, allowedRoots: string[]): boolean {
  const target = normalizeWindowsPath(targetPath)
  if (!target) return false

  return allowedRoots.some((rootPath) => {
    const root = normalizeWindowsPath(rootPath)
    return Boolean(root && target.startsWith(`${root}\\`))
  })
}

export function getAllowedCleanupRoots(): string[] {
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.PROGRAMDATA || 'C:\\ProgramData',
  ].filter((root): root is string => Boolean(root))
  return roots.filter((root) => Boolean(normalizeWindowsPath(root)))
}

/**
 * System path protection utilities.
 * Validates that critical OS root paths are guarded from accidental deletion.
 */
export function isProtectedSystemPath(filePath: string): boolean {
  const normalized = normalizeWindowsPath(filePath)
  if (!normalized) return true
  // Drive roots: "c:", "d:", etc.
  if (/^[a-z]:$/i.test(normalized)) {
    return true
  }

  const protectedRoots = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
  ]

  for (const root of protectedRoots) {
    if (normalized === root || normalized.startsWith(`${root}\\`)) return true
  }

  if (
    normalized === 'c:\\programdata' ||
    normalized === 'c:\\users' ||
    normalized.endsWith('\\system volume information') ||
    normalized.endsWith('\\$recycle.bin')
  ) {
    return true
  }

  return false
}
