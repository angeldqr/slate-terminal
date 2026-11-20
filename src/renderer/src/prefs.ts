// Preferencias del usuario: se guardan en prefs.json y se aplican al momento.
import type { SessionKind } from '../../shared/types'

export type Theme = 'auto' | 'light' | 'dark'
export type CursorStyle = 'bar' | 'block' | 'underline'
export type FontWeight = 'normal' | '500' | '300'

export type Prefs = {
  theme: Theme
  darkPalette: string // el tema gris para el modo oscuro (ver shared/palettes.ts)
  lightPalette: string
  uiScale: number // tamaño de toda la interfaz, en %
  pinTopBar: boolean
  fontFamily: string
  fontSize: number
  lineHeight: number
  letterSpacing: number // px entre letras del terminal
  fontWeight: FontWeight
  minimumContrast: number // contraste mínimo del texto del terminal (1 = sin ajustar)
  terminalPadding: number // margen interior del terminal, en px
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  copyOnSelect: boolean
  smoothScroll: boolean
  shell: string // la shell de las terminales nuevas ('auto' = la mejor que haya)
  codeFontSize: number // texto de los diffs
  diffWrap: boolean // líneas largas del diff, ajustadas en vez de con scroll
  diffIgnoreSpace: boolean
  changesWidth: number // ancho del panel de cambios, en px
  notify: boolean
  sound: boolean
  tray: boolean
  // Lo último elegido en Nueva tarea: se repite la próxima vez.
  taskAgents: SessionKind[]
  taskIsolate: boolean
  orchestration: boolean // Claude Code recibe el MCP de Slate para dirigir a otros agentes
  keepAlive: boolean // las sesiones siguen vivas en el host al salir de Slate
  autoUpdate: boolean // buscar versiones nuevas al abrir Slate
  gpu: boolean // aceleración por GPU (vale desde el siguiente arranque)
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark',
  darkPalette: 'grafito',
  lightPalette: 'tiza',
  uiScale: 100,
  pinTopBar: false,
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  lineHeight: 1.25,
  letterSpacing: 0,
  fontWeight: 'normal',
  minimumContrast: 1,
  terminalPadding: 8,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  copyOnSelect: false,
  smoothScroll: false,
  shell: 'auto',
  codeFontSize: 13,
  diffWrap: false,
  diffIgnoreSpace: false,
  changesWidth: 480,
  notify: true,
  sound: true,
  tray: false,
  taskAgents: ['claude'],
  taskIsolate: true,
  orchestration: true,
  keepAlive: true,
  autoUpdate: true,
  gpu: true
}

// Límites de lo que se ajusta con deslizador.
export const LIMITS = {
  uiScale: { min: 85, max: 130, step: 5 },
  fontSize: { min: 9, max: 22, step: 1 },
  codeFontSize: { min: 10, max: 18, step: 1 },
  lineHeight: { min: 1, max: 1.6, step: 0.05 },
  letterSpacing: { min: -1, max: 3, step: 0.5 },
  terminalPadding: { min: 0, max: 24, step: 2 },
  changesWidth: { min: 360, max: 960, step: 1 }
} as const

// JetBrains Mono viene con Slate; las demás son las monoespaciadas que trae Windows. Ajustes añade
// las que haya instaladas.
export const FONTS = ['JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'Consolas']

// Si la fuente elegida no está instalada, el terminal cae a la de Slate.
export const fontStack = (font: string): string => `'${font}', 'JetBrains Mono', monospace`
