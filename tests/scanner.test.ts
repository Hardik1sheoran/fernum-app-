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
import type { FileNode } from '../shared/types'

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
