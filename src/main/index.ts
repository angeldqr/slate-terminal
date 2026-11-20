import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  Tray
} from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostPids } from './host-client'
import { listProcesses, sumTree } from './processes'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { startHookServer } from './hooks'
import { detectAgents } from './agents'
import { readJson, writeJson } from './store'
import * as sessions from './sessions'
import { currentBranch, repoRoot } from './git'
import * as changes from './changes'
import { handleMcp } from './mcp'
import * as updater from './updater'
import {
  HostVersionError,
  hostConnected,
  replaceHost,
  shutdownHost,
  startHost
} from './host-client'
import type { DiffScope, Notice, SessionKind, SessionOpts } from '../shared/types'
import { paletteOf } from '../shared/palettes'

// Solo estos archivos se pueden leer o escribir desde el renderer.
const STORES = new Set(['prefs', 'projects', 'layout'])

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
        { label: 'Salir', click: () => app.quit() },
        { label: 'Salir y detener las sesiones', click: () => ((stopOnQuit = true), app.quit()) }
      ])
    )
    tray.on('click', showWindow)
  } else if (!on && tray) {
    tray.destroy()
    tray = null
  }
}

type SavedPrefs = {
  tray?: unknown
  theme?: unknown
  darkPalette?: unknown
  lightPalette?: unknown
  uiScale?: unknown
  shell?: unknown
  orchestration?: unknown
  keepAlive?: unknown
  autoUpdate?: unknown
  gpu?: unknown
} | null

// Al salir, ¿las sesiones siguen vivas en el host? Sí por defecto; `stopOnQuit` lo fuerza a no
// para una salida concreta (la opción de la bandeja).
let keepAlive = true
let stopOnQuit = false

// Lo que de las preferencias aplica main: la bandeja, si Claude Code recibe el MCP de Slate y si
// las sesiones sobreviven al cierre.
function applyPrefs(prefs: SavedPrefs): void {
  setTray(prefs?.tray === true)
  sessions.setOrchestration(prefs?.orchestration !== false)
  sessions.setShell(prefs?.shell)
  keepAlive = prefs?.keepAlive !== false
}

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
  const prefs = readJson<SavedPrefs>('prefs', null)
  const dark = startsDark(prefs)
  const theme = dark ? 'dark' : 'light'
  const palette = paletteOf(dark ? prefs?.darkPalette : prefs?.lightPalette, dark)
  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 640,
    minHeight: 400,
    show: false,
    frame: false,
    backgroundColor: palette.tokens.sidebar, // el marco del tema, sin destello
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      // Sin frenar hasta que se ve: el primer pintado no espera a que la ventana tenga foco.
      backgroundThrottling: false,
      // El tamaño de la interfaz (Ajustes › Apariencia) desde el primer frame.
      // Lo escribe el renderer: se acota a lo que ofrece Ajustes (85–130 %).
      zoomFactor:
        typeof prefs?.uiScale === 'number' && Number.isFinite(prefs.uiScale)
          ? Math.min(130, Math.max(85, prefs.uiScale)) / 100
          : 1
    }
  })

  win.on('ready-to-show', () => {
    win?.show()
    win?.webContents.setBackgroundThrottling(true) // ya visible: oculta, ahorra batería
  })
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

  const query = { theme, palette: palette.id }
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${new URLSearchParams(query)}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

function registerIpc(): void {
  ipcMain.handle('sessions:create', (_, cwd: string, kind?: SessionKind, opts?: SessionOpts) =>
    sessions.createSession(cwd, kind, {
      isolate: opts?.isolate === true,
      prompt: typeof opts?.prompt === 'string' ? opts.prompt : undefined
    })
  )
  ipcMain.handle('sessions:list', () => sessions.listSessions())
  ipcMain.handle('sessions:restored', () => {
    const n = restored
    restored = 0
    return n
  })
  ipcMain.handle('sessions:buffer', (_, id: string) => sessions.readBuffer(id))
  // Las últimas líneas de cada sesión, ya como texto: el tablero las muestra en vivo.
  ipcMain.handle('sessions:screens', (_, ids: string[], lines: number) =>
    Object.fromEntries(
      (Array.isArray(ids) ? ids.slice(0, 200) : []).map((id) => [
        String(id),
        sessions.readScreen(String(id), Math.min(40, Math.max(1, Number(lines) || 12))) ?? ''
      ])
    )
  )
  ipcMain.handle('shells:list', () => sessions.listShells())
  ipcMain.handle('sessions:rename', (_, id: string, title: string) =>
    sessions.renameSession(id, title)
  )
  ipcMain.handle('sessions:close', (_, id: string) => sessions.closeSession(id))
  ipcMain.on('sessions:write', (_, id: string, data: string) => sessions.writeSession(id, data))
  ipcMain.on('sessions:resize', (_, id: string, cols: number, rows: number) =>
    sessions.resizeSession(id, cols, rows)
  )

  ipcMain.handle('agents:detect', () => detectAgents())
  // Panel de cambios: el renderer solo manda el id de la sesión; main resuelve rutas y ramas.
  ipcMain.handle('git:changes', (_, id: string, scope?: DiffScope) =>
    changes.sessionChanges(String(id), scope)
  )
  ipcMain.handle(
    'git:fileDiff',
    (_, id: string, path: string, ignoreSpace?: boolean, scope?: DiffScope) =>
      changes.sessionFileDiff(String(id), String(path), ignoreSpace === true, scope)
  )
  ipcMain.handle('git:fileContents', (_, id: string, path: string, scope?: DiffScope) =>
    changes.sessionFileContents(String(id), String(path), scope)
  )
  ipcMain.handle(
    'git:showFile',
    (_, id: string, path: string, scope?: DiffScope, editor?: boolean) =>
      changes.showChangedFile(String(id), String(path), scope, editor === true)
  )
  ipcMain.handle('git:commit', (_, id: string, msg: string, exclude?: string[]) =>
    changes.commitBranch(String(id), String(msg), exclude)
  )
  ipcMain.handle('git:merge', (_, id: string, msg: string) =>
    changes.mergeBranch(String(id), String(msg))
  )
  ipcMain.handle('git:discardFile', (_, id: string, path: string, scope?: DiffScope) =>
    changes.discardChangedFile(String(id), String(path), scope)
  )
  // Un comentario del panel de cambios, directo al terminal del agente.
  ipcMain.handle('sessions:comment', (_, id: string, text: string) =>
    // Una sola línea: un salto dentro del texto se tomaría por Enter y partiría el mensaje.
    sessions.sendText(
      String(id),
      String(text)
        .replace(/\s*[\r\n]+\s*/g, ' ')
        .slice(0, 4000),
      true
    )
  )
  ipcMain.handle('git:discard', (_, id: string) => changes.discardBranch(String(id)))
  ipcMain.handle('git:push', (_, id: string, msg: string, exclude?: string[]) =>
    changes.pushBranch(String(id), String(msg), exclude)
  )
  ipcMain.handle('git:pr', (_, id: string, msg: string, exclude?: string[]) =>
    changes.openPullRequest(String(id), String(msg), exclude)
  )
  // La rama actual de la carpeta, o null si no es un repo git (o si aún no tiene commits).
  ipcMain.handle('git:branch', async (_, cwd: string) => {
    const root = await repoRoot(String(cwd))
    return root ? currentBranch(root).catch(() => null) : null
  })

  ipcMain.handle('store:read', (_, name: string, fallback: unknown) =>
    STORES.has(name) ? readJson(name, fallback) : fallback
  )
  ipcMain.handle('store:write', (_, name: string, data: unknown) => {
    if (!STORES.has(name)) return
    writeJson(name, data)
    if (name === 'prefs') applyPrefs(data as SavedPrefs)
  })

  ipcMain.on('notify', (_, notice: Notice) => notify(notice))

  // Ajustes › Avanzado.
  ipcMain.handle('app:info', () => ({
    dataDir: app.getPath('userData'),
    host: hostConnected(),
    // Con qué arrancó esta vez (cambiar el ajuste vale desde el siguiente arranque) y qué dice
    // Chromium: "enabled" o "enabled_on" es la GPU de verdad.
    gpu: {
      on: gpuAtBoot,
      webgl: String(app.getGPUFeatureStatus().webgl ?? ''),
      compositing: String(app.getGPUFeatureStatus().gpu_compositing ?? '')
    }
  }))
  ipcMain.handle('app:openData', () => shell.openPath(app.getPath('userData')))
  // Insignia de la barra de tareas: cuántas sesiones te necesitan (un PNG que dibuja el renderer).
  // Lo que gasta cada terminal (memoria y CPU de su shell y todo lo que lanzó) y el propio host.
  ipcMain.handle('app:processes', async () => {
    try {
      const pids = await hostPids()
      const procs = await listProcesses()
      return {
        host: pids.host ? { pid: pids.host, ...sumTree(procs, pids.host) } : null,
        sessions: Object.fromEntries(
          Object.entries(pids.sessions).map(([id, pid]) => [id, { pid, ...sumTree(procs, pid) }])
        )
      }
    } catch {
      return null // sin host o sin permiso para listar procesos
    }
  })
  // El registro del host (host.log) si existe; si no, la carpeta de datos.
  ipcMain.handle('app:openLogs', () => {
    const log = join(app.getPath('userData'), 'host.log')
    if (!existsSync(log)) return shell.openPath(app.getPath('userData'))
    shell.showItemInFolder(log)
    return ''
  })
  ipcMain.on('app:badge', (_, png: string | null, label: string) => {
    win?.setOverlayIcon(png ? nativeImage.createFromDataURL(png) : null, label)
  })
  // Reiniciar para aplicar la GPU: con "Mantener las sesiones", siguen vivas en el host.
  ipcMain.on('app:relaunch', () => {
    app.relaunch()
    app.quit()
  })

  ipcMain.handle('update:state', () => updater.updateState())
  ipcMain.on('update:check', () => updater.checkForUpdates())
  ipcMain.on('update:download', () => updater.downloadUpdate())
  // Instalar reemplaza el ejecutable, también el del host: las sesiones se cierran antes, con
  // calma, en vez de que el instalador las mate.
  // Un segundo clic mientras se cierran no vuelve a empezar; si cerrar falla, se instala igual
  // (el instalador termina lo que quede).
  let installing = false
  ipcMain.on('update:install', async () => {
    if (installing || updater.updateState().status !== 'ready') return
    installing = true
    await sessions.closeAll().catch(() => {})
    shutdownHost()
    sessionsClosed = true
    updater.installUpdate()
  })

  ipcMain.handle('dialog:pickFolder', async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('win:isMaximized', () => !!win?.isMaximized())
  ipcMain.on('win:minimize', () => win?.minimize())
  ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('win:close', () => win?.close())
}

// Un solo Slate por carpeta de datos: dos se pelearían por el host de sesiones (el segundo
// echaría al primero, que daría por terminadas sesiones que siguen vivas). El segundo solo
// trae al frente al que ya está abierto.
const single = app.requestSingleInstanceLock()

// Aceleración por GPU (Ajustes › Avanzado): apagarla solo se puede antes de que Electron esté
// listo, así que se lee de las preferencias al arrancar.
const gpuAtBoot = readJson<SavedPrefs>('prefs', null)?.gpu !== false
if (single && !gpuAtBoot) app.disableHardwareAcceleration()
if (single) clearStaleGpuCaches()

// Las cachés de shaders de otra versión de Electron pueden hacer que la GPU falle y todo caiga
// a la CPU: al cambiar de versión (una actualización) se borran. Como hace T3 Code.
function clearStaleGpuCaches(): void {
  const dir = app.getPath('userData')
  const mark = join(dir, 'gpu-cache-version')
  const current = process.versions.electron
  let last = ''
  try {
    last = readFileSync(mark, 'utf8').trim()
  } catch {
    // primera vez: no hay marca
  }
  if (last === current) return
  for (const name of [
    'GPUCache',
    'GrShaderCache',
    'ShaderCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache'
  ]) {
    try {
      rmSync(join(dir, name), { recursive: true, force: true })
    } catch {
      // bloqueada (antivirus): se queda; no debe impedir que Slate arranque
    }
  }
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(mark, current)
  } catch {
    // sin poder escribir la marca, se volverán a borrar la próxima vez: no pasa nada
  }
}
if (!single) app.quit()
app.on('second-instance', showWindow)

// Cuántas sesiones volvieron del host al arrancar: el aviso se da una vez, no al recargar.
let restored = 0

app.whenReady().then(async () => {
  if (!single) return
  electronApp.setAppUserModelId('com.slate.terminal')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // Las shells siguen emitiendo mientras la ventana se cierra; enviar a una ventana destruida lanza.
  sessions.onSessionEvent((channel, ...args) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
  })
  await startHookServer(sessions.handleHook, handleMcp)
  // Las sesiones viven en el host: se busca (o se lanza) y se recuperan las que siguieron vivas,
  // antes de abrir la ventana para que aparezcan desde el primer momento.
  try {
    await startHost().catch(async (err) => {
      if (!(err instanceof HostVersionError)) throw err
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Slate',
        message: 'Hay sesiones abiertas de otra versión de Slate',
        detail:
          'Siguen trabajando en segundo plano, pero esta versión no puede recuperarlas. Para continuar hay que detenerlas.',
        buttons: ['Detenerlas y continuar', 'Salir'],
        defaultId: 0,
        cancelId: 1
      })
      if (choice === 1) throw new Error('')
      await replaceHost()
    })
    restored = await sessions.restoreSessions()
  } catch (err) {
    if (!(err as Error).message) return app.exit(0)
    dialog.showErrorBox('Slate no pudo arrancar sus sesiones', (err as Error).message)
    app.exit(1)
    return
  }
  registerIpc()
  const prefs = readJson<SavedPrefs>('prefs', null)
  applyPrefs(prefs)
  createWindow()
  updater.initUpdater((state) => {
    if (win && !win.isDestroyed()) win.webContents.send('update:state', state)
  })
  // Al abrir, se mira en silencio si hay una versión nueva (se puede apagar en Ajustes).
  if (prefs?.autoUpdate !== false) setTimeout(updater.checkForUpdates, 8000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Al salir, las sesiones se quedan trabajando en el host y Slate las recupera al volver. Si no
// deben mantenerse, se cierran, se espera a que terminen y el host se va; luego se sale de verdad.
// Un segundo "Salir" mientras se espera reutiliza la misma espera en vez de salir antes de tiempo.
let sessionsClosed = false
let closing: Promise<void> | undefined
app.on('before-quit', (e) => {
  quitting = true
  if (sessionsClosed || (keepAlive && !stopOnQuit)) return
  e.preventDefault()
  closing ??= sessions.closeAll().finally(() => {
    shutdownHost()
    sessionsClosed = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
