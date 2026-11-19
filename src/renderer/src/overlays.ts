import { morphClose, morphOpen } from './motion'
import { getState, setOverlay, type Overlay } from './store'
import { terminals } from './terminals'

// Cada apertura o cierre invalida lo que quedaba pendiente de los anteriores: si mientras una capa
// vuelve a su botón el usuario abre otra, la animación vieja no la cierra ni reabre nada al terminar.
let turn = 0

// Abre una capa (paleta, menú de nueva sesión o ajustes) con su morph; solo una a la vez.
// Si hay otra abierta, primero vuelve a su botón: si no, Blendy dejaría ese botón invisible.
function openOverlay(which: Overlay): void {
  const current = getState().overlay
  if (current === which) return closeOverlay()
  const mine = ++turn
  const open = (): void => {
    if (mine === turn) morphOpen(which, () => setOverlay(which))
  }
  if (current) morphClose(current, () => (setOverlay(null), open()))
  else open()
}

// Al terminar de cerrar, el foco vuelve al terminal activo para seguir escribiendo sin el ratón,
// salvo que algo lo haya tomado mientras tanto (la barra de búsqueda que abrió una acción).
export function closeOverlay(): void {
  const current = getState().overlay
  if (!current) return
  const mine = ++turn
  morphClose(current, () => {
    if (mine !== turn) return
    setOverlay(null)
    const focused = document.activeElement
    if (focused && focused !== document.body) return
    const id = getState().activeId
    if (id) terminals.get(id)?.focus()
  })
}

export const openPalette = (): void => openOverlay('palette')
export const openNewSessionMenu = (): void => openOverlay('new-session')
export const openSettings = (): void => openOverlay('settings')
