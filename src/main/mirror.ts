import { release } from 'node:os'
import type { Terminal } from '@xterm/headless'
// Por defecto y no por nombre: son CommonJS y así también cargan en Node puro (mirror.check.mts).
import headless from '@xterm/headless'
import serialize from '@xterm/addon-serialize'

// Copia sin pantalla de lo que muestra una sesión. Lee la misma salida que el terminal visible y
// se reacomoda igual al cambiar de tamaño (mismas reglas de ConPTY que TerminalPane). Al volver a
// montar un terminal se le entrega esta foto, no la salida cruda: esa se imprimió a otros anchos y,
// repintada al ancho actual, mezcla las letras de una interfaz como Claude Code.
const winBuild = process.platform === 'win32' ? Number(release().split('.')[2]) || 0 : 0

export type Mirror = {
  term: Terminal
  write: (data: string) => void
  // Lo que se ve y el historial, en secuencias que lo reconstruyen en un terminal de cols × rows.
  snapshot: () => Promise<{ data: string; cols: number; rows: number }>
}

export function createMirror(cols: number, rows: number): Mirror {
  const term = new headless.Terminal({
    cols,
    rows,
    scrollback: 2000,
    allowProposedApi: true,
    ...(winBuild && { windowsPty: { backend: 'conpty' as const, buildNumber: winBuild } })
  })
  const serializer = new serialize.SerializeAddon()
  term.loadAddon(serializer)
  // serialize() no guarda si el cursor está oculto (y xterm 6 no lo expone): se sigue aquí.
  // Devolver false deja que xterm aplique el modo igual que siempre.
  let cursorHidden = false
  const track =
    (set: boolean) =>
    (params: (number | number[])[]): boolean => {
      if (params.includes(25)) cursorHidden = !set
      return false
    }
  term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, track(true))
  term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, track(false))
  let writes = 0
  return {
    term,
    write: (data) => {
      writes++
      term.write(data)
    },
    // xterm procesa en diferido: se espera a que lea todo lo recibido. Al resolver, la foto incluye
    // hasta el último byte llegado, sin que entre medias se cuele nada más (JS es de un hilo).
    snapshot: async () => {
      for (let seen = -1; seen !== writes;) {
        seen = writes
        await new Promise<void>((done) => term.write('', done))
      }
      const data = serializer.serialize() + (cursorHidden ? '\x1b[?25l' : '')
      return { data, cols: term.cols, rows: term.rows }
    }
  }
}
