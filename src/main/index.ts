import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import splashUrl from '../../resources/splash.html?asset'
import { logger, installCrashHandlers } from './logger'
import { openDb, closeDb } from './infrastructure/db/client'
import { runMigrations } from './infrastructure/db/migrator'
import { registerContracts, publish } from './ipc/router'
import { contracts } from '@shared/ipc/contracts'
import { handlers } from './ipc/handlers'
import { seedAuthIfNeeded } from './auth/seed'
import { startFxScheduler } from './infrastructure/fx/scheduler'
import { startBackupScheduler } from './backup/scheduler'
import { startAgroPullScheduler } from './infrastructure/sync/agroone/scheduler'
import { startP2p, stopP2p } from './infrastructure/sync/p2p/p2p.service'

let splashWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null

function applyCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          is.dev
            ? "default-src 'self' 'unsafe-inline' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; connect-src 'self' http://localhost:* ws://localhost:*; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';"
        ]
      }
    })
  })

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )
}

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 460,
    height: 280,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  win.once('ready-to-show', () => win.show())
  void win.loadFile(splashUrl)
  return win
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const allowed =
      is.dev && process.env['ELECTRON_RENDERER_URL']
        ? url.startsWith(process.env['ELECTRON_RENDERER_URL'])
        : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

async function bootstrap(): Promise<void> {
  installCrashHandlers()
  applyCsp()

  splashWindow = createSplashWindow()

  openDb()

  await runMigrations((progress) => {
    logger.info(progress, 'migration progress')
    if (splashWindow && !splashWindow.isDestroyed()) {
      void splashWindow.webContents.executeJavaScript(
        `document.getElementById('phase')?.replaceChildren(document.createTextNode(${JSON.stringify(
          progress.message
        )}));`,
        true
      )
    }
  })

  await seedAuthIfNeeded()

  registerContracts(contracts, handlers)
  logger.info('ipc contracts registered')

  startFxScheduler(publish)
  startBackupScheduler()
  startAgroPullScheduler(publish)
  await startP2p(publish)

  mainWindow = createMainWindow()
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    splashWindow = null
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.smartautomatai.pos-tg')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  bootstrap().catch((err) => {
    logger.fatal({ err }, 'bootstrap failed')
    if (splashWindow && !splashWindow.isDestroyed()) {
      void splashWindow.webContents.executeJavaScript(
        `document.getElementById('phase')?.replaceChildren(document.createTextNode(${JSON.stringify(
          'Error fatal — revisar logs'
        )}));`,
        true
      )
    }
  })
})

app.on('window-all-closed', () => {
  stopP2p()
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !splashWindow) {
    bootstrap().catch((err) => logger.fatal({ err }, 'reactivate bootstrap failed'))
  }
})
