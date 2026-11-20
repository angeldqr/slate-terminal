// Prueba de la lógica pura del panel de cambios: `npm run check`.
import assert from 'node:assert/strict'
import {
  patchLine,
  progressLabel,
  resolveQuickActions,
  treeRows,
  type QuickAction
} from './changes.logic.ts'

const base = { isolated: true, empty: false, message: 'Añade X', busy: false, base: 'main' }
const by = (o: Partial<typeof base & { allExcluded: boolean }>): Record<string, QuickAction> =>
  Object.fromEntries(resolveQuickActions({ ...base, ...o }).map((a) => [a.id, a]))

assert.deepEqual(
  resolveQuickActions({ ...base, isolated: false }),
  [],
  'sin rama propia no hay acciones'
)
assert.equal(resolveQuickActions(base)[0].label, 'Fusionar en main', 'la principal es fusionar')
assert.ok(Object.values(by({})).every((a) => a.enabled))
assert.equal(by({ empty: true }).merge.reason, 'No hay cambios')
assert.equal(by({ empty: true }).discard.enabled, true, 'descartar vale aunque no haya cambios')
assert.equal(by({}).push.label, 'Subir la rama…')
assert.equal(by({ empty: true }).push.reason, 'No hay cambios')
assert.equal(by({ message: '  ' }).pr.reason, 'Escribe qué hace este cambio')
assert.equal(by({ allExcluded: true }).commit.reason, 'Todos los archivos están excluidos')
assert.ok(
  Object.values(by({ busy: true })).every((a) => !a.enabled),
  'ocupado: ninguna'
)

assert.equal(progressLabel('merge', 0), 'Fusionando…')
assert.equal(progressLabel('pr', 5), 'Subiendo… 5 s')

const f = (path: string): { path: string } => ({ path })
const rows = treeRows(
  [f('a.txt'), f('src/main/x.ts'), f('src/main/y.ts'), f('src/ui/z.ts')],
  new Set()
)
assert.deepEqual(
  rows.map((r) => `${r.depth}${r.kind === 'dir' ? 'D' : 'F'}:${r.name}`),
  ['0D:src', '1D:main', '2F:x.ts', '2F:y.ts', '1D:ui', '2F:z.ts', '0F:a.txt'],
  'carpetas primero, luego archivos, con su profundidad'
)
assert.deepEqual(
  treeRows([f('a/b/c/x.ts')], new Set()).map((r) => r.kind === 'dir' && r.name),
  ['a/b/c', false],
  'la cadena de carpetas con un solo hijo se une'
)
assert.deepEqual(
  treeRows([f('src/main/x.ts'), f('src/ui/z.ts')], new Set(['src/main'])).map((r) => r.name),
  ['src', 'main', 'ui', 'z.ts'],
  'una carpeta plegada esconde sus archivos'
)

const patch = [
  '--- a/x.ts',
  '+++ b/x.ts',
  '@@ -3,3 +3,3 @@',
  ' igual',
  '-viejo',
  '+nuevo',
  ' fin',
  ''
].join('\n')
assert.equal(patchLine(patch, 'deletions', 4), 'viejo')
assert.equal(patchLine(patch, 'additions', 4), 'nuevo')
assert.equal(patchLine(patch, 'additions', 3), 'igual', 'el contexto cuenta en los dos lados')
assert.equal(patchLine(patch, 'additions', 99), '', 'una línea que no está da vacío')

console.log('changes: ok')
