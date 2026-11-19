// Árbol de paneles de una vista: cada hoja es una sesión y cada rama divide el espacio en dos.
// `row` pone los hijos lado a lado (dividir a la derecha); `col`, uno encima del otro (abajo).
export type Dir = 'row' | 'col'
export type Layout =
  { type: 'pane'; id: string } | { type: 'split'; dir: Dir; ratio: number; a: Layout; b: Layout }

// Una rama se ubica por su camino desde la raíz: '' es la raíz, 'ab' es raíz → a → b.
export type Path = string

export const pane = (id: string): Layout => ({ type: 'pane', id })

export const leaves = (node: Layout): string[] =>
  node.type === 'pane' ? [node.id] : [...leaves(node.a), ...leaves(node.b)]

// Pone `newId` al lado de `targetId`, a la derecha o debajo, repartiendo el espacio a medias.
export function split(node: Layout, targetId: string, newId: string, dir: Dir): Layout {
  if (node.type === 'pane') {
    return node.id === targetId ? { type: 'split', dir, ratio: 0.5, a: node, b: pane(newId) } : node
  }
  return { ...node, a: split(node.a, targetId, newId, dir), b: split(node.b, targetId, newId, dir) }
}

// Quita una sesión; su hermano ocupa el lugar de la rama. Devuelve null si la vista queda vacía.
export function remove(node: Layout, id: string): Layout | null {
  if (node.type === 'pane') return node.id === id ? null : node
  const a = remove(node.a, id)
  const b = remove(node.b, id)
  if (!a) return b
  if (!b) return a
  return { ...node, a, b }
}

// Ningún panel baja del 15 %: siempre queda algo que agarrar para devolverlo.
export const clampRatio = (ratio: number): number => Math.min(0.85, Math.max(0.15, ratio))

export function setRatio(node: Layout, path: Path, ratio: number): Layout {
  if (node.type === 'pane') return node
  if (!path) return { ...node, ratio: clampRatio(ratio) }
  const [step, rest] = [path[0], path.slice(1)]
  return step === 'a'
    ? { ...node, a: setRatio(node.a, rest, ratio) }
    : { ...node, b: setRatio(node.b, rest, ratio) }
}

// La sesión que queda junto a `id` en el árbol: la que hereda el foco cuando `id` se cierra.
export function sibling(node: Layout, id: string): string | undefined {
  if (node.type === 'pane') return undefined
  if (node.a.type === 'pane' && node.a.id === id) return leaves(node.b)[0]
  if (node.b.type === 'pane' && node.b.id === id) return leaves(node.a).at(-1)
  return leaves(node.a).includes(id) ? sibling(node.a, id) : sibling(node.b, id)
}

// Rectángulo en fracciones del área de la vista (0 a 1).
export type Box = { x: number; y: number; w: number; h: number }
export type Divider = { path: Path; dir: Dir; ratio: number; box: Box }

// Convierte el árbol en rectángulos planos: cada panel sabe dónde va sin anidarse en el DOM,
// así React nunca desmonta un terminal porque cambió la forma del árbol.
export function frames(
  node: Layout,
  box: Box = { x: 0, y: 0, w: 1, h: 1 },
  path: Path = ''
): { panes: { id: string; box: Box }[]; dividers: Divider[] } {
  if (node.type === 'pane') return { panes: [{ id: node.id, box }], dividers: [] }
  const row = node.dir === 'row'
  const first = row ? { ...box, w: box.w * node.ratio } : { ...box, h: box.h * node.ratio }
  const second = row
    ? { ...box, x: box.x + first.w, w: box.w - first.w }
    : { ...box, y: box.y + first.h, h: box.h - first.h }
  const a = frames(node.a, first, path + 'a')
  const b = frames(node.b, second, path + 'b')
  return {
    panes: [...a.panes, ...b.panes],
    dividers: [{ path, dir: node.dir, ratio: node.ratio, box }, ...a.dividers, ...b.dividers]
  }
}
