import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { reducedMotion } from './motion'
import { paletteOf, type Palette } from '../../shared/palettes'
import type { Prefs, Theme } from './prefs'
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

// El tema gris en uso, según el modo ya resuelto.
export function usePalette(): Palette {
  const dark = useDark()
  const id = useStore((s) => (dark ? s.prefs.darkPalette : s.prefs.lightPalette))
  return paletteOf(id, dark)
}

// Los tokens del tema encima de los de styles.css (que son los de Grafito y Tiza).
export function paintPalette(p: Palette): void {
  const root = document.documentElement
  root.dataset.theme = p.dark ? 'dark' : 'light'
  const t = p.tokens
  // accent, border y muted-foreground llevan debajo el ajuste de contraste (styles.css).
  for (const [name, value] of Object.entries({
    background: t.background,
    sidebar: t.sidebar,
    popover: t.popover,
    'accent-base': t.accent,
    'border-base': t.border,
    'muted-base': t.muted,
    foreground: t.foreground
  }))
    root.style.setProperty(`--${name}`, value)
}

// Contraste, transparencia y velocidad de los paneles: variables del documento.
export function applyLook(p: Pick<Prefs, 'contrast' | 'solid' | 'panelMs'>): void {
  const root = document.documentElement
  root.style.setProperty('--contrast', String(p.contrast / 100))
  root.style.setProperty('--panel-ms', `${p.panelMs}ms`)
  root.toggleAttribute('data-solid', p.solid)
}

// Se aplica en el acto (no en un efecto): la transición de tema captura la página justo después.
export function applyTheme(): void {
  const { theme, darkPalette, lightPalette, ...look } = getState().prefs
  applyLook(look)
  const dark = resolve(theme, media.matches)
  paintPalette(paletteOf(dark ? darkPalette : lightPalette, dark))
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
// Vale para el modo y para el tema gris de cada modo.
export function setTheme(
  patch: Theme | Partial<Pick<Prefs, 'theme' | 'darkPalette' | 'lightPalette'>>,
  from?: { x: number; y: number }
): void {
  const change = (): void => {
    setPrefs(typeof patch === 'string' ? { theme: patch } : patch)
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
