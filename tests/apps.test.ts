import { describe, it, expect } from 'vitest'
import {
  formatInstallDate,
  slugifyAppName,
  parseRegistryApps,
  extractKeywords,
  isResidueMatch,
} from '../shared/appsUtils'
import { isProtectedSystemPath, isWithinAllowedCleanupRoot } from '../shared/pathSecurity'
import { parseUninstallCommand, launchNativeUninstaller } from '../electron/ipc/apps'

describe('Phase 4: Apps Uninstaller & Leftover Cleaner', () => {
  it('formats raw Windows registry date strings to ISO YYYY-MM-DD', () => {
    expect(formatInstallDate('20260827')).toBe('2026-08-27')
    expect(formatInstallDate('20251201')).toBe('2025-12-01')
    expect(formatInstallDate(null)).toBeUndefined()
    expect(formatInstallDate('')).toBeUndefined()
    expect(formatInstallDate('already-formatted')).toBe('already-formatted')
  })

  it('slugifies application names into clean IDs', () => {
    expect(slugifyAppName('Google Chrome')).toBe('google-chrome')
    expect(slugifyAppName('Visual Studio Code (x64)')).toBe('visual-studio-code-x64')
    expect(slugifyAppName('  Slack!  ')).toBe('slack')
  })

  it('parses raw PowerShell registry output and deduplicates applications', () => {
    const sampleOutput = JSON.stringify([
      {
        PSChildName: '{12345678-1234-1234-1234-123456789abc}',
        DisplayName: 'Slack',
        DisplayVersion: '4.39.88',
        Publisher: 'Slack Technologies',
        InstallDate: '20260120',
        EstimatedSize: 560000, // in KB
        InstallLocation: 'C:\\Users\\User\\AppData\\Local\\slack',
        UninstallString: '"C:\\Users\\User\\AppData\\Local\\slack\\Update.exe" --uninstall',
      },
      {
        DisplayName: 'Slack', // Duplicate entry in 32-bit registry without size
        DisplayVersion: '4.39.88',
        Publisher: 'Slack Technologies',
        InstallDate: '20260120',
        EstimatedSize: null,
        InstallLocation: null,
        UninstallString: null,
      },
      {
        DisplayName: 'Docker Desktop',
        DisplayVersion: '4.88.1',
        Publisher: 'Docker Inc.',
        InstallDate: null,
        EstimatedSize: 3582951, // in KB
        InstallLocation: 'C:\\Program Files\\Docker\\Docker',
        UninstallString: '"C:\\Program Files\\Docker\\Docker\\Docker Desktop Installer.exe" "uninstall"',
      },
    ])

    const apps = parseRegistryApps(sampleOutput)
    expect(apps).toHaveLength(2)

    // Largest size first: Docker Desktop (3.5 GB) > Slack (560 MB)
    expect(apps[0].name).toBe('Docker Desktop')
    expect(apps[0].estimatedSizeBytes).toBe(3582951 * 1024)
    expect(apps[1].name).toBe('Slack')
    expect(apps[1].estimatedSizeBytes).toBe(560000 * 1024)
    expect(apps[1].installDate).toBe('2026-01-20')
    expect(apps[1].id).toBe('registry:{12345678-1234-1234-1234-123456789abc}')
  })

  it('extracts search keywords from app name and publisher while excluding stop words', () => {
    const keywords = extractKeywords('Docker Desktop for Windows', 'Docker Inc.')
    expect(keywords).toContain('docker')
    expect(keywords).not.toContain('desktop')
    expect(keywords).not.toContain('for')
    expect(keywords).not.toContain('windows')
    expect(keywords).not.toContain('inc')
  })

  it('matches candidate residue directory names correctly', () => {
    const keywords = ['docker']
    expect(isResidueMatch('Docker', keywords)).toBe(true)
    expect(isResidueMatch('docker-desktop', keywords)).toBe(true)
    expect(isResidueMatch('docker_cli', keywords)).toBe(true)
    expect(isResidueMatch('Google', keywords)).toBe(false)
    expect(isResidueMatch('Microsoft', keywords)).toBe(false)
  })

  it('strictly protects Windows root and system folders from being treated as deletable', () => {
    expect(isProtectedSystemPath('C:\\Windows')).toBe(true)
    expect(isProtectedSystemPath('C:\\Program Files')).toBe(true)
    expect(isProtectedSystemPath('C:\\ProgramData')).toBe(true)
    expect(isProtectedSystemPath('C:\\Users')).toBe(true)
    expect(isProtectedSystemPath('C:\\')).toBe(true)
    expect(isProtectedSystemPath('C:\\$Recycle.Bin')).toBe(true)
    // Non-protected app subdirectory
    expect(isProtectedSystemPath('C:\\Users\\User\\AppData\\Local\\Slack')).toBe(false)
    expect(isProtectedSystemPath('C:\\ProgramData\\Docker')).toBe(false)
    expect(isProtectedSystemPath('C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe(true)
    expect(isProtectedSystemPath('C:\\Program Files\\App\\uninstall.exe')).toBe(true)
  })

  it('allows cleanup only below declared roots after normalizing dot segments', () => {
    const roots = ['C:\\Users\\User\\AppData\\Local', 'C:\\ProgramData']
    expect(isWithinAllowedCleanupRoot('C:\\Users\\User\\AppData\\Local\\Slack\\Cache', roots)).toBe(true)
    expect(isWithinAllowedCleanupRoot('C:\\Users\\User\\AppData\\Local\\Slack\\..\\..\\..\\Documents', roots)).toBe(false)
    expect(isWithinAllowedCleanupRoot('C:\\Windows\\System32\\drivers', roots)).toBe(false)
    expect(isWithinAllowedCleanupRoot('C:\\ProgramData', roots)).toBe(false)
  })

  it('accepts only safe registry uninstall command forms', () => {
    expect(parseUninstallCommand('MsiExec.exe /I{12345678-1234-1234-1234-123456789abc}')).toEqual({
      filePath: 'msiexec.exe',
      args: ['/x', '{12345678-1234-1234-1234-123456789abc}'],
    })
    expect(parseUninstallCommand('MsiExec.exe /X{12345678-1234-1234-1234-123456789abc} & calc.exe')).toBeNull()
  })

  it('safely parses winget uninstall command lines', () => {
    expect(
      parseUninstallCommand(
        'winget uninstall --product-code BurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe'
      )
    ).toEqual({
      filePath: 'winget.exe',
      args: [
        'uninstall',
        '--product-code',
        'BurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe',
      ],
    })
  })

  it('gracefully handles launching uninstaller when no command is registered', async () => {
    const res = await launchNativeUninstaller({
      id: 'test-app',
      name: 'Sample App Without Uninstaller',
    })
    expect(res.success).toBe(false)
    expect(res.message).toContain('No uninstaller is registered')
  })

  it('rejects uninstaller commands containing command chaining or illegal characters', async () => {
    const res = await launchNativeUninstaller({
      id: 'test-app',
      name: 'Malicious App',
      uninstallString: 'cmd.exe /c calc.exe & notepad.exe',
    })
    expect(res.success).toBe(false)
    expect(res.message).toContain('could not be parsed safely')
  })
})
