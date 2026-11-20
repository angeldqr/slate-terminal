// Prueba del tiempo relativo y del estado que se ve de una sesión: `npm run check`.
import assert from 'node:assert/strict'
import { ago, untilChange } from './lib/time.ts'
import { resolveStatus } from './lib/status.ts'

const T0 = 1_000_000
const at = (sec: number): number => T0 + sec * 1000
assert.equal(ago(T0, at(10)), 'ahora')
assert.equal(ago(T0, at(45)), '1 min')
assert.equal(ago(T0, at(3600)), '1 h')

// El aviso llega justo cuando el texto cambia: ni antes (sería inútil) ni mucho después.
for (const sec of [0, 10, 44, 45, 60, 89, 90, 600, 3500, 3599, 3600, 5400, 86399, 90000]) {
  const wait = untilChange(T0, at(sec))
  assert.ok(wait > 0, `espera positiva a los ${sec} s`)
  assert.notEqual(ago(T0, at(sec) + wait), ago(T0, at(sec)), `cambia tras esperar (${sec} s)`)
  assert.equal(
    ago(T0, at(sec) + wait - 20),
    ago(T0, at(sec)),
    `y no antes (${sec} s): sigue igual 20 ms antes`
  )
}

const s = (status: string, unread = false): string =>
  resolveStatus({ status: status as never, unread })
assert.equal(s('attention', true), 'attention', 'te necesita gana a sin leer')
assert.equal(s('working', true), 'working', 'trabajando gana a sin leer')
assert.equal(s('error'), 'error')
assert.equal(s('idle', true), 'unread')
assert.equal(s('exited', true), 'unread', 'sin leer gana a terminada')
assert.equal(s('exited'), 'exited')
assert.equal(s('idle'), 'idle')

console.log('lib: ok')
