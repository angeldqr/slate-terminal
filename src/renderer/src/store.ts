import { useRef, useSyncExternalStore } from 'react'
import type { Agent, SessionInfo } from '../../shared/types'

export type Project = { path: string; name: string; open: boolean }
export type Session = SessionInfo & { unread: boolean }

type State = {
  projects: Project[]
  sessions: Session[]
  agents: Agent[]
  activeId: string | null
  sidebar: boolean
}

let state: State = { projects: [], sessions: [], agents: [], activeId: null, sidebar: true }
const listeners = new Set<() => void>()

function set(patch: Partial<State>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void): (() => void) => (listeners.add(l), () => listeners.delete(l))

// El selector solo se recalcula si cambió el estado: un `filter()` devolvería un array nuevo
// en cada render y useSyncExternalStore entraría en un bucle infinito.
export function useStore<T>(pick: (s: State) => T): T {
  const cache = useRef<{ state?: State; value?: T }>({})
  return useSyncExternalStore(subscribe, () => {
    if (cache.current.state !== state) cache.current = { state, value: pick(state) }
    return cache.current.value as T
  })
}

export const getState = (): State => state

const { slate } = window
const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path
const saveProjects = (projects: Project[]): void => {
  set({ projects })
  slate.store.write('projects', projects)
}
const patchSession = (id: string, patch: Partial<Session>): void =>
  set({ sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

// Carga inicial: carpetas guardadas, agentes instalados y las sesiones que siguen vivas en main.
export async function init(): Promise<void> {
  const [projects, agents, sessions] = await Promise.all([
    slate.store.read<Project[]>('projects', []),
    slate.agents.detect(),
    slate.sessions.list()
  ])
  set({
    projects,
    agents,
    sessions: sessions.map((s) => ({ ...s, unread: false })),
    activeId: sessions[0]?.id ?? null
  })

  slate.sessions.onStatus((id, status) => {
    // "Terminó" fuera de la vista queda sin leer hasta que el usuario la abra.
    const unread = (status === 'done' || status === 'error') && id !== state.activeId
    patchSession(id, { status, ...(unread && { unread: true }) })
  })
}

export async function addFolder(): Promise<void> {
  const path = await slate.pickFolder()
  if (!path || state.projects.some((p) => p.path === path)) return
  saveProjects([...state.projects, { path, name: baseName(path), open: true }])
}

export const removeFolder = (path: string): void =>
  saveProjects(state.projects.filter((p) => p.path !== path))

export const toggleFolder = (path: string): void =>
  saveProjects(state.projects.map((p) => (p.path === path ? { ...p, open: !p.open } : p)))

export async function newSession(cwd: string, kind = 'shell'): Promise<void> {
  const info = await slate.sessions.create(cwd, kind)
  set({ sessions: [...state.sessions, { ...info, unread: false }], activeId: info.id })
  const project = state.projects.find((p) => p.path === cwd)
  if (project && !project.open) toggleFolder(cwd)
}

export function select(id: string): void {
  set({ activeId: id })
  patchSession(id, { unread: false })
}

export function closeSession(id: string): void {
  slate.sessions.close(id)
  const rest = state.sessions.filter((s) => s.id !== id)
  set({
    sessions: rest,
    activeId: state.activeId === id ? (rest.at(-1)?.id ?? null) : state.activeId
  })
}

export function renameSession(id: string, title: string): void {
  if (!title.trim()) return
  slate.sessions.rename(id, title)
  patchSession(id, { title: title.trim() })
}

export const toggleSidebar = (): void => set({ sidebar: !state.sidebar })
