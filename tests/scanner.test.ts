import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  performScan,
  scanDirectory,
  AsyncSemaphore,
  CONCURRENT_DIR_SCANS,
  type ScanContext,
} from '../electron/workers/scanner.worker'
import { FREE_TIER_BYTE_CAP, type FileNode } from '../shared/types'

describe('Drive Scanner Engine: Concurrency, Depth & Accuracy', () => {
  it('AsyncSemaphore properly restricts maximum concurrent operations', async () => {
    const sem = new AsyncSemaphore(3)
    let active = 0
    let maxObservedActive = 0

    const tasks = Array.from({ length: 10 }, async () => {
      await sem.run(async () => {
        active++
        maxObservedActive = Math.max(maxObservedActive, active)
        await new Promise((resolve) => setTimeout(resolve, 15))
        active--
      })
    })

    await Promise.all(tasks)
    expect(maxObservedActive).toBeLessThanOrEqual(3)
    expect(active).toBe(0)
  })

  it('surfaces depth truncation with truncatedAtDepth flag when maxDepth is reached', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fernum-scan-depth-'))
    try {
      // Create depth 0 -> 1 -> 2 -> 3
      const d1 = path.join(tempDir, 'level1')
      const d2 = path.join(d1, 'level2')
      const d3 = path.join(d2, 'level3')
      fs.mkdirSync(d3, { recursive: true })
      fs.writeFileSync(path.join(d3, 'deep_file.txt'), 'deep content')
      fs.writeFileSync(path.join(tempDir, 'root_file.txt'), 'root content')

      // Scan with maxDepth: 1
      const rootNode = await performScan({
        targetPath: tempDir,
        maxDepth: 1,
      })

      expect(rootNode).not.toBeNull()
      expect(rootNode?.truncatedAtDepth).toBe(true)

      // Find level1 child
      const level1Node = rootNode?.children?.find((c) => c.name === 'level1')
      expect(level1Node).toBeDefined()
      expect(level1Node?.truncatedAtDepth).toBe(true)

      // Scan with generous maxDepth: 10
      const fullNode = await performScan({
        targetPath: tempDir,
        maxDepth: 10,
      })

      expect(fullNode).not.toBeNull()
      expect(fullNode?.truncatedAtDepth).toBeUndefined()
      expect(fullNode?.children?.some((c) => c.name === 'root_file.txt')).toBe(true)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('accurately counts files, computes byte sizes, and benchmarks parallel scan against serial', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fernum-bench-'))
    let expectedTotalFiles = 0
    let expectedTotalBytes = 0

    try {
      // Build a multi-branch tree: 6 top dirs, each with 4 subdirs, each with 5 files (120 files + 6 root files = 126 files)
      for (let i = 0; i < 6; i++) {
        const topDir = path.join(tempDir, `branch_${i}`)
        fs.mkdirSync(topDir, { recursive: true })

        const rootFileContent = `Root file in branch ${i}`
        fs.writeFileSync(path.join(topDir, `top_file_${i}.txt`), rootFileContent)
        expectedTotalFiles++
        expectedTotalBytes += Buffer.byteLength(rootFileContent)

        for (let j = 0; j < 4; j++) {
          const subDir = path.join(topDir, `sub_${j}`)
          fs.mkdirSync(subDir, { recursive: true })

          for (let k = 0; k < 5; k++) {
            const content = `Branch ${i}, Sub ${j}, File ${k} - sample payload data for timing test`
            fs.writeFileSync(path.join(subDir, `data_${k}.dat`), content)
            expectedTotalFiles++
            expectedTotalBytes += Buffer.byteLength(content)
          }
        }
      }

      // --- Serial Scan Simulation (Semaphore max = 1) ---
      const serialCtx: ScanContext = {
        totalFiles: 0,
        totalBytes: 0,
        lastReportTime: Date.now(),
        targetPath: tempDir,
        excludedSet: new Set(),
        maxDepth: 50,
        dirSemaphore: new AsyncSemaphore(1), // strictly serial
      }

      const serialStart = performance.now()
      const serialResult = await scanDirectory(tempDir, 0, serialCtx)
      const serialDuration = performance.now() - serialStart

      // --- Parallel Scan with Bounded Concurrency (CONCURRENT_DIR_SCANS = 12) ---
      const parallelCtx: ScanContext = {
        totalFiles: 0,
        totalBytes: 0,
        lastReportTime: Date.now(),
        targetPath: tempDir,
        excludedSet: new Set(),
        maxDepth: 50,
        dirSemaphore: new AsyncSemaphore(CONCURRENT_DIR_SCANS),
      }

      const parallelStart = performance.now()
      const parallelResult = await scanDirectory(tempDir, 0, parallelCtx)
      const parallelDuration = performance.now() - parallelStart

      // Verify 100% Accuracy (Zero discrepancy)
      expect(serialResult).not.toBeNull()
      expect(parallelResult).not.toBeNull()
      expect(parallelCtx.totalFiles).toBe(expectedTotalFiles)
      expect(parallelCtx.totalBytes).toBe(expectedTotalBytes)
      expect(serialCtx.totalFiles).toBe(parallelCtx.totalFiles)
      expect(serialCtx.totalBytes).toBe(parallelCtx.totalBytes)
      expect(parallelResult?.size).toBe(expectedTotalBytes)
      expect(serialResult?.size).toBe(expectedTotalBytes)

      console.log(`\n=== Scanner Benchmark Results ===`)
      console.log(`Directory Structure: 30 folders, ${expectedTotalFiles} files, ${expectedTotalBytes} bytes`)
      console.log(`Serial Scan Duration:   ${serialDuration.toFixed(2)} ms`)
      console.log(`Parallel Scan Duration: ${parallelDuration.toFixed(2)} ms`)
      console.log(`Speedup Factor:         ${(serialDuration / Math.max(1, parallelDuration)).toFixed(2)}x`)
      console.log(`=================================\n`)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe('Free Tier 70GB Scan Capping & Pro Tier Uncapped Scanning', () => {
  it('FREE_TIER_BYTE_CAP is set to exactly 70GB', () => {
    expect(FREE_TIER_BYTE_CAP).toBe(70 * 1024 * 1024 * 1024)
  })

  it('stops scanning and marks result as capped when cumulative bytes cross the cap in free tier', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fernum-cap-test-'))
    try {
      // Create 25 directories, each with a 1KB file (25KB total)
      const totalDirs = 25
      for (let i = 0; i < totalDirs; i++) {
        const subDir = path.join(tempDir, `dir_${i}`)
        fs.mkdirSync(subDir, { recursive: true })
        fs.writeFileSync(path.join(subDir, `payload_${i}.bin`), Buffer.alloc(1024, 0x41))
      }

      // Free tier scan with a 3,000-byte cap (well below the 25KB total)
      const cappedRoot = await performScan({
        targetPath: tempDir,
        isPro: false,
        maxBytes: 3000,
      })

      expect(cappedRoot).not.toBeNull()
      expect(cappedRoot?.capped).toBe(true)
      expect(cappedRoot?.cappedAtBytes).toBe(3000)

      // The capped scan stops accumulating once threshold is reached
      // Full scan would have 25,600 bytes; capped scan must be less than full tree
      expect(cappedRoot?.size).toBeLessThan(totalDirs * 1024)

      // Pro tier scan with same tree should scan everything and not be capped
      const uncappedRoot = await performScan({
        targetPath: tempDir,
        isPro: true,
        maxBytes: 3000,
      })

      expect(uncappedRoot).not.toBeNull()
      expect(uncappedRoot?.capped).toBeUndefined()
      expect(uncappedRoot?.size).toBe(totalDirs * 1024)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('preserves uncapped state when scanned data is below the free cap', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fernum-below-cap-'))
    try {
      fs.writeFileSync(path.join(tempDir, 'small.txt'), 'hello world')

      const result = await performScan({
        targetPath: tempDir,
        isPro: false,
        maxBytes: 50000,
      })

      expect(result).not.toBeNull()
      expect(result?.capped).toBeUndefined()
      expect(result?.cappedAtBytes).toBeUndefined()
      expect(result?.size).toBe(11)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

