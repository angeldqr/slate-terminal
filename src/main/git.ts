import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { lstat, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import type { FileChange } from '../shared/types'

// Programas sin shell: los argumentos (ramas, mensajes) nunca pasan por un intérprete.
// Sin imports de electron, para probarlo con `npm run check`.
export function run(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((done, fail) =>
    execFile(
      cmd,
      args,
      { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? fail(new Error(stderr.trim() || err.message)) : done(stdout))
    )
  )
}

export const git = (args: string[], cwd: string): Promise<string> => run('git', args, cwd)

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

type FileStatus = FileChange['status']

// Desde dónde se comparan los cambios: en una rama aislada, el punto donde se separó de su
// base (así se ve solo lo que hizo el agente); en un checkout normal, el último commit.
export const diffFrom = async (cwd: string, base?: string): Promise<string> =>
  base ? (await git(['merge-base', base, 'HEAD'], cwd)).trim() : 'HEAD'

// Opciones fijas para leer diffs: rutas tal cual (sin escapar acentos), sin la herramienta de
// diff externa ni colores que el usuario tenga configurados (romperían el patch) y con las rutas
// como literales (un archivo `[id].tsx` no es un patrón).
const PLAIN = ['-c', 'core.quotePath=false', '--literal-pathspecs']
const READ = ['--no-ext-diff', '--no-color', '--no-renames']

// Salida separada por NUL: ningún nombre de archivo la rompe.
const zgit = async (args: string[], cwd: string): Promise<string[]> =>
  (await git([...PLAIN, args[0], '-z', ...args.slice(1)], cwd)).split('\0').filter(Boolean)

// Lo que git no lista como añadido o borrado (cambio de tipo, conflicto…) cuenta como modificado.
const toStatus = (code: string): FileStatus => (code === 'A' || code === 'D' ? code : 'M')

// ponytail: un archivo nuevo de más de 1 MB no se lee (se muestra sin cuentas); leerlo en cada
// sondeo bloquearía main. Un diff por streaming lo resolvería si hiciera falta.
const MAX_READ = 1024 * 1024

// El texto de un archivo nuevo sin seguimiento, o null si no conviene leerlo: carpetas (un repo
// anidado), enlaces (podrían apuntar fuera del repo), binarios y archivos grandes.
async function untrackedText(cwd: string, path: string): Promise<string | null> {
  try {
    const info = await lstat(join(cwd, path))
    if (!info.isFile() || info.size > MAX_READ) return null
    const buf = await readFile(join(cwd, path))
    return buf.subarray(0, 8000).includes(0) ? null : buf.toString('utf8')
  } catch {
    return null // desapareció entre el listado y la lectura
  }
}

const lineCount = (text: string): number =>
  text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0

// Lo cambiado desde `from`, comprometido o no, más los archivos nuevos sin seguimiento.
export async function changes(cwd: string, from: string): Promise<FileChange[]> {
  const status = await zgit(['diff', ...READ, '--name-status', from, '--'], cwd)
  const numstat = await zgit(['diff', ...READ, '--numstat', from, '--'], cwd)
  const counts = new Map(
    numstat.map((row) => {
      const [add, del, path] = row.split('\t')
      return [path, { add: Number(add) || 0, del: Number(del) || 0, binary: add === '-' }]
    })
  )
  const files: FileChange[] = []
  for (let i = 0; i < status.length; i += 2) {
    const path = status[i + 1]
    const count = counts.get(path) ?? { add: 0, del: 0, binary: false }
    files.push({ path, status: toStatus(status[i][0]), ...count })
  }
  for (const path of await zgit(['ls-files', '--others', '--exclude-standard'], cwd)) {
    const text = await untrackedText(cwd, path)
    files.push({
      path,
      status: 'A',
      add: text ? lineCount(text) : 0,
      del: 0,
      binary: text === null
    })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

// El patch unificado de un archivo. Uno nuevo sin seguimiento se arma a mano: todo añadido.
export async function fileDiff(cwd: string, from: string, path: string): Promise<string> {
  const tracked = (await git([...PLAIN, 'ls-files', '--', path], cwd)).trim() !== ''
  const inHistory =
    (await git([...PLAIN, 'ls-tree', '--name-only', from, '--', path], cwd)).trim() !== ''
  if (tracked || inHistory) return git([...PLAIN, 'diff', ...READ, from, '--', path], cwd)
  const text = await untrackedText(cwd, path)
  if (!text) return ''
  const lines = text.split('\n')
  if (text.endsWith('\n')) lines.pop()
  return `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`
}

// Guarda en un commit todo lo pendiente. Devuelve false si no había nada que guardar.
export async function commitAll(cwd: string, message: string): Promise<boolean> {
  if (!(await git(['status', '--porcelain'], cwd)).trim()) return false
  await git(['add', '-A'], cwd)
  await git(['commit', '-m', message], cwd)
  return true
}

// Las líneas de crédito que añaden los agentes (Co-Authored-By de Claude, Codex, Gemini…) y
// el "Generated with …": al fusionar no pasan a la historia del proyecto.
const AGENT = /claude|anthropic|openai|codex|chatgpt|gemini|google|cursor|opencode|copilot|\bai\b/i
export const stripCredits = (message: string): string =>
  message
    .split(/\r?\n/)
    .filter(
      (line) =>
        !(/^\s*co-authored-by:/i.test(line) && AGENT.test(line)) &&
        !/^\s*(🤖\s*)?generated (with|by) /i.test(line)
    )
    .join('\n')
    .trim()

// Fusiona la rama en su base como un único commit (squash): la historia queda limpia y el
// mensaje es el de la tarea. Si algo falla, el repo principal vuelve a como estaba.
export async function mergeSquash(
  root: string,
  branch: string,
  base: string,
  message: string
): Promise<void> {
  const current = await currentBranch(root)
  if (current !== base) {
    throw new Error(`El repo principal está en ${current}: vuelve a ${base} para fusionar.`)
  }
  if ((await git(['status', '--porcelain', '--untracked-files=no'], root)).trim()) {
    throw new Error(
      `${base} tiene cambios sin guardar: haz commit o descártalos antes de fusionar.`
    )
  }
  // Deshace el squash a medias: el índice y el mensaje que git deja preparado.
  const undo = async (): Promise<void> => {
    await git(['reset', '--merge'], root).catch(() => {})
    const msg = (await git(['rev-parse', '--git-path', 'SQUASH_MSG'], root)).trim()
    await rm(resolve(root, msg), { force: true })
  }
  try {
    await git(['merge', '--squash', branch], root)
  } catch (err) {
    await undo()
    throw new Error(
      `No se pudo fusionar en ${base}: hay conflictos o archivos sin seguimiento que se pisarían. ` +
        `Git dice: ${(err as Error).message.split('\n')[0]}`,
      { cause: err }
    )
  }
  if (!(await git(['diff', '--cached', '--name-only'], root)).trim()) {
    await undo()
    throw new Error('La rama no tiene cambios que fusionar.')
  }
  try {
    await git(['commit', '-m', stripCredits(message)], root)
  } catch (err) {
    await undo() // un hook o la firma fallaron: main vuelve a como estaba
    throw new Error(`No se pudo hacer el commit en ${base}: ${(err as Error).message}`, {
      cause: err
    })
  }
}

// La página "comparar" de GitHub para abrir el PR sin `gh`. null si el remoto no es de GitHub.
export function compareUrl(remote: string, base: string, branch: string): string | null {
  const m = remote.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return m ? `https://github.com/${m[1]}/${m[2]}/compare/${base}...${branch}?expand=1` : null
}
