import { flushSync } from 'react-dom'
import { createBlendy, type Blendy } from 'blendy'

// Transiciones "morph" con Blendy: el botón que abre algo se transforma en lo que abre.
// Origen: `data-blendy-from="id"`; destino: `data-blendy-to="id"`, con un único hijo envoltorio.
let blendy: Blendy | null = null
const open = new Set<string>()

export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

// Sin botón visible no hay de dónde salir: barra lateral plegada (inerte, recortada a 0 px) o
// barra superior escondida (opacidad 0). Entonces se abre con un fundido corto.
const sourceVisible = (id: string): boolean => {
  const el = document.querySelector<HTMLElement>(`[data-blendy-from="${id}"]`)
  return (
    !!el?.offsetWidth &&
    !el.closest('[inert]') &&
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  )
}

// Entrada sin morph: crece un poco desde el 97 % mientras aparece.
function popIn(id: string): void {
  if (reducedMotion()) return
  document
    .querySelector(`[data-blendy-to="${id}"]`)
    ?.animate(
      { opacity: [0, 1], transform: ['scale(0.97) translateY(4px)', 'none'] },
      { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
}

// Se crea cuando los botones de origen ya están en el DOM.
export function initMotion(): void {
  blendy = createBlendy({ animation: 'dynamic' })
}

// Monta el destino de forma síncrona y lo anima desde su botón.
export function morphOpen(id: string, show: () => void): void {
  flushSync(show)
  if (!blendy || reducedMotion() || !sourceVisible(id)) return popIn(id)
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
