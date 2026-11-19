// Preferencias del usuario: se guardan en prefs.json y se aplican al momento.
export type Theme = 'auto' | 'light' | 'dark'
export type CursorStyle = 'bar' | 'block' | 'underline'

export type Prefs = {
  theme: Theme
  pinTopBar: boolean
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  copyOnSelect: boolean
  notify: boolean
  sound: boolean
  tray: boolean
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark',
  pinTopBar: false,
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  lineHeight: 1.25,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  copyOnSelect: false,
  notify: true,
  sound: true,
  tray: false
}

// JetBrains Mono viene con Slate; las demás son las monoespaciadas que trae Windows.
export const FONTS = ['JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'Consolas']

// Si la fuente elegida no está instalada, el terminal cae a la de Slate.
export const fontStack = (font: string): string => `'${font}', 'JetBrains Mono', monospace`
