import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  nativeTheme,
  Notification,
  Tray
} from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { startHookServer } from './hooks'
import { detectAgents } from './agents'
import { readJson, writeJson } from './store'
import * as sessions from './sessions'
import type { Notice, SessionKind } from '../shared/types'

// Solo estos archivos se pueden leer o escribir desde el renderer.
const STORES = new Set(['prefs', 'projects'])

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function showWindow(): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

// "Seguir en la bandeja": cerrar la ventana la esconde y las sesiones siguen vivas.
function setTray(on: boolean): void {
  if (on && !tray) {
    tray = new Tray(icon)
    tray.setToolTip('Slate')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir Slate', click: showWindow },
        { type: 'separator' },
        { label: 'Salir', click: () => app.quit() }
      ])
    )
    tray.on('click', showWindow)
  } else if (!on && tray) {
    tray.destroy()
    tray = null
  }
}

type SavedPrefs = { tray?: unknown; theme?: unknown } | null

// El tema guardado, ya resuelto: la ventana y la página pintan con él desde el primer frame.
function startsDark(prefs: SavedPrefs): boolean {
  return prefs?.theme === 'auto' ? nativeTheme.shouldUseDarkColors : prefs?.theme !== 'light'
}

// Los avisos se guardan hasta que se usan: si el recolector se los lleva, su clic se pierde.
const notices = new Set<Notification>()
function notify({ id, title, body, silent }: Notice): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: String(title), body: String(body), silent: !!silent })
  const forget = (): boolean => notices.delete(n)
  notices.add(n)
  n.on('click', () => {
    forget()
    showWindow()
    if (id && win && !win.isDestroyed()) win.webContents.send('notify:click', String(id))
  })
  n.on('close', forget)
  n.on('failed', forget)
  n.show()
}

function createWindow(): void {
  const theme = startsDark(readJson<SavedPrefs>('prefs', null)) ? 'dark' : 'light'
  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 640,
    minHeight: 400,
    show: false,
    frame: false,
    backgroundColor: theme === 'dark' ? '#151719' : '#f0f1f2', // la pizarra de cada tema
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win?.show())
  // Apagar o cerrar sesión en Windows no emite before-quit: sin esto la ventana lo bloquearía.
  win.on('session-end', () => (quitting = true))
  win.on('close', (e) => {
    if (tray && !quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.on('maximize', () => win?.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win?.webContents.send('win:maximized', false))

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?theme=${theme}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query: { theme } })
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
  ipcMain.handle('store:write', (_, name: string, data: unknown) => {
    if (!STORES.has(name)) return
    writeJson(name, data)
    if (name === 'prefs') setTray((data as SavedPrefs)?.tray === true)
  })

  ipcMain.on('notify', (_, notice: Notice) => notify(notice))

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
  setTray(readJson<SavedPrefs>('prefs', null)?.tray === true)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => (quitting = true))

app.on('window-all-closed', () => {
  // ponytail: salir mata las sesiones (con la bandeja, cerrar solo esconde la ventana); el host que
  // las mantiene vivas entre reinicios llega en el roadmap.
  sessions.closeAll()
  if (process.platform !== 'darwin') app.quit()
})
