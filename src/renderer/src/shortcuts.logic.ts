// Reglas de los atajos editables (sin React ni Electron, para probarlas con `npm run check`).
// Idea de KeybindingsSettings.logic de T3 Code (MIT): un atajo repetido avisa y se puede reasignar.

export type Entry = { id: string; keys: string }

export type Check = { ok: true } | { ok: false; error: string }

// Un atajo necesita un modificador (o ser una tecla de función). En Windows y Linux, Ctrl más una
// letra sola es del terminal (Ctrl+C, Ctrl+W…): se pide Shift o Alt para no quitárselo.
export function validCombo(combo: string, mac: boolean): Check {
  const parts = combo.split('+')
  const key = parts[parts.length - 1]
  const mods = new Set(parts.slice(0, -1))
  if (/^F([1-9]|1[0-2])$/.test(key)) return { ok: true }
  if (!mods.size)
    return {
      ok: false,
      error: 'Añade Ctrl, Alt o Mayús: una tecla sola escribiría en el terminal.'
    }
  if (!mac && mods.size === 1 && mods.has('Ctrl') && /^[A-Z]$/.test(key)) {
    return { ok: false, error: 'Ctrl más una letra es del terminal: añade Mayús o Alt.' }
  }
  return { ok: true }
}

// Quién más usa ya esa combinación.
export const conflictOf = (list: Entry[], id: string, combo: string): Entry | undefined =>
  combo ? list.find((e) => e.id !== id && e.keys === combo) : undefined

// Los atajos cambiados que quedan tras asignar `combo` a `id`. Con `takeOver`, quien la tenía se
// queda sin atajo (''); sin él, un conflicto no cambia nada. Si coincide con el de fábrica, el
// cambio se borra en vez de guardarse.
export function assign(
  overrides: Record<string, string>,
  list: Entry[],
  defaults: Record<string, string>,
  id: string,
  combo: string,
  takeOver = false
): Record<string, string> {
  const other = conflictOf(list, id, combo)
  if (other && !takeOver) return overrides
  const next = { ...overrides }
  const set = (key: string, value: string): void => {
    if (value === defaults[key]) delete next[key]
    else next[key] = value
  }
  if (other) set(other.id, '')
  set(id, combo)
  return next
}
