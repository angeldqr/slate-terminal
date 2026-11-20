import { isAbsolute } from 'node:path'
import { shell } from 'electron'
import type { Changes, SessionWorktree } from '../shared/types'
import {
  changes,
  commitAll,
  compareUrl,
  currentBranch,
  diffFrom,
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

export async function sessionChanges(id: string): Promise<Changes | null> {
  const t = await target(id)
  if (!t) return null
  try {
    const from = await diffFrom(t.root, t.base)
    return {
      branch: await currentBranch(t.root),
      base: t.base ?? 'HEAD',
      isolated: !!t.wt,
      files: await changes(t.root, from)
    }
  } catch {
    return null // repo sin commits todavía: no hay con qué comparar
  }
}

export async function sessionFileDiff(id: string, path: string): Promise<string> {
  const t = await target(id)
  // La ruta llega del renderer: solo se sirve si es una de las que cambiaron (así no se puede
  // leer un .env ignorado ni nada fuera del repo).
  const file = String(path)
  if (!t || isAbsolute(file) || file.split(/[\\/]/).includes('..')) return ''
  const from = await diffFrom(t.root, t.base)
  if (!(await changes(t.root, from)).some((f) => f.path === file)) return ''
  return fileDiff(t.root, from, file)
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

export async function commitBranch(id: string, message: string): Promise<boolean> {
  const wt = await isolated(id)
  return commitAll(wt.path, commitMessage(message))
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

// Sube la rama y abre el PR: con `gh` si está instalado; si no, la página "comparar" de GitHub.
export async function openPullRequest(id: string, message: string): Promise<string> {
  const wt = await isolated(id)
  const msg = commitMessage(message)
  await commitAll(wt.path, msg)
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
