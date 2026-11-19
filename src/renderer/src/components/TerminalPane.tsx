import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CaretDownIcon, CaretUpIcon, XIcon } from '@phosphor-icons/react'
import { Terminal, type ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { terminals } from '@renderer/terminals'
import { fontStack, type Prefs } from '@renderer/prefs'
import { getState, useStore } from '@renderer/store'
import { useDark } from '@renderer/theme'

// Colores ANSI en la paleta pizarra y tiza: apagados, sin saturar.
const darkTheme = {
  background: '#0c0d0e',
  foreground: '#edeeef',
  cursor: '#edeeef',
  cursorAccent: '#0c0d0e',
  selectionBackground: '#3a3e43',
  overviewRulerBorder: '#0c0d0e', // mismo color que el fondo: el borde no se ve
  scrollbarSliderBackground: '#24272a',
  scrollbarSliderHoverBackground: '#3a3e43',
  scrollbarSliderActiveBackground: '#5c6168',
  black: '#24272a',
  red: '#e5534b',
  green: '#8fbf7f',
  yellow: '#f0b429',
  blue: '#7aa2d6',
  magenta: '#b99bd8',
  cyan: '#7fc1c4',
  white: '#c9ccd0',
  brightBlack: '#5c6168',
  brightRed: '#f07a73',
  brightGreen: '#a9d69a',
  brightYellow: '#f5c95c',
  brightBlue: '#9dbbe3',
  brightMagenta: '#cdb5e6',
  brightCyan: '#9dd3d5',
  brightWhite: '#edeeef'
}

// La misma paleta sobre tiza: los colores bajan de brillo para leerse sobre fondo claro.
const lightTheme = {
  background: '#fafafa',
  foreground: '#121314',
  cursor: '#121314',
  cursorAccent: '#fafafa',
  selectionBackground: '#d4d7db',
  overviewRulerBorder: '#fafafa',
  scrollbarSliderBackground: '#dcdee0',
  scrollbarSliderHoverBackground: '#c4c7cb',
  scrollbarSliderActiveBackground: '#9a9fa5',
  black: '#24272a',
  red: '#c4382f',
  green: '#3f7d3a',
  yellow: '#9a6a00',
  blue: '#3b6db3',
  magenta: '#8250b8',
  cyan: '#2a7f86',
  white: '#6b7076',
  brightBlack: '#5c6168',
  brightRed: '#d4453b',
  brightGreen: '#4c9245',
  brightYellow: '#b7791f',
  brightBlue: '#4a7fc8',
  brightMagenta: '#9562cc',
  brightCyan: '#35949b',
  brightWhite: '#121314'
}

// Lo que el usuario puede cambiar en Ajustes, ya en el formato de xterm.
type TermPrefs = Pick<
  Prefs,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'cursorStyle' | 'cursorBlink' | 'scrollback'
>
const termOptions = (p: TermPrefs, dark: boolean): ITerminalOptions => ({
  theme: dark ? darkTheme : lightTheme,
  fontFamily: fontStack(p.fontFamily),
  fontSize: p.fontSize,
  lineHeight: p.lineHeight,
  cursorStyle: p.cursorStyle,
  cursorBlink: p.cursorBlink,
  scrollback: p.scrollback
})

export function TerminalPane({
  sessionId,
  focused
}: {
  sessionId: string
  focused: boolean
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const search = useRef<SearchAddon | null>(null)
  // Cada petición de búsqueda suma uno: la barra se abre o, si ya está abierta, recupera el foco.
  const [findRequest, setFindRequest] = useState(0)
  // Solo lo que usa el terminal: cambiar "Avisar" o la bandeja no lo toca.
  const prefs = useStore(({ prefs: p }) => ({
    fontFamily: p.fontFamily,
    fontSize: p.fontSize,
    lineHeight: p.lineHeight,
    cursorStyle: p.cursorStyle,
    cursorBlink: p.cursorBlink,
    scrollback: p.scrollback
  }))
  const dark = useDark()
  const options = useMemo(() => termOptions(prefs, dark), [prefs, dark])
  const initial = useRef(options)
  const refit = useRef(() => {})

  useEffect(() => {
    const term = new Terminal({
      ...initial.current,
      overviewRuler: { width: 6 }, // también fija el ancho de la barra de scroll (14px por defecto)
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_, url) => window.open(url)))
    search.current = new SearchAddon()
    term.loadAddon(search.current)
    term.open(host.current!)
    termRef.current = term

    // WebGL dibuja más rápido; si la GPU pierde el contexto, xterm vuelve al renderer DOM.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // sin WebGL: se queda el renderer por defecto
    }

    const { sessions } = window.slate
    // xterm se ajusta al instante; el proceso se entera cuando el tamaño se calma, así una
    // interfaz como Claude Code no se redibuja en cada frame mientras se arrastra un divisor.
    let settle: ReturnType<typeof setTimeout> | undefined
    const resize = (): void => {
      if (!host.current?.offsetWidth) return // oculta: xterm no puede medir
      fit.fit()
      clearTimeout(settle)
      settle = setTimeout(() => sessions.resize(sessionId, term.cols, term.rows), 80)
    }
    refit.current = resize

    // Primero lo que ya imprimió y después lo nuevo: IPC entrega en orden, así no se duplica nada.
    let alive = true
    let offData = (): void => {}
    document.fonts.ready.then(async () => {
      const past = await sessions.buffer(sessionId)
      if (!alive) return
      term.write(past)
      offData = sessions.onData((id, data) => id === sessionId && term.write(data))
      resize()
    })

    const input = term.onData((data) => sessions.write(sessionId, data))
    const selection = term.onSelectionChange(() => {
      const text = term.getSelection()
      if (text && getState().prefs.copyOnSelect) navigator.clipboard.writeText(text).catch(() => {})
    })
    // Lo que los atajos pueden hacer con este terminal cuando tiene el foco.
    terminals.set(sessionId, {
      copy: () => {
        const text = term.getSelection()
        if (text) navigator.clipboard.writeText(text).catch(() => {}) // sin permiso: no copia
      },
      paste: () => {
        navigator.clipboard
          .readText()
          .then((text) => term.paste(text))
          .catch(() => {}) // portapapeles vacío o sin permiso: no pega nada
      },
      find: () => setFindRequest((n) => n + 1),
      focus: () => term.focus()
    })
    const observer = new ResizeObserver(() => alive && resize())
    observer.observe(host.current!)

    return () => {
      alive = false
      terminals.delete(sessionId)
      clearTimeout(settle)
      observer.disconnect()
      offData()
      input.dispose()
      selection.dispose()
      term.dispose()
      termRef.current = null
    }
  }, [sessionId])

  // Ajustes cambia el terminal en vivo; antes de pintar, para que el cambio de tema salga entero.
  useLayoutEffect(() => {
    const term = termRef.current
    if (!term) return
    Object.assign(term.options, options)
    refit.current() // otra fuente o tamaño cambia cuántas columnas caben
  }, [options])

  useEffect(() => {
    if (focused) requestAnimationFrame(() => termRef.current?.focus())
  }, [focused])

  const closeFind = (): void => {
    setFindRequest(0)
    search.current?.clearDecorations()
    termRef.current?.clearSelection()
    termRef.current?.focus()
  }

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" />
      {findRequest > 0 && (
        <FindBar
          request={findRequest}
          onFind={(query, back) =>
            back
              ? search.current?.findPrevious(query)
              : search.current?.findNext(query, { incremental: true })
          }
          onClose={closeFind}
        />
      )}
    </div>
  )
}

const findButton =
  'grid size-6 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground'

// Barra compacta de búsqueda: Enter busca hacia abajo, Shift+Enter hacia arriba, Escape cierra.
function FindBar({
  request,
  onFind,
  onClose
}: {
  request: number
  onFind: (query: string, back: boolean) => void
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.select(), [request])
  return (
    <div className="absolute top-1 right-3 z-10 flex h-8 items-center gap-0.5 rounded-md border border-border bg-popover pr-1 pl-2 shadow-lg">
      <input
        ref={input}
        value={query}
        placeholder="Buscar"
        aria-label="Buscar en el terminal"
        onChange={(e) => {
          setQuery(e.target.value)
          if (e.target.value) onFind(e.target.value, false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && query) onFind(query, e.shiftKey)
        }}
        className="w-44 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
      />
      <button
        className={findButton}
        aria-label="Anterior"
        onClick={() => query && onFind(query, true)}
      >
        <CaretUpIcon size={14} />
      </button>
      <button
        className={findButton}
        aria-label="Siguiente"
        onClick={() => query && onFind(query, false)}
      >
        <CaretDownIcon size={14} />
      </button>
      <button className={findButton} aria-label="Cerrar búsqueda" onClick={onClose}>
        <XIcon size={14} />
      </button>
    </div>
  )
}
