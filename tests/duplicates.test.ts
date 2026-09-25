import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { findDuplicateFiles } from '../electron/services/duplicateService'

describe('Duplicate File Finder Engine', () => {
  const testDir = path.join(os.tmpdir(), 'fernum-duplicates-unit-test')

  beforeEach(async () => {
    await fs.promises.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true })
    } catch {}
  })

  it('accurately identifies duplicate files with identical contents', async () => {
    // Create 3 identical files
    const content = 'IDENTICAL_CONTENT_BUFFER_'.repeat(500)
    await fs.promises.writeFile(path.join(testDir, 'original.txt'), content)
    await fs.promises.writeFile(path.join(testDir, 'copy1.txt'), content)
    await fs.promises.writeFile(path.join(testDir, 'copy2.txt'), content)

    // Create a different file of the exact same byte length
    const differentContent = 'DIFFERENT_CONTENT_BUFFER_'.repeat(500)
    await fs.promises.writeFile(path.join(testDir, 'unique.txt'), differentContent)

    const result = await findDuplicateFiles({
      targetPath: testDir,
      minSizeBytes: 100,
    })

    expect(result.groups.length).toBe(1)
    const group = result.groups[0]
    expect(group.files.length).toBe(3)
    expect(group.wastedBytes).toBe(group.sizeBytes * 2)
    expect(result.totalDuplicateFiles).toBe(3)
    expect(result.totalWastedBytes).toBe(group.sizeBytes * 2)

    const fileNames = group.files.map((f) => f.name)
    expect(fileNames).toContain('original.txt')
    expect(fileNames).toContain('copy1.txt')
    expect(fileNames).toContain('copy2.txt')
    expect(fileNames).not.toContain('unique.txt')
  })

  it('ignores unique files that have no duplicates', async () => {
    await fs.promises.writeFile(path.join(testDir, 'fileA.txt'), 'File A unique content'.repeat(100))
    await fs.promises.writeFile(path.join(testDir, 'fileB.txt'), 'File B different length'.repeat(80))

    const result = await findDuplicateFiles({
      targetPath: testDir,
      minSizeBytes: 100,
    })

    expect(result.groups.length).toBe(0)
    expect(result.totalDuplicateFiles).toBe(0)
    expect(result.totalWastedBytes).toBe(0)
  })
})
