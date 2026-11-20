// Nombre libre entre los que ya hay: "Shell", luego "Shell 2", "Shell 3"…
// Reusa el primer hueco, así cerrar "Shell 2" deja ese nombre libre para la siguiente.
// `sep` separa el número: "Shell 2" para títulos, "anadir-busqueda-2" para ramas.
export function freeTitle(base: string, taken: string[], sep = ' '): string {
  const used = new Set(taken)
  const nth = (n: number): string => (n === 1 ? base : `${base}${sep}${n}`)
  let n = 1
  while (used.has(nth(n))) n++
  return nth(n)
}

// Windows no distingue mayúsculas en rutas y a veces sobra la barra final.
export const samePath = (a: string, b: string): boolean => {
  const normalize = (p: string): string => p.replace(/[\\/]+$/, '').toLowerCase()
  return normalize(a) === normalize(b)
}
