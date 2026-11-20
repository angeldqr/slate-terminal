// Importa los colores del terminal de un tema de VS Code (el JSON del tema o el bloque
// workbench.colorCustomizations de settings.json). Sin React ni Electron: se prueba con
// `npm run check`.

export const ANSI = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const
export type AnsiName = (typeof ANSI)[number]

// Los colores que el tema importado fija; lo que no trae se queda como estaba en Slate.
export type TerminalColors = {
  background?: string
  foreground?: string
  cursor?: string
  selection?: string
  ansi: Partial<Record<AnsiName, string>>
}

// Los temas de VS Code son JSON con comentarios y comas finales: se quitan fuera de las cadenas.
export function stripJsonc(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    } else {
      out += c
      i++
    }
  }
  return dropTrailingCommas(out)
}

// Quita la coma antes de } o ], sin tocar las que están dentro de una cadena.
function dropTrailingCommas(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    } else if (c === ',' && /^\s*[}\]]/.test(text.slice(i + 1, i + 200))) {
      continue
    } else out += c
  }
  return out
}

// #rgb, #rgba, #rrggbb o #rrggbbaa → siempre #rrggbb o #rrggbbaa en minúsculas.
export function hex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim())
  if (!m) return null
  const h = m[1].toLowerCase()
  return '#' + (h.length <= 4 ? [...h].map((d) => d + d).join('') : h)
}

const TERMINAL_KEY: Record<AnsiName, string> = {
  black: 'terminal.ansiBlack',
  red: 'terminal.ansiRed',
  green: 'terminal.ansiGreen',
  yellow: 'terminal.ansiYellow',
  blue: 'terminal.ansiBlue',
  magenta: 'terminal.ansiMagenta',
  cyan: 'terminal.ansiCyan',
  white: 'terminal.ansiWhite',
  brightBlack: 'terminal.ansiBrightBlack',
  brightRed: 'terminal.ansiBrightRed',
  brightGreen: 'terminal.ansiBrightGreen',
  brightYellow: 'terminal.ansiBrightYellow',
  brightBlue: 'terminal.ansiBrightBlue',
  brightMagenta: 'terminal.ansiBrightMagenta',
  brightCyan: 'terminal.ansiBrightCyan',
  brightWhite: 'terminal.ansiBrightWhite'
}

export type Imported = { ok: true; colors: TerminalColors } | { ok: false; error: string }

export function parseVsCodeTheme(text: string): Imported {
  let root: unknown
  try {
    root = JSON.parse(stripJsonc(text.replace(/^\uFEFF/, '')))
  } catch {
    return { ok: false, error: 'Eso no es JSON válido. Pega el archivo del tema entero.' }
  }
  if (!root || typeof root !== 'object') {
    return { ok: false, error: 'Eso no parece un tema de VS Code.' }
  }
  const obj = root as Record<string, unknown>
  const found = obj.colors ?? obj['workbench.colorCustomizations'] ?? obj
  if (!found || typeof found !== 'object' || Array.isArray(found)) {
    return { ok: false, error: 'Eso no parece un tema de VS Code.' }
  }
  const pool = found as Record<string, unknown>
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = hex(pool?.[k])
      if (v) return v
    }
    return undefined
  }
  const ansi: TerminalColors['ansi'] = {}
  for (const name of ANSI) {
    const v = pick(TERMINAL_KEY[name])
    if (v) ansi[name] = v
  }
  const colors: TerminalColors = {
    background: pick('terminal.background', 'editor.background'),
    foreground: pick('terminal.foreground', 'editor.foreground'),
    cursor: pick('terminalCursor.foreground', 'editorCursor.foreground'),
    selection: pick('terminal.selectionBackground', 'editor.selectionBackground'),
    ansi
  }
  if (!colors.background && !colors.foreground && !Object.keys(ansi).length) {
    return { ok: false, error: 'No encontré colores de terminal ni de editor en ese tema.' }
  }
  return { ok: true, colors }
}
