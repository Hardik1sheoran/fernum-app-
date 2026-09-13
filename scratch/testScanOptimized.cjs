const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const CONCURRENT_DIR_SCANS = 16;

class AsyncSemaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.active++;
  }
  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const DEFAULT_IGNORED_DIRS = new Set([
  '$recycle.bin',
  'system volume information',
  'config.msi',
  'recovery',
]);

const OPAQUE_BUNDLE_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.cargo',
  '.gradle',
  '.nuget',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'winsxs',
  '.venv',
  'venv',
  '__pycache__',
  'site-packages',
  '.rustup',
  '.pnpm',
  'npm-cache',
]);

const sem = new AsyncSemaphore(CONCURRENT_DIR_SCANS);

async function scanDir(dirPath, depth, ctx, opaqueDepth = 0) {
  const baseName = path.basename(dirPath) || dirPath;
  const lowerName = baseName.toLowerCase();

  if (DEFAULT_IGNORED_DIRS.has(lowerName) || ctx.excludedSet.has(dirPath.toLowerCase())) {
    return null;
  }

  const isOpaque = OPAQUE_BUNDLE_DIRS.has(lowerName) || opaqueDepth > 0;
  const nextOpaqueDepth = isOpaque ? opaqueDepth + 1 : 0;

  const dirNode = {
    id: dirPath,
    name: baseName,
    path: dirPath,
    size: 0,
    type: 'directory',
    category: 'other',
    children: [],
  };

  let entries = [];
  try {
    entries = await sem.run(() => fs.readdir(dirPath, { withFileTypes: true }));
  } catch {
    return null;
  }

  const childNodes = [];
  const fileEntries = [];
  const dirEntries = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const lower = entry.name.toLowerCase();
    if (
      lower === 'pagefile.sys' ||
      lower === 'hiberfil.sys' ||
      lower === 'swapfile.sys' ||
      lower === 'dumpstack.log.tmp'
    ) {
      continue;
    }
    if (entry.isDirectory()) dirEntries.push(entry);
    else if (entry.isFile()) fileEntries.push(entry);
  }

  const BATCH_SIZE = 64;
  for (let i = 0; i < fileEntries.length; i += BATCH_SIZE) {
    const batch = fileEntries.slice(i, i + BATCH_SIZE);
    const statsResults = await Promise.all(
      batch.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          return {
            id: fullPath,
            name: entry.name,
            path: fullPath,
            size: stats.size || 0,
            type: 'file',
            category: 'other',
          };
        } catch {
          return null;
        }
      })
    );

    for (const f of statsResults) {
      if (f) {
        if (opaqueDepth < 2 && depth < 5) {
          childNodes.push(f);
        }
        dirNode.size += f.size;
        ctx.totalFiles++;
        ctx.totalBytes += f.size;
      }
    }
  }

  if (dirEntries.length > 0) {
    if (depth >= ctx.maxDepth) {
      dirNode.truncatedAtDepth = true;
    } else {
      const subPromises = dirEntries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        return scanDir(fullPath, depth + 1, ctx, nextOpaqueDepth);
      });
      const subNodes = await Promise.all(subPromises);
      for (const sub of subNodes) {
        if (sub && (sub.size > 0 || (sub.children && sub.children.length > 0))) {
          childNodes.push(sub);
          dirNode.size += sub.size;
        }
      }
    }
  }

  // Keep top 60 largest children for treemap layout (treemap only renders up to 25-50 per level)
  childNodes.sort((a, b) => b.size - a.size);
  dirNode.children = childNodes.slice(0, 60);
  return dirNode;
}

async function test() {
  const maxDepth = parseInt(process.argv[2] || '6', 10);
  console.log(`Starting scan test with maxDepth = ${maxDepth}...`);
  const t0 = performance.now();
  const ctx = {
    totalFiles: 0,
    totalBytes: 0,
    excludedSet: new Set(),
    maxDepth,
  };

  const root = await scanDir('C:\\', 0, ctx);
  const elapsed = Math.round(performance.now() - t0);
  const serialized = JSON.stringify(root);

  console.log(`\nScan Completed in ${elapsed} ms (${(elapsed / 1000).toFixed(2)} s)!`);
  console.log(`Total Files: ${ctx.totalFiles.toLocaleString()}`);
  console.log(`Total Size: ${(ctx.totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Serialized JSON Payload: ${serialized.length} chars (${(serialized.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Direct children of C:\\: ${root.children.length}`);
}

test().catch(console.error);
