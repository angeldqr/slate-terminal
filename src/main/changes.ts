import { isAbsolute, join } from 'node:path'
import { shell } from 'electron'
import type { Changes, DiffScope, SessionWorktree } from '../shared/types'
import {
  changes,
  commitAll,
  compareUrl,
  currentBranch,
  diffFrom,
  discardFile,
  fileContents,
  fileDiff,
  git,
  mergeSquash,
  removeWorktree,
  repoRoot,
  run,
  stripCredits
} from './git'
import { closeAndWait, sessionInfo } from './sessions'

// Lo que el panel de cambios puede pedir. El renderer solo manda el id de la sesión: las rutas,
// ramas y bases salen de main, nunca del renderer.

// Dónde mirar: la carpeta del worktree (rama aislada) o la raíz del repo donde trabaja la sesión.
async function target(
  id: string
): Promise<{ root: string; base?: string; wt?: SessionWorktree } | null> {
  const s = sessionInfo(id)
  if (!s) return null
  if (s.worktree) return { root: s.worktree.path, base: s.worktree.base, wt: s.worktree }
  const root = await repoRoot(s.cwd)
  return root ? { root } : null
}

// El rango de commits que mira el panel según el alcance. En "último commit", from es el padre
// de HEAD (o el árbol vacío si es el primero) y to es HEAD.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
async function range(
  root: string,
  base: string | undefined,
  scope: DiffScope
): Promise<{ from: string; to?: string }> {
  if (scope === 'uncommitted') return { from: 'HEAD' }
  if (scope === 'last') {
    const parent = await git(['rev-parse', '--verify', '-q', 'HEAD~1'], root).then(
      (p) => p.trim(),
      () => EMPTY_TREE
    )
    return { from: parent, to: 'HEAD' }
  }
  return { from: await diffFrom(root, base) }
}

const scopeOf = (scope: unknown): DiffScope =>
  scope === 'uncommitted' || scope === 'last' ? scope : 'base'

export async function sessionChanges(id: string, scope?: DiffScope): Promise<Changes | null> {
  const t = await target(id)
  if (!t) return null
  try {
    const { from, to } = await range(t.root, t.base, scopeOf(scope))
    return {
      branch: await currentBranch(t.root),
      base: t.base ?? 'HEAD',
      isolated: !!t.wt,
      files: await changes(t.root, from, to)
    }
  } catch {
    return null // repo sin commits todavía: no hay con qué comparar
  }
}

// La ruta llega del renderer: solo se acepta si es una de las que cambiaron (así no se puede
// leer ni tocar un .env ignorado ni nada fuera del repo).
async function changedFile(
  id: string,
  path: string,
  scope?: DiffScope
): Promise<{ root: string; from: string; to?: string; file: string } | null> {
  const t = await target(id)
  const file = String(path)
  if (!t || isAbsolute(file) || file.split(/[\\/]/).includes('..')) return null
  const { from, to } = await range(t.root, t.base, scopeOf(scope))
  if (!(await changes(t.root, from, to)).some((f) => f.path === file)) return null
  return { root: t.root, from, to, file }
}

export async function sessionFileDiff(
  id: string,
  path: string,
  ignoreSpace = false,
  scope?: DiffScope
): Promise<string> {
  const f = await changedFile(id, path, scope)
  return f ? fileDiff(f.root, f.from, f.file, ignoreSpace === true, f.to) : ''
}

// Las dos versiones del archivo, para desplegar contexto.
export async function sessionFileContents(
  id: string,
  path: string,
  scope?: DiffScope
): Promise<{ old: string | null; new: string | null } | null> {
  const f = await changedFile(id, path, scope)
  return f ? fileContents(f.root, f.from, f.file, f.to) : null
}

// Muestra el archivo en el explorador o lo abre en VS Code. Nunca lo ejecuta ni lo abre con su
// programa por defecto: un .bat o .js escrito por un agente correría.
export async function showChangedFile(
  id: string,
  path: string,
  scope?: DiffScope,
  editor = false
): Promise<boolean> {
  const f = await changedFile(id, path, scope)
  if (!f) return false
  const abs = join(f.root, f.file)
  if (!editor) shell.showItemInFolder(abs)
  else {
    // Cada tramo codificado (un # o ? en el nombre cortaría la ruta); la unidad (C:) tal cual.
    const path = abs
      .replace(/\\/g, '/')
      .split('/')
      .map((part, i) => (i === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
      .join('/')
    await shell.openExternal(`vscode://file/${path}`)
  }
  return true
}

// Un commit fijo ("último commit") no se descarta archivo a archivo.
export async function discardChangedFile(
  id: string,
  path: string,
  scope?: DiffScope
): Promise<boolean> {
  const f = await changedFile(id, path, scope)
  if (!f || f.to) return false
  await discardFile(f.root, f.from, f.file)
  return true
}

// Solo para sesiones aisladas: las demás no tienen una rama propia que fusionar o descartar.
async function isolated(id: string): Promise<SessionWorktree> {
  const wt = sessionInfo(id)?.worktree
  if (!wt) throw new Error('Esta sesión no trabaja en una rama propia.')
  return wt
}

// Windows tarda un momento en soltar la carpeta de una shell recién cerrada: se reintenta.
async function remove(wt: SessionWorktree): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      return await removeWorktree(wt.root, wt)
    } catch (err) {
      if (i >= 5) throw err
      await new Promise((r) => setTimeout(r, 400))
    }
  }
}

const commitMessage = (message: string): string =>
  stripCredits(message) || 'Cambios de una sesión de Slate'

// Rutas que el usuario dejó fuera del commit: solo relativas y dentro de la carpeta.
const safePaths = (paths: unknown): string[] =>
  (Array.isArray(paths) ? paths : [])
    .map(String)
    .filter((p) => p && !isAbsolute(p) && !p.split(/[\\/]/).includes('..'))

export async function commitBranch(
  id: string,
  message: string,
  exclude?: string[]
): Promise<boolean> {
  const wt = await isolated(id)
  return commitAll(wt.path, commitMessage(message), safePaths(exclude))
}

// Una vez cerrada la sesión, que no se pueda borrar su carpeta ya no deshace lo hecho:
// se devuelve como aviso (con dónde quedó) en vez de como error.
const removeOrWarn = (wt: SessionWorktree, done: string): Promise<string> =>
  remove(wt).then(
    () => done,
    () => `${done}, pero su carpeta sigue en ${wt.path}: bórrala cuando no esté en uso.`
  )

// Fusiona en la base como un solo commit y cierra la sesión: su trabajo ya está en la base.
// Devuelve el aviso para la barra superior.
export async function mergeBranch(id: string, message: string): Promise<string> {
  const wt = await isolated(id)
  const msg = commitMessage(message)
  await commitAll(wt.path, msg)
  await mergeSquash(wt.root, wt.branch, wt.base, msg)
  await closeAndWait([id])
  // Si la sesión escribió algo después del commit, la rama se conserva para no perderlo.
  if ((await git(['status', '--porcelain'], wt.path).catch(() => '')).trim()) {
    return `Fusionado en ${wt.base}. La sesión siguió escribiendo: la rama ${wt.branch} se conserva con eso.`
  }
  return removeOrWarn(wt, `Fusionado en ${wt.base}`)
}

// Cierra la sesión y borra su carpeta y su rama, con todo lo que tuviera.
export async function discardBranch(id: string): Promise<string> {
  const wt = await isolated(id)
  await closeAndWait([id])
  return removeOrWarn(wt, 'Rama descartada')
}

// Guarda lo pendiente y sube la rama a origin, sin abrir un PR.
export async function pushBranch(id: string, message: string, exclude?: string[]): Promise<string> {
  const wt = await isolated(id)
  await commitAll(wt.path, commitMessage(message), safePaths(exclude))
  await git(['push', '-u', 'origin', wt.branch], wt.path)
  return `Rama ${wt.branch} subida a origin`
}

// Sube la rama y abre el PR: con `gh` si está instalado; si no, la página "comparar" de GitHub.
export async function openPullRequest(
  id: string,
  message: string,
  exclude?: string[]
): Promise<string> {
  const wt = await isolated(id)
  const msg = commitMessage(message)
  await commitAll(wt.path, msg, safePaths(exclude))
  await git(['push', '-u', 'origin', wt.branch], wt.path)
  const title = msg.split('\n')[0]
  try {
    const url = (
      await run(
        'gh',
        ['pr', 'create', '--base', wt.base, '--head', wt.branch, '--title', title, '--body', ''],
        wt.path
      )
    ).trim()
    if (url.startsWith('https://github.com/')) await shell.openExternal(url)
    return url
  } catch {
    const url = compareUrl(await git(['remote', 'get-url', 'origin'], wt.path), wt.base, wt.branch)
    if (!url)
      throw new Error('La rama ya está subida, pero el remoto no es de GitHub: abre el PR a mano.')
    await shell.openExternal(url)
    return url
  }
}
