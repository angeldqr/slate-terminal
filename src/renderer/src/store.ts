import { useRef, useSyncExternalStore } from 'react'
import type {
  Agent,
  FileChange,
  SessionInfo,
  SessionKind,
  SessionOpts,
  Status,
  UpdateState
} from '../../shared/types'
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
// `since`: cuándo entró en su estado actual (el tablero dice "trabajando desde hace 3 min").
// ponytail: vive en el renderer; las sesiones que vuelven del host empiezan a contar al abrir
// Slate. Guardarlo en el host si hace falta la edad real.
export type Session = SessionInfo & { unread: boolean; since: number }
// Una vista es lo que llena el área del terminal: una sesión sola o varias divididas.
export type View = { id: string; layout: Layout }
// Lo que flota sobre la ventana: la paleta de comandos, el menú de nueva sesión o los ajustes.
export type Overlay = 'palette' | 'new-session' | 'settings' | 'task'

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
  changes: boolean // panel de cambios abierto
  board: boolean // tablero con todas las sesiones a la vista
  diffStats: Record<string, { add: number; del: number }> // último conteo por sesión
  update: UpdateState
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
  prefs: DEFAULT_PREFS,
  changes: false,
  board: false,
  diffStats: {},
  update: { status: 'idle' }
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
export const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path

// Windows no distingue mayúsculas en rutas y a veces sobra la barra final.
const normalize = (path: string): string => path.replace(/[\\/]+$/, '').toLowerCase()
export const samePath = (a: string, b: string): boolean => normalize(a) === normalize(b)

// La carpeta de la barra lateral a la que pertenece: las sesiones aisladas viven en su worktree,
// pero se agrupan bajo la carpeta desde la que salieron.
export const folderOf = (s: SessionInfo): string => s.worktree?.project ?? s.cwd

// El error tal como lo escribió main, sin el envoltorio que le pone Electron al cruzar IPC.
export const reason = (err: unknown): string =>
  String((err as Error)?.message ?? err).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

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

type SavedLayout = { views: View[]; activeId: string | null }

// Las vistas guardadas, sin las sesiones que ya no existen; las que no estaban en ninguna (o
// llegaron después) van cada una a su vista.
function restoreViews(saved: View[], ids: string[]): View[] {
  const views = saved.flatMap((v) => {
    let layout: Layout | null = v.layout
    for (const leaf of leaves(v.layout))
      if (layout && !ids.includes(leaf)) layout = remove(layout, leaf)
    return layout ? [{ ...v, layout }] : []
  })
  const placed = new Set(views.flatMap((v) => leaves(v.layout)))
  return [...views, ...ids.filter((id) => !placed.has(id)).map(newView)]
}

// La disposición se guarda cuando se calma: al volver a abrir Slate, las sesiones que siguieron
// vivas en el host aparecen como estaban, divididas igual y con la misma activa.
let savedViews: View[] | null = null
let savedActive: string | null = null
let pendingLayout: ReturnType<typeof setTimeout> | undefined
function saveLayout(): void {
  if (state.views === savedViews && state.activeId === savedActive) return
  savedViews = state.views
  savedActive = state.activeId
  clearTimeout(pendingLayout)
  pendingLayout = setTimeout(
    () => slate.store.write('layout', { views: state.views, activeId: state.activeId }),
    300
  )
}

// Carga inicial: carpetas guardadas, agentes instalados y las sesiones vivas (las que se crean y
// las que el host mantuvo con Slate cerrado), en la disposición que tenían.
export async function init(): Promise<void> {
  const [projects, agents, sessions, prefs, layout, restored] = await Promise.all([
    slate.store.read<Project[]>('projects', []),
    slate.agents.detect(),
    slate.sessions.list(),
    slate.store.read<Partial<Prefs>>('prefs', {}),
    slate.store.read<SavedLayout | null>('layout', null),
    slate.sessions.restored()
  ])
  const ids = sessions.map((s) => s.id)
  const views = restoreViews(layout?.views ?? [], ids)
  setState({
    // Lo guardado encima de los valores por defecto: una preferencia nueva no rompe un prefs.json viejo.
    prefs: { ...DEFAULT_PREFS, ...prefs },
    projects,
    agents,
    sessions: sessions.map((s) => ({ ...s, unread: false, since: Date.now() })),
    views,
    activeId: layout?.activeId && ids.includes(layout.activeId) ? layout.activeId : (ids[0] ?? null)
  })
  savedViews = state.views
  savedActive = state.activeId
  listeners.add(saveLayout)
  // Solo al abrir Slate con sesiones que siguieron vivas; recargar la ventana no es volver.
  if (restored) {
    flashHint(
      restored === 1
        ? 'Volvió la sesión que seguía abierta'
        : `Volvieron las ${restored} sesiones que seguían abiertas`
    )
  }

  const off = slate.sessions.onStatus((id, status) => {
    // "Sin leer" solo marca un "terminó" fuera de la vista activa; cualquier otro estado lo
    // reemplaza, así el ámbar de "te necesita" y el rojo de error nunca quedan tapados por el azul.
    const current = state.sessions.find((s) => s.id === id)
    // Aún no llegó al store: newSession la añade con su estado; una lanzada por MCP puede cambiar
    // antes de que llegue el aviso, así que se guarda para aplicarlo al adoptarla.
    if (!current) return void early.set(id, status)
    const visible = viewOf(state, state.activeId) === viewOf(state, id)
    const unread = status === 'done' && (current.unread || !visible)
    patchSession(id, {
      status,
      unread,
      since: status === current.status ? current.since : Date.now()
    })
    notifyIfAway(current, status)
  })
  // Al pulsar el aviso del sistema, Slate vuelve al frente con esa sesión.
  const offClick = slate.onNotifyClick(
    (id) => state.sessions.some((s) => s.id === id) && selectSession(id)
  )
  const offAdopted = slate.sessions.onAdopted(adoptSessions)
  // Una versión nueva se anuncia una vez; el resto se ve en Ajustes › Actualizaciones.
  slate.update.state().then((update) => setState({ update }))
  const offUpdate = slate.update.onState((update) => {
    if (update.status === 'available' && state.update.status !== 'available') {
      flashHint(`Hay una versión nueva de Slate: ${update.version}`)
    }
    setState({ update })
  })
  import.meta.hot?.dispose(() => (off(), offClick(), offAdopted(), offUpdate()))
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
  state.sessions.filter((s) => samePath(folderOf(s), path)).forEach((s) => closeSession(s.id))
  saveProjects(state.projects.filter((p) => !samePath(p.path, path)))
}

export const toggleFolder = (path: string): void =>
  saveProjects(state.projects.map((p) => (samePath(p.path, path) ? { ...p, open: !p.open } : p)))

// Con `beside`, la sesión nueva se abre junto a esa sesión (a la derecha o abajo) en su vista.
// Devuelve su id, o null si no se pudo abrir (el motivo se muestra en la barra superior).
export async function newSession(
  cwd: string,
  kind: SessionKind = 'shell',
  beside?: { id: string; dir: Dir },
  opts?: SessionOpts
): Promise<string | null> {
  let info: SessionInfo
  try {
    info = await slate.sessions.create(cwd, kind, opts)
  } catch (err) {
    flashHint(reason(err))
    return null
  }
  const targetView = beside && viewOf(state, beside.id)
  setState({
    sessions: [...state.sessions, { ...info, unread: false, since: Date.now() }],
    views: targetView
      ? patchView(targetView.id, (layout) => split(layout, beside.id, info.id, beside.dir))
      : [...state.views, newView(info.id)],
    activeId: info.id
  })
  const project = state.projects.find((p) => samePath(p.path, cwd))
  if (project && !project.open) toggleFolder(cwd)
  return info.id
}

// Nueva tarea: la misma tarea a uno o varios agentes, todos en una vista dividida para compararlos.
// Se reparten en rejilla: el 2.º a la derecha del 1.º, el 3.º debajo del 2.º, el 4.º debajo del 1.º…
const GRID: { from: number; dir: Dir }[] = [
  { from: 0, dir: 'row' },
  { from: 1, dir: 'col' },
  { from: 0, dir: 'col' }
]
const early = new Map<string, Status>()

// Sesiones que otro agente abrió por MCP: llegan ya creadas y se juntan en una vista nueva, en la
// misma rejilla que Nueva tarea. El foco se queda donde estaba: la barra superior avisa.
export function adoptSessions(infos: SessionInfo[], parent: string): void {
  const fresh = infos.filter((x) => !state.sessions.some((s) => s.id === x.id))
  if (!fresh.length) return
  let layout = pane(fresh[0].id)
  fresh.slice(1).forEach((x, i) => {
    const place = GRID[i % GRID.length]
    layout = split(layout, fresh[place.from]?.id ?? fresh[0].id, x.id, place.dir)
  })
  setState({
    sessions: [
      ...state.sessions,
      ...fresh.map((x) => ({
        ...x,
        status: early.get(x.id) ?? x.status,
        unread: false,
        since: Date.now()
      }))
    ],
    views: [...state.views, { id: crypto.randomUUID(), layout }],
    // Un agente que despliega a varios: el tablero los muestra arrancar (sin quitar el foco).
    ...(fresh.length > 1 && { board: true })
  })
  fresh.forEach((x) => early.delete(x.id))
  const who = state.sessions.find((s) => s.id === parent)?.title ?? 'Un agente'
  flashHint(
    fresh.length === 1 ? `${who} abrió ${fresh[0].title}` : `${who} lanzó ${fresh.length} agentes`
  )
}

// Varias tareas a la vez: cada una en su vista, con sus agentes en rejilla, y el tablero se abre
// para verlas arrancar. Se lanzan en orden; si una falla, las anteriores siguen.
export async function launchTasks(
  cwd: string,
  prompts: string[],
  kinds: SessionKind[],
  isolate: boolean
): Promise<void> {
  // Copias de una sola tarea se comparan en su vista dividida; el tablero es para varias tareas.
  if (prompts.length > 1) setState({ board: true })
  for (const prompt of prompts) await launchTask(cwd, prompt, kinds, isolate)
}

export async function launchTask(
  cwd: string,
  prompt: string,
  kinds: SessionKind[],
  isolate: boolean
): Promise<void> {
  const ids: string[] = []
  for (const [i, kind] of kinds.entries()) {
    const place = i > 0 ? GRID[(i - 1) % GRID.length] : undefined
    const beside = place && ids[place.from] ? { id: ids[place.from], dir: place.dir } : undefined
    const id = await newSession(cwd, kind, beside, { isolate, prompt })
    if (!id) return // el motivo ya está a la vista; no se abren las demás a medias
    ids.push(id)
  }
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
  const diffStats = { ...state.diffStats }
  delete diffStats[id] // sus cuentas ya no sirven
  setState({
    sessions,
    views,
    diffStats,
    activeId: state.activeId === id ? (neighbour ?? sessions.at(-1)?.id ?? null) : state.activeId
  })
}

// Abre una shell nueva junto a esta sesión, en su carpeta de la barra lateral.
// ponytail: junto a una sesión aislada abre en el repo principal, no en su rama; abrirla en la
// rama pide que main acepte un worktree existente.
export function splitSession(id: string, dir: Dir): void {
  const folder = folderOfId(state, id)
  if (folder) newSession(folder, 'shell', { id, dir })
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
export const toggleChanges = (): void => setState({ changes: !state.changes })
export const toggleBoard = (): void => setState({ board: !state.board })

// Lo añadido o lo quitado en total, de una lista de archivos cambiados.
export const sum = (files: FileChange[], key: 'add' | 'del'): number =>
  files.reduce((total, f) => total + f[key], 0)

// Te necesita: pide algo o falló.
export const needsYou = (status: Status): boolean => status === 'attention' || status === 'error'

// Desde el tablero: la sesión elegida pasa a la vista y el tablero se cierra.
export function openFromBoard(id: string): void {
  selectSession(id)
  setState({ board: false })
}

export function setDiffStats(id: string, add: number, del: number): void {
  const prev = state.diffStats[id]
  if (prev?.add === add && prev.del === del) return
  setState({ diffStats: { ...state.diffStats, [id]: { add, del } } })
}

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

const inProject = (s: State, x: Session): boolean =>
  s.projects.some((p) => samePath(p.path, folderOf(x)))

// El orden exacto de la barra lateral: Ctrl+1…9 salta a la sesión que ves en esa posición.
export const sidebarOrder = (s: State): Session[] => [
  ...s.projects.flatMap((p) =>
    p.open
      ? groupByView(
          s,
          s.sessions.filter((x) => samePath(folderOf(x), p.path))
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
  folderOfId(s, s.activeId) ?? s.projects[0]?.path

const folderOfId = (s: State, id: string | null): string | undefined => {
  const session = s.sessions.find((x) => x.id === id)
  return session && folderOf(session)
}

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
