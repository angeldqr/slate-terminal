import { flushSync } from 'react-dom'
import { createBlendy, type Blendy } from 'blendy'

// Transiciones "morph" con Blendy: el botón que abre algo se transforma en lo que abre.
// Origen: `data-blendy-from="id"`; destino: `data-blendy-to="id"`, con un único hijo envoltorio.
let blendy: Blendy | null = null
const open = new Set<string>()

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

// Sin botón visible no hay de dónde salir (p. ej. con la barra lateral plegada): se abre sin morph.
const sourceVisible = (id: string): boolean =>
  !!document.querySelector<HTMLElement>(`[data-blendy-from="${id}"]`)?.offsetWidth

// Se crea cuando los botones de origen ya están en el DOM.
export function initMotion(): void {
  blendy = createBlendy({ animation: 'dynamic' })
}

// Monta el destino de forma síncrona y lo anima desde su botón.
export function morphOpen(id: string, show: () => void): void {
  flushSync(show)
  if (!blendy || reducedMotion() || !sourceVisible(id)) return
  blendy.update() // por si el botón de origen apareció después de crear Blendy
  blendy.toggle(id)
  open.add(id)
}

// Lo devuelve a su botón y lo desmonta al terminar. Si Blendy no lo abrió, se desmonta directamente:
// Blendy nunca llamaría al callback de algo que no animó.
// Espera un frame porque Blendy marca lo abierto en el siguiente: cerrar en el mismo se perdería.
export function morphClose(id: string, hide: () => void): void {
  if (!blendy || !open.delete(id)) return hide()
  requestAnimationFrame(() => blendy!.untoggle(id, hide))
}
