import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { startHookServer } from './hooks'
import { detectAgents } from './agents'
import { readJson, writeJson } from './store'
import * as sessions from './sessions'
import type { SessionKind } from '../shared/types'

// Solo estos archivos se pueden leer o escribir desde el renderer.
const STORES = new Set(['prefs', 'projects'])

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 640,
    minHeight: 400,
    show: false,
    frame: false,
    backgroundColor: '#0c0d0e',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.on('maximize', () => win?.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win?.webContents.send('win:maximized', false))

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('sessions:create', (_, cwd: string, kind?: SessionKind) =>
    sessions.createSession(cwd, kind)
  )
  ipcMain.handle('sessions:list', () => sessions.listSessions())
  ipcMain.handle('sessions:buffer', (_, id: string) => sessions.readBuffer(id))
  ipcMain.handle('sessions:rename', (_, id: string, title: string) =>
    sessions.renameSession(id, title)
  )
  ipcMain.handle('sessions:close', (_, id: string) => sessions.closeSession(id))
  ipcMain.on('sessions:write', (_, id: string, data: string) => sessions.writeSession(id, data))
  ipcMain.on('sessions:resize', (_, id: string, cols: number, rows: number) =>
    sessions.resizeSession(id, cols, rows)
  )

  ipcMain.handle('agents:detect', () => detectAgents())

  ipcMain.handle('store:read', (_, name: string, fallback: unknown) =>
    STORES.has(name) ? readJson(name, fallback) : fallback
  )
  ipcMain.handle(
    'store:write',
    (_, name: string, data: unknown) => STORES.has(name) && writeJson(name, data)
  )

  ipcMain.handle('dialog:pickFolder', async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('win:isMaximized', () => !!win?.isMaximized())
  ipcMain.on('win:minimize', () => win?.minimize())
  ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('win:close', () => win?.close())
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.slate.terminal')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // Las shells siguen emitiendo mientras la ventana se cierra; enviar a una ventana destruida lanza.
  sessions.onSessionEvent((channel, ...args) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
  })
  await startHookServer(sessions.handleHook)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // ponytail: cerrar la ventana mata las sesiones; el host que las mantiene vivas llega en el roadmap.
  sessions.closeAll()
  if (process.platform !== 'darwin') app.quit()
})
