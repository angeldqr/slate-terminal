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
import { usePalette } from '@renderer/theme'
import type { Palette } from '../../../shared/palettes'

// Colores ANSI apagados, sin saturar. El fondo, el texto y la selección los pone el tema gris.
const darkAnsi = {
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

// Sobre fondo claro los colores bajan de brillo para leerse.
const lightAnsi = {
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

const themeOf = ({ dark, tokens: t }: Palette): ITerminalOptions['theme'] => ({
  ...(dark ? darkAnsi : lightAnsi),
  background: t.background,
  foreground: t.foreground,
  cursor: t.foreground,
  cursorAccent: t.background,
  selectionBackground: t.selection,
  overviewRulerBorder: t.background, // mismo color que el fondo: el borde no se ve
  scrollbarSliderBackground: t.accent,
  scrollbarSliderHoverBackground: t.selection,
  scrollbarSliderActiveBackground: t.muted
})

// Lo que el usuario puede cambiar en Ajustes, ya en el formato de xterm.
type TermPrefs = Pick<
  Prefs,
  | 'fontFamily'
  | 'fontSize'
  | 'lineHeight'
  | 'letterSpacing'
  | 'fontWeight'
  | 'minimumContrast'
  | 'cursorStyle'
  | 'cursorBlink'
  | 'scrollback'
  | 'smoothScroll'
  | 'uiScale'
  | 'terminalTheme'
>
// Lo que trae el tema importado de VS Code se pone encima del tema gris de Slate.
const withImported = (
  base: NonNullable<ITerminalOptions['theme']>,
  c: Prefs['terminalTheme']
): NonNullable<ITerminalOptions['theme']> =>
  c
    ? {
        ...base,
        ...c.ansi,
        ...(c.background && { background: c.background, cursorAccent: c.background }),
        ...(c.foreground && { foreground: c.foreground, cursor: c.foreground }),
        ...(c.cursor && { cursor: c.cursor }),
        ...(c.selection && { selectionBackground: c.selection })
      }
    : base

const termOptions = (p: TermPrefs, palette: Palette): ITerminalOptions => ({
  theme: withImported(themeOf(palette)!, p.terminalTheme),
  fontFamily: fontStack(p.fontFamily),
  // El tamaño de la interfaz no agranda el terminal: su letra tiene su propio ajuste.
  fontSize: (p.fontSize * 100) / p.uiScale,
  lineHeight: p.lineHeight,
  letterSpacing: p.letterSpacing,
  fontWeight: p.fontWeight,
  fontWeightBold: p.fontWeight === '300' ? '600' : 'bold',
  minimumContrastRatio: p.minimumContrast,
  cursorStyle: p.cursorStyle,
  cursorBlink: p.cursorBlink,
  scrollback: p.scrollback,
  smoothScrollDuration: p.smoothScroll ? 120 : 0
})

export function TerminalPane({
  sessionId,
  focused,
  visible
}: {
  sessionId: string
  focused: boolean
  visible: boolean
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
    letterSpacing: p.letterSpacing,
    fontWeight: p.fontWeight,
    minimumContrast: p.minimumContrast,
    cursorStyle: p.cursorStyle,
    cursorBlink: p.cursorBlink,
    scrollback: p.scrollback,
    smoothScroll: p.smoothScroll,
    uiScale: p.uiScale,
    terminalTheme: p.terminalTheme
  }))
  const palette = usePalette()
  const options = useMemo(() => termOptions(prefs, palette), [prefs, palette])
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

    const { sessions } = window.slate
    // xterm se ajusta al instante; el proceso se entera cuando el tamaño se calma, así una
    // interfaz como Claude Code no se redibuja en cada frame mientras se arrastra un divisor.
    let settle: ReturnType<typeof setTimeout> | undefined
    const tell = (): void => {
      clearTimeout(settle)
      settle = undefined
      sessions.resize(sessionId, term.cols, term.rows)
    }
    let resizeFrame = 0
    // FitAddon modifica varios canvas internos. Agrupar las notificaciones de ResizeObserver evita
    // que una misma pasada de layout los redimensione más de una vez.
    const fitNow = (final = false): void => {
      resizeFrame = 0
      if (!host.current?.offsetWidth) return // oculta: xterm no puede medir
      fit.fit()
      clearTimeout(settle)
      if (final) {
        tell()
        // WebGL puede conservar una región anterior tras un cambio brusco de columnas. El último
        // repintado cubre todo el viewport cuando un panel termina de entrar o salir.
        if (term.rows) term.refresh(0, term.rows - 1)
      } else {
        settle = setTimeout(tell, 80)
      }
    }
    const resize = (): void => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => fitNow())
    }
    refit.current = () => {
      cancelAnimationFrame(resizeFrame)
      fitNow(true)
    }
    // Al soltar el divisor el proceso se entera en el acto: lo que se escriba ya cae al ancho nuevo.
    const release = (): void => refit.current()
    addEventListener('pointerup', release)
    addEventListener('pointercancel', release)
    addEventListener('blur', release)

    // Primero lo que ya imprimió y después lo nuevo: IPC entrega en orden, así no se duplica nada.
    let alive = true
    let offData = (): void => {}
    document.fonts.ready.then(async () => {
      const past = await sessions.buffer(sessionId)
      if (!alive) return
      term.write(past)
      offData = sessions.onData(sessionId, (data) => term.write(data))
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
      cancelAnimationFrame(resizeFrame)
      removeEventListener('pointerup', release)
      removeEventListener('pointercancel', release)
      removeEventListener('blur', release)
      observer.disconnect()
      offData()
      input.dispose()
      selection.dispose()
      term.dispose()
      termRef.current = null
    }
  }, [sessionId])

  // WebGL solo mientras se ve: cada contexto es memoria de la GPU y Chromium admite unos 16 por
  // ventana (pasado eso, los más viejos se pierden y caen al renderer DOM sin avisar). Oculto,
  // xterm usa el renderer DOM, que no dibuja nada mientras no se ve. Si la GPU pierde el contexto
  // se reintenta una vez; si vuelve a perderlo, ese terminal se queda en DOM.
  useEffect(() => {
    const term = termRef.current
    if (!visible || !term) return
    let webgl: WebglAddon | null = null
    let retried = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const load = (): void => {
      try {
        webgl = new WebglAddon()
        webgl.onContextLoss(() => {
          webgl?.dispose()
          webgl = null
          if (!retried) retry = setTimeout(load, 1000)
          retried = true
        })
        term.loadAddon(webgl)
      } catch {
        webgl = null // sin WebGL (GPU apagada o sin contextos): se queda el renderer DOM
      }
    }
    load()
    return () => {
      clearTimeout(retry)
      webgl?.dispose()
    }
  }, [visible])

  // Ajustes cambia el terminal en vivo; antes de pintar, para que el cambio de tema salga entero.
  useLayoutEffect(() => {
    const term = termRef.current
    if (!term) return
    Object.assign(term.options, options)
    refit.current() // otra fuente o tamaño cambia cuántas columnas caben
  }, [options])

  // Al activarse toma el foco, salvo que en ese momento se esté escribiendo en otro campo (p. ej.
  // renombrar con doble clic una sesión que no era la activa): quitárselo cortaría lo escrito.
  useEffect(() => {
    if (!focused) return
    requestAnimationFrame(() => {
      const el = document.activeElement
      // Un campo dentro de otro panel (su búsqueda) no cuenta: el foco va al panel elegido.
      const typing = el?.matches('input, textarea') && !el.closest('[data-terminal]')
      if (!typing) termRef.current?.focus()
    })
  }, [focused])

  const closeFind = (): void => {
    setFindRequest(0)
    search.current?.clearDecorations()
    termRef.current?.clearSelection()
    termRef.current?.focus()
  }

  return (
    <div data-terminal className="relative h-full w-full">
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
    <div className="absolute top-1 right-3 z-10 flex h-8 items-center gap-0.5 rounded-md glass pr-1 pl-2">
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
