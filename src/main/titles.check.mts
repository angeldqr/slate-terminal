// Prueba de los nombres de sesión: `npm run check`.
import assert from 'node:assert/strict'
import { freeTitle, samePath } from './titles.ts'

assert.equal(freeTitle('Shell', []), 'Shell')
assert.equal(freeTitle('Shell', ['Shell']), 'Shell 2')
assert.equal(freeTitle('Shell', ['Shell', 'Shell 2']), 'Shell 3')
// Reusa el hueco que dejó una sesión cerrada.
assert.equal(freeTitle('Shell', ['Shell', 'Shell 3']), 'Shell 2')
// Cada base cuenta por separado.
assert.equal(freeTitle('Claude Code', ['Shell', 'Shell 2']), 'Claude Code')

assert.ok(samePath('C:\\Proyectos\\Slate\\', 'c:\\proyectos\\slate'))
assert.ok(!samePath('C:\\Proyectos\\Slate', 'C:\\Proyectos\\Otro'))

console.log('titles: ok')
