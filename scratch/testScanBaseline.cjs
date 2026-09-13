const { Worker } = require('worker_threads');
const path = require('path');

const workerPath = path.resolve(__dirname, '../dist-electron/workers/scanner.worker.js');
console.log('Worker path:', workerPath);

const t0 = Date.now();
const worker = new Worker(workerPath);

let lastLog = Date.now();
worker.on('message', (msg) => {
  if (msg.type === 'progress') {
    const now = Date.now();
    if (now - lastLog >= 2000) {
      lastLog = now;
      console.log(`[${Math.round((now - t0)/1000)}s] Files: ${msg.data.scannedFiles}, Bytes: ${(msg.data.scannedBytes / 1024 / 1024 / 1024).toFixed(2)} GB, Current: ${msg.data.currentPath}`);
    }
  } else if (msg.type === 'complete') {
    const duration = Date.now() - t0;
    const serialized = JSON.stringify(msg.data);
    console.log(`\nScan COMPLETE in ${duration} ms (${(duration / 1000).toFixed(1)} s)`);
    console.log(`Serialized JSON size: ${serialized.length} chars (${(serialized.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Root node size: ${(msg.data.size / 1024 / 1024 / 1024).toFixed(2)} GB, top-level children: ${msg.data.children?.length}`);
    process.exit(0);
  } else if (msg.type === 'error') {
    console.error('Scan error:', msg.error);
    process.exit(1);
  }
});

worker.postMessage({
  command: 'start',
  options: {
    targetPath: 'C:\\',
    forceRescan: true
  }
});
