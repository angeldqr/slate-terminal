import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'
import type {
  Agent,
  Changes,
  Notice,
  SessionInfo,
  SessionKind,
  SessionOpts,
  Status,
  UpdateState
} from '../shared/types'

// Suscribe a un canal y devuelve la función para dejar de escuchar.
function on<A extends unknown[]>(channel: string, fn: (...args: A) => void): () => void {
  const listener = (_: IpcRendererEvent, ...args: unknown[]): void => fn(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// La salida llega en lotes ({ id: texto }); cada terminal escucha solo la suya.
const dataListeners = new Map<string, Set<(data: string) => void>>()
ipcRenderer.on('session:data', (_, batch: Record<string, string>) => {
  for (const [id, data] of Object.entries(batch)) dataListeners.get(id)?.forEach((fn) => fn(data))
})

// Los archivos de datos que el renderer puede leer y escribir (main tiene la misma lista).
type StoreName = 'prefs' | 'projects' | 'layout'

const api = {
  sessions: {
    create: (cwd: string, kind?: SessionKind, opts?: SessionOpts): Promise<SessionInfo> =>
      ipcRenderer.invoke('sessions:create', cwd, kind, opts),
    list: (): Promise<SessionInfo[]> => ipcRenderer.invoke('sessions:list'),
    // Cuántas volvieron del host al abrir Slate (solo la primera vez que se pregunta).
    restored: (): Promise<number> => ipcRenderer.invoke('sessions:restored'),
    buffer: (id: string): Promise<string> => ipcRenderer.invoke('sessions:buffer', id),
    // Las últimas `lines` líneas de texto de cada sesión (para el tablero).
    screens: (ids: string[], lines: number): Promise<Record<string, string>> =>
      ipcRenderer.invoke('sessions:screens', ids, lines),
    rename: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke('sessions:rename', id, title),
    close: (id: string): Promise<void> => ipcRenderer.invoke('sessions:close', id),
    write: (id: string, data: string): void => ipcRenderer.send('sessions:write', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('sessions:resize', id, cols, rows),
    onData: (id: string, fn: (data: string) => void): (() => void) => {
      const set = dataListeners.get(id) ?? new Set()
      dataListeners.set(id, set.add(fn))
      return () => {
        set.delete(fn)
        if (!set.size) dataListeners.delete(id)
      }
    },
    onStatus: (fn: (id: string, status: Status) => void) => on('session:status', fn),
    // Sesiones que abrió un agente por MCP (new_task), con la sesión que las pidió.
    onAdopted: (fn: (sessions: SessionInfo[], parent: string) => void) => on('sessions:adopted', fn)
  },
  agents: {
    detect: (): Promise<Agent[]> => ipcRenderer.invoke('agents:detect')
  },
  git: {
    branch: (cwd: string): Promise<string | null> => ipcRenderer.invoke('git:branch', cwd),
    changes: (id: string): Promise<Changes | null> => ipcRenderer.invoke('git:changes', id),
    fileDiff: (id: string, path: string, ignoreSpace = false): Promise<string> =>
      ipcRenderer.invoke('git:fileDiff', id, path, ignoreSpace),
    commit: (id: string, msg: string): Promise<boolean> =>
      ipcRenderer.invoke('git:commit', id, msg),
    merge: (id: string, msg: string): Promise<string> => ipcRenderer.invoke('git:merge', id, msg),
    discard: (id: string): Promise<string> => ipcRenderer.invoke('git:discard', id),
    pr: (id: string, msg: string): Promise<string> => ipcRenderer.invoke('git:pr', id, msg)
  },
  store: {
    read: <T>(name: StoreName, fallback: T): Promise<T> =>
      ipcRenderer.invoke('store:read', name, fallback),
    write: (name: StoreName, data: unknown): Promise<void> =>
      ipcRenderer.invoke('store:write', name, data)
  },
  app: {
    info: (): Promise<{
      dataDir: string
      host: boolean
      gpu: { on: boolean; webgl: string; compositing: string }
    }> => ipcRenderer.invoke('app:info'),
    relaunch: (): void => ipcRenderer.send('app:relaunch'),
    openData: (): Promise<string> => ipcRenderer.invoke('app:openData'),
    shells: (): Promise<{ id: string; name: string }[]> => ipcRenderer.invoke('shells:list'),
    // Tamaño de toda la interfaz (1 = 100 %).
    setZoom: (factor: number): void => webFrame.setZoomFactor(factor)
  },
  update: {
    state: (): Promise<UpdateState> => ipcRenderer.invoke('update:state'),
    check: (): void => ipcRenderer.send('update:check'),
    download: (): void => ipcRenderer.send('update:download'),
    install: (): void => ipcRenderer.send('update:install'),
    onState: (fn: (state: UpdateState) => void) => on('update:state', fn)
  },
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
  notify: (notice: Notice): void => ipcRenderer.send('notify', notice),
  onNotifyClick: (fn: (id: string) => void) => on('notify:click', fn),
  win: {
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('win:isMaximized'),
    minimize: (): void => ipcRenderer.send('win:minimize'),
    maximize: (): void => ipcRenderer.send('win:maximize'),
    close: (): void => ipcRenderer.send('win:close'),
    onMaximized: (fn: (maximized: boolean) => void) => on('win:maximized', fn)
  }
}

export type SlateApi = typeof api

contextBridge.exposeInMainWorld('slate', api)
