import { useRef, useSyncExternalStore } from 'react'
import type { Agent, SessionInfo, SessionKind } from '../../shared/types'

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

function setState(patch: Partial<State>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void): (() => void) => (listeners.add(l), () => listeners.delete(l))

// Igualdad de un nivel: dos `filter()` con las mismas sesiones cuentan como el mismo valor.
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return (
    ka.length === kb.length &&
    ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  )
}

// Devuelve el mismo valor mientras lo seleccionado no cambie: así useSyncExternalStore no entra
// en bucle con selectores que crean arrays, y un componente solo se redibuja si le afecta.
export function useStore<T>(pick: (s: State) => T): T {
  const last = useRef<T>(undefined)
  return useSyncExternalStore(subscribe, () => {
    const next = pick(state)
    if (!shallowEqual(last.current, next)) last.current = next
    return last.current as T
  })
}

const { slate } = window
const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path

// Windows no distingue mayúsculas en rutas y a veces sobra la barra final.
const normalize = (path: string): string => path.replace(/[\\/]+$/, '').toLowerCase()
export const samePath = (a: string, b: string): boolean => normalize(a) === normalize(b)

const saveProjects = (projects: Project[]): void => {
  setState({ projects })
  slate.store.write('projects', projects)
}
const patchSession = (id: string, patch: Partial<Session>): void =>
  setState({ sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

// Carga inicial: carpetas guardadas, agentes instalados y las sesiones que siguen vivas en main.
export async function init(): Promise<void> {
  const [projects, agents, sessions] = await Promise.all([
    slate.store.read<Project[]>('projects', []),
    slate.agents.detect(),
    slate.sessions.list()
  ])
  setState({
    projects,
    agents,
    sessions: sessions.map((s) => ({ ...s, unread: false })),
    activeId: sessions[0]?.id ?? null
  })

  const off = slate.sessions.onStatus((id, status) => {
    // "Sin leer" solo marca un "terminó" fuera de la vista; cualquier otro estado lo reemplaza,
    // así el ámbar de "te necesita" y el rojo de error nunca quedan tapados por el azul.
    const current = state.sessions.find((s) => s.id === id)
    const unread = status === 'done' && (!!current?.unread || id !== state.activeId)
    patchSession(id, { status, unread })
  })
  import.meta.hot?.dispose(off)
}

export async function addFolder(): Promise<void> {
  const path = await slate.pickFolder()
  if (!path || state.projects.some((p) => samePath(p.path, path))) return
  saveProjects([...state.projects, { path, name: baseName(path), open: true }])
}

// Quitar una carpeta cierra sus sesiones: si no, seguirían vivas sin forma de verlas.
export function removeFolder(path: string): void {
  state.sessions.filter((s) => samePath(s.cwd, path)).forEach((s) => closeSession(s.id))
  saveProjects(state.projects.filter((p) => !samePath(p.path, path)))
}

export const toggleFolder = (path: string): void =>
  saveProjects(state.projects.map((p) => (samePath(p.path, path) ? { ...p, open: !p.open } : p)))

export async function newSession(cwd: string, kind: SessionKind = 'shell'): Promise<void> {
  const info = await slate.sessions.create(cwd, kind)
  setState({ sessions: [...state.sessions, { ...info, unread: false }], activeId: info.id })
  const project = state.projects.find((p) => samePath(p.path, cwd))
  if (project && !project.open) toggleFolder(cwd)
}

export function selectSession(id: string): void {
  setState({ activeId: id })
  patchSession(id, { unread: false })
}

export function closeSession(id: string): void {
  slate.sessions.close(id)
  const rest = state.sessions.filter((s) => s.id !== id)
  setState({
    sessions: rest,
    activeId: state.activeId === id ? (rest.at(-1)?.id ?? null) : state.activeId
  })
}

export function renameSession(id: string, title: string): void {
  if (!title.trim()) return
  slate.sessions.rename(id, title)
  patchSession(id, { title: title.trim() })
}

export const toggleSidebar = (): void => setState({ sidebar: !state.sidebar })
