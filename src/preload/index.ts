import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  Agent,
  Changes,
  Notice,
  SessionInfo,
  SessionKind,
  SessionOpts,
  Status
} from '../shared/types'

// Suscribe a un canal y devuelve la función para dejar de escuchar.
function on<A extends unknown[]>(channel: string, fn: (...args: A) => void): () => void {
  const listener = (_: IpcRendererEvent, ...args: unknown[]): void => fn(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  sessions: {
    create: (cwd: string, kind?: SessionKind, opts?: SessionOpts): Promise<SessionInfo> =>
      ipcRenderer.invoke('sessions:create', cwd, kind, opts),
    list: (): Promise<SessionInfo[]> => ipcRenderer.invoke('sessions:list'),
    buffer: (id: string): Promise<string> => ipcRenderer.invoke('sessions:buffer', id),
    rename: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke('sessions:rename', id, title),
    close: (id: string): Promise<void> => ipcRenderer.invoke('sessions:close', id),
    write: (id: string, data: string): void => ipcRenderer.send('sessions:write', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('sessions:resize', id, cols, rows),
    onData: (fn: (id: string, data: string) => void) => on('session:data', fn),
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
    fileDiff: (id: string, path: string): Promise<string> =>
      ipcRenderer.invoke('git:fileDiff', id, path),
    commit: (id: string, msg: string): Promise<boolean> =>
      ipcRenderer.invoke('git:commit', id, msg),
    merge: (id: string, msg: string): Promise<string> => ipcRenderer.invoke('git:merge', id, msg),
    discard: (id: string): Promise<string> => ipcRenderer.invoke('git:discard', id),
    pr: (id: string, msg: string): Promise<string> => ipcRenderer.invoke('git:pr', id, msg)
  },
  store: {
    read: <T>(name: 'prefs' | 'projects', fallback: T): Promise<T> =>
      ipcRenderer.invoke('store:read', name, fallback),
    write: (name: 'prefs' | 'projects', data: unknown): Promise<void> =>
      ipcRenderer.invoke('store:write', name, data)
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
