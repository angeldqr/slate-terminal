import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

// Colores ANSI en la paleta pizarra y tiza: apagados, sin saturar.
const theme = {
  background: '#0c0d0e',
  foreground: '#edeeef',
  cursor: '#edeeef',
  cursorAccent: '#0c0d0e',
  selectionBackground: '#3a3e43',
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

export function TerminalPane({ sessionId }: { sessionId: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = new Terminal({
      theme,
      fontFamily: "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_, url) => window.open(url)))
    term.open(host.current!)

    // WebGL dibuja más rápido; si la GPU pierde el contexto, xterm vuelve al renderer DOM.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // sin WebGL: se queda el renderer por defecto
    }

    const { sessions } = window.slate
    const resize = (): void => {
      fit.fit()
      sessions.resize(sessionId, term.cols, term.rows)
    }

    let alive = true
    document.fonts.ready.then(async () => {
      const past = await sessions.buffer(sessionId)
      if (!alive) return
      term.write(past)
      resize()
      term.focus()
    })

    const offData = sessions.onData((id, data) => id === sessionId && term.write(data))
    const input = term.onData((data) => sessions.write(sessionId, data))
    const observer = new ResizeObserver(() => alive && resize())
    observer.observe(host.current!)

    return () => {
      alive = false
      observer.disconnect()
      offData()
      input.dispose()
      term.dispose()
    }
  }, [sessionId])

  return <div ref={host} className="h-full w-full" />
}
