// Prueba del árbol de paneles: `npm run check`.
import assert from 'node:assert/strict'
import { frames, leaves, pane, remove, setRatio, sibling, split, type Layout } from './layout.ts'

const ratioOf = (node: Layout): number | undefined =>
  node.type === 'split' ? node.ratio : undefined

// Dividir: a la derecha y luego abajo del panel nuevo.
let view = split(pane('s1'), 's1', 's2', 'row')
assert.deepEqual(leaves(view), ['s1', 's2'])
view = split(view, 's2', 's3', 'col')
assert.deepEqual(leaves(view), ['s1', 's2', 's3'])

// Dividir un id que no está no cambia nada.
assert.deepEqual(split(view, 'nadie', 's9', 'row'), view)

// Quitar: el hermano sube y ocupa el lugar; la última sesión deja la vista vacía.
assert.deepEqual(leaves(remove(view, 's2')!), ['s1', 's3'])
assert.deepEqual(remove(view, 's1'), split(pane('s2'), 's2', 's3', 'col'))
assert.equal(remove(pane('s1'), 's1'), null)

// La vecina es la adyacente en el árbol, no la primera de la vista.
assert.equal(sibling(view, 's3'), 's2')
assert.equal(sibling(view, 's1'), 's2')
assert.equal(sibling(pane('s1'), 's1'), undefined)

// Proporción: por camino y con tope entre 15 % y 85 %.
const nested = setRatio(view, 'b', 0.7)
assert.equal(nested.type === 'split' ? ratioOf(nested.b) : undefined, 0.7)
assert.equal(ratioOf(setRatio(view, '', 0.99)), 0.85)
assert.equal(ratioOf(setRatio(view, '', 0.01)), 0.15)

// Rectángulos: s1 a la izquierda; s2 arriba a la derecha; s3 abajo a la derecha.
const { panes, dividers } = frames(setRatio(view, '', 0.25))
assert.deepEqual(panes, [
  { id: 's1', box: { x: 0, y: 0, w: 0.25, h: 1 } },
  { id: 's2', box: { x: 0.25, y: 0, w: 0.75, h: 0.5 } },
  { id: 's3', box: { x: 0.25, y: 0.5, w: 0.75, h: 0.5 } }
])
assert.deepEqual(
  dividers.map((d) => [d.path, d.dir]),
  [
    ['', 'row'],
    ['b', 'col']
  ]
)

console.log('layout: ok')
