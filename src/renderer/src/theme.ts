import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { reducedMotion } from './motion'
import type { Theme } from './prefs'
import { getState, setPrefs, useStore } from './store'

const media = matchMedia('(prefers-color-scheme: dark)')
const subscribeSystem = (l: () => void): (() => void) => (
  media.addEventListener('change', l),
  () => media.removeEventListener('change', l)
)

const resolve = (theme: Theme, systemDark: boolean): boolean =>
  theme === 'auto' ? systemDark : theme === 'dark'

// Oscuro o claro ya resuelto, siguiendo al sistema en "Automático".
export function useDark(): boolean {
  const theme = useStore((s) => s.prefs.theme)
  return resolve(
    theme,
    useSyncExternalStore(subscribeSystem, () => media.matches)
  )
}

// Se aplica en el acto (no en un efecto): la transición de tema captura la página justo después.
export function applyTheme(): void {
  document.documentElement.dataset.theme = resolve(getState().prefs.theme, media.matches)
    ? 'dark'
    : 'light'
}

// "Automático" sigue al sistema también con Slate abierto.
export function watchSystemTheme(): () => void {
  return subscribeSystem(applyTheme)
}

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' }
]

// El tema nuevo se revela en un círculo que crece desde donde se pidió (o desde el centro).
export function setTheme(theme: Theme, from?: { x: number; y: number }): void {
  const change = (): void => {
    setPrefs({ theme })
    applyTheme()
  }
  if (!document.startViewTransition || reducedMotion()) return change()
  const { x, y } = from ?? { x: innerWidth / 2, y: innerHeight / 2 }
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  document
    .startViewTransition(() => flushSync(change))
    .ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 520,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      )
    )
    .catch(() => {}) // otra transición la interrumpió: el tema ya cambió igual
}

// La paleta rota entre los tres.
export function cycleTheme(): void {
  const i = THEMES.findIndex((t) => t.id === getState().prefs.theme)
  setTheme(THEMES[(i + 1) % THEMES.length].id)
}
