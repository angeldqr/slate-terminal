// Prueba del buscador de Ajustes: `npm run check`. Comprueba que toda fila de Settings.tsx esté
// en el índice (si no, el buscador no la encontraría).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { searchSettings, SETTINGS_INDEX } from './settingsIndex.ts'

const source = readFileSync(new URL('./components/Settings.tsx', import.meta.url), 'utf8')
const rows = [...source.matchAll(/<Row\s+label="([^"]+)"/g)].map((m) => m[1])
assert.ok(rows.length > 25, 'se leyeron las filas de Settings.tsx')
const known = new Set(SETTINGS_INDEX.map((e) => e.label))
for (const label of rows) assert.ok(known.has(label), `falta en el índice: ${label}`)

assert.equal(searchSettings('').length, 0)
assert.equal(searchSettings('zzzz').length, 0)
assert.equal(searchSettings('gpu')[0].label, 'Aceleración por GPU')
assert.equal(searchSettings('aceleracion')[0].label, 'Aceleración por GPU', 'sin acentos')
assert.equal(searchSettings('cursor')[0].section, 'terminal')
assert.deepEqual(
  searchSettings('letra tamano')
    .map((e) => e.label)
    .slice(0, 2),
  ['Tamaño', 'Tamaño del código'],
  'todas las palabras tienen que estar'
)
assert.equal(
  searchSettings('contraste')[0].label,
  'Contraste',
  'el título va antes que las palabras clave'
)

console.log('settings: ok')
