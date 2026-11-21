// Prueba de la foto de pantalla con la que vuelve una sesión: `npm run check`.
import assert from 'node:assert/strict'
import headless, { type Terminal } from '@xterm/headless'
import { createMirror } from './mirror.ts'

const text = (t: Terminal): string[] => {
  const b = t.buffer.active
  return Array.from({ length: b.length }, (_, y) => b.getLine(y)!.translateToString(true))
}
const restore = (shot: { data: string; cols: number; rows: number }): Promise<Terminal> =>
  new Promise((done) => {
    const t = new headless.Terminal({ cols: shot.cols, rows: shot.rows, allowProposedApi: true })
    t.write(shot.data, () => done(t))
  })

// Como ConPTY: historial y después filas pintadas por posición, más allá de la columna 80 (el
// ancho de un xterm recién creado, donde antes se repintaba todo y se mezclaban las letras).
const mirror = createMirror(140, 20)
for (let i = 1; i <= 60; i++) mirror.write(`línea ${i} ${'palabra '.repeat(14)}\r\n`)
mirror.write('\x1b[5;100Hderecha\x1b[20;1H> listo')
const shot = await mirror.snapshot()
assert.deepEqual([shot.cols, shot.rows], [140, 20])
assert.deepEqual(
  text(await restore(shot)),
  text(mirror.term),
  'vuelve idéntica, historial incluido'
)

// Lo que llega mientras se pide la foto también entra en ella.
mirror.write('\r\nmás')
const later = await mirror.snapshot()
assert.ok(text(await restore(later)).some((l) => l.startsWith('más')))

// El cursor oculto sigue oculto; al mostrarse, vuelve visible.
mirror.write('\x1b[?25l')
assert.ok((await mirror.snapshot()).data.endsWith('\x1b[?25l'))
mirror.write('\x1b[?25h')
assert.ok(!(await mirror.snapshot()).data.includes('\x1b[?25l'))

// Al cambiar de tamaño la foto sale al tamaño nuevo.
mirror.term.resize(90, 24)
assert.deepEqual([(await mirror.snapshot()).cols, (await mirror.snapshot()).rows], [90, 24])
console.log('mirror: ok')
