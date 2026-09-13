import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  isAllowedJunkPath,
  inspectDirectoryJunk,
  scanSystemJunk,
} from '../electron/ipc/cleaner'

describe('Phase 7: System Junk & Cache Cleaner', () => {
  const testDir = path.join(os.tmpdir(), 'fernum-cleaner-unit-test')

  beforeEach(async () => {
    await fs.promises.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true })
    } catch {}
  })

  describe('Security Allowlist: isAllowedJunkPath', () => {
    it('blocks critical operating system directories', () => {
      expect(isAllowedJunkPath('C:\\Windows')).toBe(false)
      expect(isAllowedJunkPath('C:\\Windows\\System32')).toBe(false)
      expect(isAllowedJunkPath('C:\\Windows\\System32\\calc.exe')).toBe(false)
      expect(isAllowedJunkPath('C:\\Program Files')).toBe(false)
      expect(isAllowedJunkPath('C:\\Program Files\\Common Files')).toBe(false)
      expect(isAllowedJunkPath('C:\\Program Files (x86)')).toBe(false)
      expect(isAllowedJunkPath('C:\\Users')).toBe(false)
    })

    it('blocks the junk root directories themselves (only children are allowed)', () => {
      const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Mock\\AppData\\Local'
      const tempRoot = process.env.TEMP || path.join(localAppData, 'Temp')

      // Root itself must never be deleted
      expect(isAllowedJunkPath(tempRoot)).toBe(false)
      expect(isAllowedJunkPath('C:\\Windows\\Temp')).toBe(false)
    })

    it('allows safe descendant files within designated junk folders', () => {
      const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Mock\\AppData\\Local'
      const tempRoot = process.env.TEMP || path.join(localAppData, 'Temp')

      // Descendants are allowed
      expect(isAllowedJunkPath(path.join(tempRoot, 'scratch_file.tmp'))).toBe(true)
      expect(isAllowedJunkPath(path.join(tempRoot, 'nested_subfolder', 'log.txt'))).toBe(true)
      expect(isAllowedJunkPath('C:\\Windows\\Temp\\service_worker.tmp')).toBe(true)
      expect(isAllowedJunkPath('C:\\Windows\\SoftwareDistribution\\Download\\patch_12345.cab')).toBe(true)
    })

    it('rejects invalid or relative paths', () => {
      expect(isAllowedJunkPath('')).toBe(false)
      expect(isAllowedJunkPath('relative/path')).toBe(false)
      expect(isAllowedJunkPath('./something.tmp')).toBe(false)
    })
  })

  describe('Directory Inspection: inspectDirectoryJunk', () => {
    it('safely computes size and file count for sample directory', async () => {
      const file1 = path.join(testDir, 'junk1.tmp')
      const file2 = path.join(testDir, 'junk2.log')
      const subDir = path.join(testDir, 'cache_folder')
      const file3 = path.join(subDir, 'junk3.bin')

      await fs.promises.mkdir(subDir, { recursive: true })
      await fs.promises.writeFile(file1, 'A'.repeat(100))
      await fs.promises.writeFile(file2, 'B'.repeat(250))
      await fs.promises.writeFile(file3, 'C'.repeat(500))

      const result = await inspectDirectoryJunk(testDir)
      expect(result.fileCount).toBe(3)
      expect(result.sizeBytes).toBe(850)
    })

    it('returns zero for non-existent directories without throwing', async () => {
      const nonExistent = path.join(testDir, 'does-not-exist-at-all')
      const result = await inspectDirectoryJunk(nonExistent)
      expect(result.fileCount).toBe(0)
      expect(result.sizeBytes).toBe(0)
    })
  })

  describe('Category Definitions and Registry', () => {
    it('scans all registered junk categories with valid metadata', async () => {
      // Test scanning userTemp category
      const result = await scanSystemJunk(['userTemp'])
      expect(result.categories.length).toBe(1)
      expect(result.categories[0].id).toBe('userTemp')
      expect(result.categories[0].safeToClean).toBe(true)
      expect(result.categories[0].name).toBe('User Temporary Files')
      expect(typeof result.categories[0].sizeBytes).toBe('number')
      expect(typeof result.categories[0].fileCount).toBe('number')
    })
  })
})
