import { useRef, useSyncExternalStore } from 'react'
import type { Agent, SessionInfo, SessionKind, Status } from '../../shared/types'
import { DEFAULT_PREFS, type Prefs } from './prefs'
import {
  leaves,
  pane,
  remove,
  setRatio,
  sibling,
  split,
  type Dir,
  type Layout,
  type Path
} from './layout'

export type Project = { path: string; name: string; open: boolean }
export type Session = SessionInfo & { unread: boolean }
// Una vista es lo que llena el área del terminal: una sesión sola o varias divididas.
export type View = { id: string; layout: Layout }
// Lo que flota sobre la ventana: la paleta de comandos, el menú de nueva sesión o los ajustes.
export type Overlay = 'palette' | 'new-session' | 'settings'

type State = {
  projects: Project[]
  sessions: Session[]
  views: View[]
  agents: Agent[]
  activeId: string | null
  sidebar: boolean
  overlay: Overlay | null
  hint: string | null
  prefs: Prefs
}

let state: State = {
  projects: [],
  sessions: [],
  views: [],
  agents: [],
  activeId: null,
  sidebar: true,
  overlay: null,
  hint: null,
  prefs: DEFAULT_PREFS
}
const listeners = new Set<() => void>()

function setState(patch: Partial<State>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

// Para lo que vive fuera de React (atajos, menús): leer el estado sin suscribirse.
export const getState = (): State => state

const subscribe = (l: () => void): (() => void) => (listeners.add(l), () => listeners.delete(l))

// Igualdad de selección: los arrays se comparan elemento a elemento a cualquier profundidad
// (`groupByView` devuelve arrays de arrays) y los objetos, campo a campo por identidad.
// Así dos selecciones con las mismas sesiones cuentan como el mismo valor.
function sameSelection(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameSelection(x, b[i]))
  }
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
    if (!sameSelection(last.current, next)) last.current = next
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

export const viewOf = (s: State, sessionId: string | null): View | undefined =>
  s.views.find((v) => sessionId && leaves(v.layout).includes(sessionId))

// La sesión comparte su vista con otras (está en una división).
export const isShared = (s: State, sessionId: string): boolean =>
  leaves(viewOf(s, sessionId)?.layout ?? pane(sessionId)).length > 1

const patchView = (viewId: string, change: (layout: Layout) => Layout): View[] =>
  state.views.map((v) => (v.id === viewId ? { ...v, layout: change(v.layout) } : v))

const newView = (sessionId: string): View => ({ id: crypto.randomUUID(), layout: pane(sessionId) })

// ponytail: la disposición de las vistas no se guarda; al recargar cada sesión vuelve a su propia
// vista. Se guarda cuando el host mantenga las sesiones vivas entre reinicios (roadmap).
// Carga inicial: carpetas guardadas, agentes instalados y las sesiones que siguen vivas en main.
export async function init(): Promise<void> {
  const [projects, agents, sessions, prefs] = await Promise.all([
    slate.store.read<Project[]>('projects', []),
    slate.agents.detect(),
    slate.sessions.list(),
    slate.store.read<Partial<Prefs>>('prefs', {})
  ])
  setState({
    // Lo guardado encima de los valores por defecto: una preferencia nueva no rompe un prefs.json viejo.
    prefs: { ...DEFAULT_PREFS, ...prefs },
    projects,
    agents,
    sessions: sessions.map((s) => ({ ...s, unread: false })),
    views: sessions.map((s) => newView(s.id)),
    activeId: sessions[0]?.id ?? null
  })

  const off = slate.sessions.onStatus((id, status) => {
    // "Sin leer" solo marca un "terminó" fuera de la vista activa; cualquier otro estado lo
    // reemplaza, así el ámbar de "te necesita" y el rojo de error nunca quedan tapados por el azul.
    const current = state.sessions.find((s) => s.id === id)
    if (!current) return // aún no llegó al store; newSession la añade con su estado
    const visible = viewOf(state, state.activeId) === viewOf(state, id)
    const unread = status === 'done' && (current.unread || !visible)
    patchSession(id, { status, unread })
    notifyIfAway(current, status)
  })
  // Al pulsar el aviso del sistema, Slate vuelve al frente con esa sesión.
  const offClick = slate.onNotifyClick(
    (id) => state.sessions.some((s) => s.id === id) && selectSession(id)
  )
  import.meta.hot?.dispose(() => (off(), offClick()))
}

// Aviso del sistema cuando una sesión te necesita o termina mientras miras otra ventana.
function notifyIfAway(s: Session, status: Status): void {
  const { notify, sound } = state.prefs
  if (!notify || document.hasFocus() || (status !== 'attention' && status !== 'done')) return
  const title = status === 'attention' ? `${s.title} te necesita` : `${s.title} terminó`
  slate.notify({ id: s.id, title, body: baseName(s.cwd), silent: !sound })
}

export const testNotification = (): void =>
  slate.notify({
    id: '',
    title: 'Así te avisará Slate',
    body: 'Cuando un agente te necesite o termine y estés en otra ventana.',
    silent: !state.prefs.sound
  })

// Se aplica al momento y se guarda cuando se calma: un deslizador no escribe el archivo en cada paso.
// La bandeja y el tema se guardan en el acto: main los lee, y cerrar justo después debe contar.
let pendingPrefs: ReturnType<typeof setTimeout> | undefined
function savePrefs(): void {
  clearTimeout(pendingPrefs)
  pendingPrefs = undefined
  slate.store.write('prefs', state.prefs)
}
addEventListener('beforeunload', () => pendingPrefs && savePrefs())

export function setPrefs(patch: Partial<Prefs>): void {
  setState({ prefs: { ...state.prefs, ...patch } })
  clearTimeout(pendingPrefs)
  if ('tray' in patch || 'theme' in patch) return savePrefs()
  pendingPrefs = setTimeout(savePrefs, 200)
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

// Con `beside`, la sesión nueva se abre junto a esa sesión (a la derecha o abajo) en su vista.
export async function newSession(
  cwd: string,
  kind: SessionKind = 'shell',
  beside?: { id: string; dir: Dir }
): Promise<void> {
  let info: SessionInfo
  try {
    info = await slate.sessions.create(cwd, kind)
  } catch (err) {
    console.error('No se pudo abrir la sesión:', err)
    return
  }
  const targetView = beside && viewOf(state, beside.id)
  setState({
    sessions: [...state.sessions, { ...info, unread: false }],
    views: targetView
      ? patchView(targetView.id, (layout) => split(layout, beside.id, info.id, beside.dir))
      : [...state.views, newView(info.id)],
    activeId: info.id
  })
  const project = state.projects.find((p) => samePath(p.path, cwd))
  if (project && !project.open) toggleFolder(cwd)
}

// Al mostrar una vista, todas sus sesiones quedan vistas, no solo la que recibe el foco.
export function selectSession(id: string): void {
  const shown = leaves(viewOf(state, id)?.layout ?? pane(id))
  setState({
    activeId: id,
    sessions: state.sessions.map((s) => (shown.includes(s.id) ? { ...s, unread: false } : s))
  })
}

// Saca una sesión de su vista; si la vista queda vacía, desaparece.
const detach = (views: View[], id: string): View[] =>
  views.flatMap((v) => {
    const layout = remove(v.layout, id)
    return layout ? [{ ...v, layout }] : []
  })

export function closeSession(id: string): void {
  slate.sessions.close(id)
  const view = viewOf(state, id)
  const views = detach(state.views, id)
  // Al cerrar la activa, el foco pasa a su vecina en la vista; si no queda ninguna, a la última sesión.
  const neighbour = view && sibling(view.layout, id)
  const sessions = state.sessions.filter((s) => s.id !== id)
  setState({
    sessions,
    views,
    activeId: state.activeId === id ? (neighbour ?? sessions.at(-1)?.id ?? null) : state.activeId
  })
}

// Abre una shell nueva junto a esta sesión, en su misma carpeta.
export function splitSession(id: string, dir: Dir): void {
  const session = state.sessions.find((s) => s.id === id)
  if (session) newSession(session.cwd, 'shell', { id, dir })
}

// Trae una sesión que ya existe junto al panel activo, sacándola de su vista.
export function placeBeside(id: string, dir: Dir): void {
  const target = state.activeId
  if (!target || target === id) return
  const views = detach(state.views, id)
  setState({
    views: views.map((v) =>
      leaves(v.layout).includes(target) ? { ...v, layout: split(v.layout, target, id, dir) } : v
    ),
    activeId: id
  })
}

export function moveToOwnView(id: string): void {
  setState({ views: [...detach(state.views, id), newView(id)], activeId: id })
}

export const resizeSplit = (viewId: string, path: Path, ratio: number): void =>
  setState({ views: patchView(viewId, (layout) => setRatio(layout, path, ratio)) })

export function renameSession(id: string, title: string): void {
  if (!title.trim()) return
  slate.sessions.rename(id, title)
  patchSession(id, { title: title.trim() })
}

export const toggleSidebar = (): void => setState({ sidebar: !state.sidebar })

export const setOverlay = (overlay: Overlay | null): void => setState({ overlay })

// Aviso breve en la barra de título; se borra solo.
let hintTimer: ReturnType<typeof setTimeout> | undefined
export function flashHint(hint: string): void {
  clearTimeout(hintTimer)
  setState({ hint })
  hintTimer = setTimeout(() => setState({ hint: null }), 2500)
}

// Agrupa sesiones por vista en el orden en que aparecen: así se muestran en la barra lateral.
export function groupByView(s: State, sessions: Session[]): Session[][] {
  const groups = new Map<string, Session[]>()
  for (const x of sessions) {
    const key = viewOf(s, x.id)?.id ?? x.id
    groups.set(key, [...(groups.get(key) ?? []), x])
  }
  return [...groups.values()]
}

const inProject = (s: State, x: Session): boolean => s.projects.some((p) => samePath(p.path, x.cwd))

// El orden exacto de la barra lateral: Ctrl+1…9 salta a la sesión que ves en esa posición.
export const sidebarOrder = (s: State): Session[] => [
  ...s.projects.flatMap((p) =>
    p.open
      ? groupByView(
          s,
          s.sessions.filter((x) => samePath(x.cwd, p.path))
        ).flat()
      : []
  ),
  ...groupByView(
    s,
    s.sessions.filter((x) => !inProject(s, x))
  ).flat()
]

// La carpeta donde abrir algo nuevo: la de la sesión activa o, si no hay, la primera.
export const currentFolder = (s: State): string | undefined =>
  s.sessions.find((x) => x.id === s.activeId)?.cwd ?? s.projects[0]?.path

export function selectByIndex(index: number): void {
  const target = sidebarOrder(state)[index]
  if (target) selectSession(target.id)
}

export function cycleView(step: 1 | -1): void {
  if (state.views.length < 2) return
  const current = state.views.findIndex((v) => v === viewOf(state, state.activeId))
  const next = state.views[(current + step + state.views.length) % state.views.length]
  selectSession(leaves(next.layout)[0])
}

// Salta a la siguiente sesión que te necesita, en el orden de la barra lateral.
export function nextNeedingYou(): void {
  const order = sidebarOrder(state)
  const from = order.findIndex((x) => x.id === state.activeId)
  const rotated = [...order.slice(from + 1), ...order.slice(0, from + 1)]
  const target = rotated.find((x) => x.status === 'attention')
  if (target) selectSession(target.id)
  else flashHint('Ninguna sesión te necesita ahora')
}

// Cerrar con el teclado: si el agente trabaja, hay que repetir el atajo para confirmarlo.
let closeArmedFor: string | null = null
let closeArmTimer: ReturnType<typeof setTimeout> | undefined
export function closeActive(again: string): void {
  const active = state.sessions.find((x) => x.id === state.activeId)
  if (!active) return
  if (active.status === 'working' && closeArmedFor !== active.id) {
    closeArmedFor = active.id
    flashHint(`Está trabajando. Pulsa ${again} otra vez para cerrarla.`)
    clearTimeout(closeArmTimer)
    closeArmTimer = setTimeout(() => (closeArmedFor = null), 2500)
    return
  }
  closeArmedFor = null
  closeSession(active.id)
}
