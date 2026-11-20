// Lógica pura del panel de cambios (sin React ni Electron, para probarla con `npm run check`).
// La tabla de acciones sigue la idea de GitActionsControl.logic de T3 Code (MIT).

export type QuickId = 'merge' | 'pr' | 'push' | 'commit' | 'discard'
export type QuickAction = { id: QuickId; label: string; enabled: boolean; reason?: string }

type QuickInput = {
  isolated: boolean
  empty: boolean // no hay archivos cambiados
  message: string
  busy: boolean
  base: string
  allExcluded?: boolean // el usuario dejó fuera todos los archivos
}

// Qué se puede hacer con el trabajo de la sesión y, si algo no aplica, por qué. La primera es la
// principal. Una sesión sin rama propia no tiene nada que fusionar, subir ni descartar.
export function resolveQuickActions(i: QuickInput): QuickAction[] {
  if (!i.isolated) return []
  const why = (needsWork: boolean): string | undefined =>
    i.busy
      ? 'Hay otra acción en curso'
      : needsWork && i.empty
        ? 'No hay cambios'
        : needsWork && !i.message.trim()
          ? 'Escribe qué hace este cambio'
          : needsWork && i.allExcluded
            ? 'Todos los archivos están excluidos'
            : undefined
  const make = (id: QuickId, label: string, needsWork: boolean): QuickAction => {
    const reason = why(needsWork)
    return { id, label, enabled: !reason, reason }
  }
  return [
    make('merge', `Fusionar en ${i.base}`, true),
    make('pr', 'Crear PR…', true),
    make('push', 'Subir la rama…', true),
    make('commit', 'Solo hacer commit…', true),
    make('discard', 'Descartar rama', false)
  ]
}

// Cómo se ve un trabajo en curso dentro del botón: "Fusionando… 4 s".
const DOING: Record<QuickId, string> = {
  merge: 'Fusionando',
  pr: 'Subiendo',
  push: 'Subiendo',
  commit: 'Guardando',
  discard: 'Descartando'
}
export const progressLabel = (id: QuickId, seconds: number): string =>
  `${DOING[id]}…${seconds >= 2 ? ` ${seconds} s` : ''}`

// La lista de archivos como árbol plegable: filas de carpeta y de archivo con su profundidad.
export type Row<T> =
  | { kind: 'dir'; path: string; name: string; depth: number; open: boolean }
  | { kind: 'file'; file: T; name: string; depth: number }

export function treeRows<T extends { path: string }>(files: T[], collapsed: Set<string>): Row<T>[] {
  // Las carpetas con un solo hijo carpeta se unen (src/main/x → una fila), como en un explorador.
  type Node = { name: string; path: string; dirs: Map<string, Node>; files: T[] }
  const root: Node = { name: '', path: '', dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${part}` : part
      if (!node.dirs.has(part))
        node.dirs.set(part, { name: part, path, dirs: new Map(), files: [] })
      node = node.dirs.get(part)!
    }
    node.files.push(f)
  }
  const out: Row<T>[] = []
  const walk = (node: Node, depth: number): void => {
    for (let dir of [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      let name = dir.name
      while (dir.dirs.size === 1 && dir.files.length === 0) {
        dir = [...dir.dirs.values()][0]
        name += `/${dir.name}`
      }
      const open = !collapsed.has(dir.path)
      out.push({ kind: 'dir', path: dir.path, name, depth, open })
      if (open) walk(dir, depth + 1)
    }
    for (const file of node.files) {
      out.push({ kind: 'file', file, name: file.path.split('/').pop()!, depth })
    }
  }
  walk(root, 0)
  return out
}

// El texto de la línea `n` de un lado del patch (la quitada o la nueva), para citarla al agente.
// Devuelve '' si el patch no la contiene.
export function patchLine(patch: string, side: 'deletions' | 'additions', n: number): string {
  let oldN = 0
  let newN = 0
  for (const line of patch.split(/\r?\n/)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      oldN = Number(hunk[1])
      newN = Number(hunk[2])
      continue
    }
    if (!oldN && !newN) continue // todavía en la cabecera
    const mark = line[0]
    if (mark === '\\') continue // "No newline at end of file"
    if (mark === '-') {
      if (side === 'deletions' && oldN === n) return line.slice(1)
      oldN++
    } else if (mark === '+') {
      if (side === 'additions' && newN === n) return line.slice(1)
      newN++
    } else {
      if ((side === 'deletions' ? oldN : newN) === n) return line.slice(1)
      oldN++
      newN++
    }
  }
  return ''
}
