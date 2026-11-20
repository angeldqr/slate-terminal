import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// Git sin shell: los argumentos (ramas, mensajes) nunca pasan por un intérprete.
// Sin imports de electron, para probarlo con `npm run check`.
export function git(args: string[], cwd: string): Promise<string> {
  return new Promise((done, fail) =>
    execFile(
      'git',
      args,
      { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? fail(new Error(stderr.trim() || err.message)) : done(stdout))
    )
  )
}

export const repoRoot = (path: string): Promise<string | null> =>
  git(['rev-parse', '--show-toplevel'], path).then(
    (out) => out.trim(),
    () => null
  )

export const currentBranch = async (root: string): Promise<string> =>
  (await git(['rev-parse', '--abbrev-ref', 'HEAD'], root)).trim()

// "Añadir búsqueda al panel" → "anadir-busqueda-al-panel": válido en una rama y en una carpeta,
// y corto (la ruta del worktree no debe acercarse al límite de Windows).
export const slug = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita las tildes que NFD separó
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '') || 'sesion'

export type Worktree = { path: string; branch: string; base: string }

// Cada worktree vive dentro del repo, en .slate/worktrees/<nombre>, con su rama slate/<nombre>.
// Dentro del repo, para que viva junto al proyecto; .slate/ va a .git/info/exclude, que es local y
// no toca el .gitignore. Cada worktree es una carpeta nueva: Claude Code pregunta si confía en ella.
export async function createWorktree(root: string, name: string): Promise<Worktree> {
  const exclude = (await git(['rev-parse', '--git-path', 'info/exclude'], root)).trim()
  const excludePath = resolve(root, exclude) // relativa al repo o absoluta, según el caso
  let current = ''
  try {
    current = readFileSync(excludePath, 'utf8')
  } catch {
    // sin archivo de exclusiones todavía: se crea al añadir la línea
  }
  if (!current.split(/\r?\n/).includes('.slate/')) {
    mkdirSync(dirname(excludePath), { recursive: true })
    appendFileSync(excludePath, `${current && !current.endsWith('\n') ? '\n' : ''}.slate/\n`)
  }

  const base = await currentBranch(root)
  const path = join(root, '.slate', 'worktrees', name)
  const branch = `slate/${name}`
  await git(['worktree', 'add', '-b', branch, path, 'HEAD'], root)
  return { path, branch, base }
}

export async function removeWorktree(root: string, wt: Worktree): Promise<void> {
  await git(['worktree', 'remove', '--force', wt.path], root)
  await git(['branch', '-D', wt.branch], root)
}

// Nombres ya usados en el repo: las ramas slate/* y también las carpetas que queden en
// .slate/worktrees (una carpeta sin rama haría fallar `worktree add`).
export async function worktreeNames(root: string): Promise<string[]> {
  const out = await git(['branch', '--list', 'slate/*', '--format=%(refname:short)'], root)
  let dirs: string[] = []
  try {
    dirs = readdirSync(join(root, '.slate', 'worktrees'))
  } catch {
    // todavía no hay ninguna
  }
  const branches = out
    .split('\n')
    .filter(Boolean)
    .map((b) => b.replace(/^slate\//, ''))
  return [...new Set([...branches, ...dirs])]
}
