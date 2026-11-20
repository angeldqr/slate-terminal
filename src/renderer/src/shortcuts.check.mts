// Prueba de las reglas de los atajos editables: `npm run check`.
import assert from 'node:assert/strict'
import { assign, conflictOf, validCombo } from './shortcuts.logic.ts'

assert.equal(validCombo('Ctrl+Shift+K', false).ok, true)
assert.equal(validCombo('Alt+K', false).ok, true)
assert.equal(validCombo('F5', false).ok, true, 'las de función valen solas')
assert.equal(validCombo('K', false).ok, false, 'sola escribiría en el terminal')
assert.equal(validCombo('Ctrl+K', false).ok, false, 'Ctrl+letra es del terminal')
assert.equal(validCombo('Cmd+K', true).ok, true, 'en Mac, Cmd no es del terminal')
assert.equal(validCombo('Ctrl+Tab', false).ok, true, 'Ctrl con una tecla que no es letra')

const list = [
  { id: 'a', keys: 'Ctrl+Shift+A' },
  { id: 'b', keys: 'Ctrl+Shift+B' }
]
const defaults = { a: 'Ctrl+Shift+A', b: 'Ctrl+Shift+B' }
assert.equal(conflictOf(list, 'a', 'Ctrl+Shift+B')?.id, 'b')
assert.equal(conflictOf(list, 'b', 'Ctrl+Shift+B'), undefined, 'consigo mismo no hay conflicto')
assert.equal(conflictOf(list, 'a', ''), undefined, 'sin atajo no choca con nadie')

assert.deepEqual(assign({}, list, defaults, 'a', 'Ctrl+Shift+X'), { a: 'Ctrl+Shift+X' })
assert.deepEqual(assign({}, list, defaults, 'a', 'Ctrl+Shift+B'), {}, 'un conflicto no cambia nada')
assert.deepEqual(
  assign({}, list, defaults, 'a', 'Ctrl+Shift+B', true),
  { a: 'Ctrl+Shift+B', b: '' },
  'reasignar deja sin atajo a quien lo tenía'
)
assert.deepEqual(
  assign({ a: 'Ctrl+Shift+X' }, list, defaults, 'a', 'Ctrl+Shift+A'),
  {},
  'volver al de fábrica borra el cambio'
)
assert.deepEqual(assign({}, list, defaults, 'a', ''), { a: '' }, 'vaciar quita el atajo')

console.log('shortcuts: ok')
