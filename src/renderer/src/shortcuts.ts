import {
  ArrowsLeftRightIcon,
  BellSimpleIcon,
  ClipboardTextIcon,
  SquareSplitHorizontalIcon,
  CopySimpleIcon,
  GearSixIcon,
  GitDiffIcon,
  SidebarSimpleIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SquareSplitVerticalIcon,
  SquaresFourIcon,
  MagnifyingGlassIcon,
  TerminalWindowIcon,
  XIcon,
  type Icon
} from '@phosphor-icons/react'
import { comboOf } from './keys'
import {
  closeActive,
  currentFolder,
  cycleView,
  getState,
  useStore,
  newSession,
  nextNeedingYou,
  selectByIndex,
  splitSession,
  toggleBoard,
  toggleChanges,
  toggleSidebar
} from './store'
import { terminals } from './terminals'
import { openNewSessionMenu, openPalette, openSettings, openTask } from './overlays'

export const isMac = navigator.userAgent.includes('Mac')

// En Windows y Linux todas las acciones van con Ctrl+Shift: Ctrl más una letra es del terminal
// (Ctrl+W borra una palabra, Ctrl+K la línea; Claude Code usa Ctrl+B y Ctrl+T…). Slate solo toma
// Ctrl+Tab, Ctrl+1…9 y Ctrl+, (ajustes), que las shells no usan. En Mac van con Cmd, que el
// terminal no usa.
export type Shortcut = {
  id: string
  label: string
  win: string
  mac: string
  run: () => void
  icon?: Icon
  danger?: boolean // destructiva: va al final de la paleta y en rojo
  inPalette?: boolean // false: no aparece como acción en la paleta
}

const active = (): string | null => getState().activeId
const onActiveTerminal = (action: 'copy' | 'paste' | 'find') => () => {
  const id = active()
  if (id) terminals.get(id)?.[action]()
}

export const SHORTCUTS: Shortcut[] = [
  {
    id: 'palette',
    label: 'Paleta de comandos',
    win: 'Ctrl+Shift+P',
    mac: 'Cmd+K',
    run: openPalette,
    inPalette: false
  },
  {
    id: 'new-shell',
    label: 'Nueva shell',
    win: 'Ctrl+Shift+T',
    mac: 'Cmd+T',
    icon: TerminalWindowIcon,
    run: () => {
      const folder = currentFolder(getState())
      if (folder) newSession(folder)
    },
    inPalette: false // la paleta ya la muestra en su grupo de nueva sesión
  },
  {
    id: 'new-session',
    label: 'Nueva sesión…',
    win: 'Ctrl+Shift+N',
    mac: 'Cmd+N',
    icon: PlusIcon,
    run: openNewSessionMenu
  },
  {
    id: 'task',
    label: 'Nueva tarea…',
    win: 'Ctrl+Shift+A',
    mac: 'Cmd+Shift+A',
    icon: PaperPlaneTiltIcon,
    run: openTask
  },
  {
    id: 'split-right',
    label: 'Dividir a la derecha',
    win: 'Ctrl+Shift+D',
    mac: 'Cmd+D',
    icon: SquareSplitHorizontalIcon,
    run: () => active() && splitSession(active()!, 'row')
  },
  {
    id: 'split-down',
    label: 'Dividir abajo',
    win: 'Ctrl+Shift+E',
    mac: 'Cmd+Shift+D',
    icon: SquareSplitVerticalIcon,
    run: () => active() && splitSession(active()!, 'col')
  },
  {
    id: 'find',
    label: 'Buscar en el terminal',
    win: 'Ctrl+Shift+F',
    mac: 'Cmd+F',
    icon: MagnifyingGlassIcon,
    run: onActiveTerminal('find')
  },
  {
    id: 'next-attention',
    label: 'Siguiente sesión que te necesita',
    win: 'Ctrl+Shift+J',
    mac: 'Cmd+J',
    icon: BellSimpleIcon,
    run: nextNeedingYou
  },
  {
    id: 'next-view',
    label: 'Vista siguiente',
    win: 'Ctrl+Tab',
    mac: 'Ctrl+Tab',
    icon: ArrowsLeftRightIcon,
    run: () => cycleView(1)
  },
  {
    id: 'prev-view',
    label: 'Vista anterior',
    win: 'Ctrl+Shift+Tab',
    mac: 'Ctrl+Shift+Tab',
    icon: ArrowsLeftRightIcon,
    run: () => cycleView(-1)
  },
  {
    id: 'changes',
    label: 'Mostrar u ocultar los cambios',
    win: 'Ctrl+Shift+G',
    mac: 'Cmd+Shift+G',
    icon: GitDiffIcon,
    run: toggleChanges
  },
  {
    id: 'board',
    label: 'Tablero de sesiones',
    win: 'Ctrl+Shift+O',
    mac: 'Cmd+Shift+O',
    icon: SquaresFourIcon,
    run: toggleBoard
  },
  {
    id: 'sidebar',
    label: 'Mostrar u ocultar la barra lateral',
    win: 'Ctrl+Shift+B',
    mac: 'Cmd+B',
    icon: SidebarSimpleIcon,
    run: toggleSidebar
  },
  {
    id: 'settings',
    label: 'Ajustes',
    win: 'Ctrl+,',
    mac: 'Cmd+,',
    icon: GearSixIcon,
    run: openSettings
  },
  {
    id: 'copy',
    label: 'Copiar selección',
    win: 'Ctrl+Shift+C',
    mac: 'Cmd+C',
    icon: CopySimpleIcon,
    run: onActiveTerminal('copy')
  },
  {
    id: 'paste',
    label: 'Pegar',
    win: 'Ctrl+Shift+V',
    mac: 'Cmd+V',
    icon: ClipboardTextIcon,
    run: onActiveTerminal('paste')
  },
  {
    id: 'close',
    label: 'Cerrar sesión',
    win: 'Ctrl+Shift+W',
    mac: 'Cmd+W',
    icon: XIcon,
    danger: true,
    run: () => closeActive(shortcutKeys('close'))
  },
  // Ctrl+1…9: ir a la sesión en esa posición de la barra lateral.
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `goto-${i + 1}`,
    label: `Ir a la sesión ${i + 1}`,
    win: `Ctrl+${i + 1}`,
    mac: `Cmd+${i + 1}`,
    run: () => selectByIndex(i),
    inPalette: false
  }))
]

// Los de fábrica y los que el usuario cambió en Ajustes (prefs.shortcuts; '' = sin atajo).
export const defaultKeys = (s: Shortcut): string => (isMac ? s.mac : s.win)
export const keysOf = (s: Shortcut): string => getState().prefs.shortcuts[s.id] ?? defaultKeys(s)
export const shortcutKeys = (id: string): string => keysOf(SHORTCUTS.find((s) => s.id === id)!)

// Quien muestra un atajo en pantalla llama a esto para volver a dibujarse cuando cambie.
export const useShortcutsRev = (): unknown => useStore((s) => s.prefs.shortcuts)

// Mientras Ajustes graba un atajo nuevo, los atajos de Slate no deben dispararse.
let recording = false
export const recordShortcuts = (on: boolean): void => void (recording = on)

// En fase de captura: el atajo se resuelve antes de que xterm vea la tecla.
export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (recording) return
    const combo = comboOf(e)
    const shortcut = SHORTCUTS.find((s) => keysOf(s) === combo)
    if (!shortcut) return
    // En un campo de texto (no el de xterm), copiar, pegar y buscar son los del propio campo.
    const target = e.target as HTMLElement | null
    const inField = !!target?.matches('input, textarea') && !target.closest('.xterm')
    if (inField && ['copy', 'paste', 'find'].includes(shortcut.id)) return
    e.preventDefault()
    e.stopPropagation()
    shortcut.run()
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
