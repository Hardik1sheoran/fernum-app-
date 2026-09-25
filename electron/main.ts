process.env.UV_THREADPOOL_SIZE = '64'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { registerScanIpc, cleanupScanIpc } from './ipc/scan'
import { registerFsOpsIpc } from './ipc/fs-ops'
import { registerAppsIpc } from './ipc/apps'
import { registerSearchIpc } from './ipc/search'
import { registerMonitorIpc, stopMonitorIpc } from './ipc/monitor'
import { registerCleanerIpc } from './ipc/cleaner'
import { registerDuplicatesIpc } from './ipc/duplicates'

// Register deep link protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('fernum', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('fernum')
}

function extractLicenseFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    return parsed.searchParams.get('key') || parsed.searchParams.get('license_key')
  } catch {
    return null
  }
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const appLaunchStart = Date.now()

process.env.DIST_ELECTRON = path.join(__dirname, '../dist-electron')
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

let mainWindow: BrowserWindow | null = null

const preloadCjsPath = path.join(__dirname, 'preload.cjs')
const preloadPath = fs.existsSync(preloadCjsPath) ? preloadCjsPath : path.join(__dirname, 'preload.js')

function createWindow(): void {
  const iconPath = path.join(process.env.VITE_PUBLIC || path.join(__dirname, '../dist'), 'icon.ico')
  mainWindow = new BrowserWindow({
    title: 'Fernum',
    icon: iconPath,
    width: 1240,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    backgroundColor: '#0f1115',
    backgroundMaterial: 'acrylic',
    vibrancy: 'under-window',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#14171d',
      symbolColor: '#94a3b8',
      height: 38,
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })

  // Security: Prevent arbitrary child browser windows; route links to default external OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Security: Block in-app navigation to arbitrary remote web origins
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    if (devUrl && navigationUrl.startsWith(devUrl)) {
      return
    }
    if (navigationUrl.startsWith('file://')) {
      return
    }
    event.preventDefault()
    if (navigationUrl.startsWith('https://') || navigationUrl.startsWith('http://')) {
      void shell.openExternal(navigationUrl)
    }
  })

  // Security: Disallow embedding of arbitrary webviews
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  mainWindow.once('ready-to-show', () => {
    console.log(`[PERF] App launch to ready-to-show: ${Date.now() - appLaunchStart} ms`)
    mainWindow?.show()
  })

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 1200)

  mainWindow.webContents.on('did-finish-load', () => {
    console.log(`[PERF] App launch to did-finish-load: ${Date.now() - appLaunchStart} ms`)
    // Check cold launch deep link argument
    const deepLinkArg = process.argv.find((arg) => arg.startsWith('fernum://'))
    if (deepLinkArg) {
      const key = extractLicenseFromUrl(deepLinkArg)
      if (key) {
        mainWindow?.webContents.send('license:activated', key)
      }
    }
  })

  mainWindow.webContents.on('console-message', (event, ...rest) => {
    const msg = (event && typeof event === 'object' && 'message' in event ? (event as any).message : rest[1]) || ''
    if (typeof msg === 'string' && msg.startsWith('[PERF]')) {
      console.log(`[Renderer] ${msg}`)
    }
  })

  // Surface any preload errors clearly in console/logs
  mainWindow.webContents.on('preload-error', (_event, pPath, error) => {
    console.error(`[Main] Preload script error in ${pPath}:`, error)
  })

  // Keyboard shortcut to toggle DevTools (F12 or Ctrl+Shift+I) or when FERNUM_DEBUG is set
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))
    ) {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  if (process.env.FERNUM_DEBUG === '1') {
    mainWindow.webContents.openDevTools()
  }

  if (process.env.FERNUM_AUTOMATE_TABS === '1') {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.executeJavaScript(`
        (async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          await wait(1200);
          console.log('[PERF] Tab automation starting...');
          const tabs = ['cleaner', 'apps', 'search', 'monitor', 'storage'];
          for (const tab of tabs) {
            const btn = document.getElementById('tab-' + tab);
            if (btn) {
              btn.click();
              await wait(1500);
            }
          }
          console.log('[PERF] All tab switches completed');
        })();
      `)
    })
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const distPath = process.env.DIST || path.join(__dirname, '../dist')
    mainWindow.loadFile(path.join(distPath, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    cleanupScanIpc()
    stopMonitorIpc()
  })
}

app.on('second-instance', (_event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.reload()
    const urlArg = commandLine.find((arg) => arg.startsWith('fernum://'))
    if (urlArg) {
      const key = extractLicenseFromUrl(urlArg)
      if (key) {
        mainWindow.webContents.send('license:activated', key)
      }
    }
  }
})

app.whenReady().then(() => {
  // Register all IPC modules once
  registerScanIpc(() => mainWindow)
  registerFsOpsIpc()
  registerAppsIpc()
  registerSearchIpc()
  registerMonitorIpc(() => mainWindow)
  registerCleanerIpc()
  registerDuplicatesIpc()

  // External URL opening helper
  ipcMain.handle('system:open-external', async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url)
      return true
    }
    return false
  })

  // Handle dynamic theme overlay updates for Windows
  ipcMain.handle('app:set-theme', (_event, theme: 'dark' | 'light') => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        if (theme === 'dark') {
          mainWindow.setTitleBarOverlay({
            color: '#14171d',
            symbolColor: '#94a3b8',
          })
        } else {
          mainWindow.setTitleBarOverlay({
            color: '#ffffff',
            symbolColor: '#334155',
          })
        }
      } catch {
        // Ignored on non-supporting platforms
      }
    }
    return true
  })

  // Windows Window Caption Controls
  ipcMain.handle('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize()
      return true
    }
    return false
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
      return mainWindow.isMaximized()
    }
    return false
  })

  ipcMain.handle('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
      return true
    }
    return false
  })

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopMonitorIpc()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
