import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { app } from 'electron'
import * as pty from 'node-pty'
import { AGENTS } from './agents'
import { nextStatus, type StatusEvent } from './status'
import type { SessionInfo, SessionKind, SessionOpts, SessionWorktree } from '../shared/types'
import { writeHookSettings, removeHookSettings } from './hooks'
import { freeTitle, samePath } from './titles'
import { createWorktree, removeWorktree, repoRoot, slug, worktreeNames } from './git'

type Session = SessionInfo & { pty: pty.IPty; buffer: string; quiet?: NodeJS.Timeout }

const sessions = new Map<string, Session>()
const MAX_BUFFER = 256 * 1024 // lo que se le devuelve al renderer si se recarga
const QUIET_MS = 1500 // silencio que cuenta como "terminó" en agentes sin hooks

let send: (channel: string, ...args: unknown[]) => void = () => {}
export const onSessionEvent = (fn: typeof send): void => void (send = fn)

const isWin = process.platform === 'win32'
const defaultShell = ((): string => {
  if (!isWin) return process.env.SHELL || '/bin/bash'
  try {
    execFileSync('where', ['pwsh'], { stdio: 'ignore' })
    return 'pwsh.exe'
  } catch {
    return 'powershell.exe'
  }
})()

// El agente corre dentro de la shell: al salir de él queda la shell en la misma carpeta.
function launch(command?: string): [string, string[]] {
  if (!command) return [defaultShell, isWin ? ['-NoLogo'] : ['-l']]
  return isWin
    ? [defaultShell, ['-NoLogo', '-NoExit', '-Command', command]]
    : [defaultShell, ['-l', '-c', `${command}; exec ${defaultShell} -l`]]
}

const quote = (s: string): string =>
  isWin ? `'${s.replace(/'/g, "''")}'` : `'${s.replace(/'/g, `'\\''`)}'`

function update(s: Session, ev: StatusEvent): void {
  const status = nextStatus(s.status, ev, s.hooked)
  if (status === s.status) return
  s.status = status
  send('session:status', s.id, status)
}

// Quita secuencias OSC (títulos, enlaces…) para que su BEL de cierre no cuente como campana.
// eslint-disable-next-line no-control-regex -- ESC y BEL son justo lo que se busca
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
// eslint-disable-next-line no-control-regex
const NOTIFY = /\x1b\](?:9|777);/

// La tarea viaja en un archivo y la shell la lee: así comillas y saltos de línea llegan intactos
// al agente, sin pasar por las reglas de citado de la línea de comandos.
// ponytail: en Windows PowerShell 5.1 las comillas dobles dentro de la tarea pueden partirse al
// pasar a un ejecutable; con pwsh 7 (el que Slate prefiere) llegan bien.
const promptDir = join(app.getPath('userData'), 'prompts')
function promptArg(id: string, prompt: string): string {
  mkdirSync(promptDir, { recursive: true })
  const file = join(promptDir, `${id}.txt`)
  writeFileSync(file, prompt)
  // -Encoding UTF8: Windows PowerShell 5.1 leería el archivo como ANSI y rompería ñ y tildes.
  return isWin
    ? `(Get-Content -Raw -Encoding UTF8 -LiteralPath ${quote(file)})`
    : `"$(cat ${quote(file)})"`
}
const removePrompt = (id: string): void => rmSync(join(promptDir, `${id}.txt`), { force: true })

// Una rama propia para la sesión, con el nombre sacado de la tarea (o del agente).
// Si se abrió desde una subcarpeta del repo, arranca en la misma subcarpeta dentro del worktree.
async function isolate(cwd: string, name: string): Promise<SessionWorktree> {
  const root = await repoRoot(cwd)
  if (!root)
    throw new Error('Esta carpeta no es un repositorio git: no se puede aislar en una rama.')
  const wt = await createWorktree(root, freeTitle(slug(name), await worktreeNames(root), '-'))
  return { project: cwd, root, ...wt }
}

export async function createSession(
  cwd: string,
  kind: SessionKind = 'shell',
  opts: SessionOpts = {}
): Promise<SessionInfo> {
  const id = randomUUID()
  const agent = AGENTS.find((a) => a.id === kind)
  const worktree = opts.isolate
    ? await isolate(cwd, opts.prompt || agent?.name || 'shell')
    : undefined
  // La misma subcarpeta dentro del worktree si existe ahí (una carpeta sin versionar no existe).
  const sub = worktree ? relative(worktree.root, cwd) : ''
  const inside = !!sub && !sub.startsWith('..') && !isAbsolute(sub)
  const dir = !worktree
    ? cwd
    : inside && existsSync(join(worktree.path, sub))
      ? join(worktree.path, sub)
      : worktree.path
  const hooked = !!agent?.hooks
  const parts = agent && [
    agent.cmd,
    ...(hooked ? [`--settings ${quote(writeHookSettings(id))}`] : []),
    // Una tarea que empieza por "-" no debe leerse como opción: `--` cierra las opciones.
    ...(opts.prompt && agent.promptFlag !== undefined
      ? [
          agent.promptFlag || (opts.prompt.trimStart().startsWith('-') ? '--' : ''),
          promptArg(id, opts.prompt)
        ].filter(Boolean)
      : [])
  ]
  const [file, args] = launch(parts?.join(' '))

  let proc: pty.IPty
  try {
    proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: dir,
      env: {
        ...process.env,
        SLATE_SESSION_ID: id,
        TERM_PROGRAM: 'Slate',
        COLORTERM: 'truecolor'
      } as Record<string, string>
    })
  } catch (err) {
    // Sin proceso no hay sesión: no se dejan atrás la rama ni los archivos de la sesión.
    removeHookSettings(id)
    removePrompt(id)
    if (worktree) await removeWorktree(worktree.root, worktree).catch(() => {})
    throw err
  }
  const s: Session = {
    id,
    cwd: dir,
    kind,
    title: freeTitle(
      agent?.name ?? 'Shell',
      // Se numeran por carpeta de la barra lateral, contando también las aisladas en ramas.
      [...sessions.values()]
        .filter((x) => samePath(x.worktree?.project ?? x.cwd, cwd))
        .map((x) => x.title)
    ),
    status: 'idle',
    hooked,
    worktree,
    pty: proc,
    buffer: ''
  }
  sessions.set(id, s)

  proc.onData((data) => {
    s.buffer = (s.buffer + data).slice(-MAX_BUFFER)
    send('session:data', id, data)
    const bell = NOTIFY.test(data) || data.replace(OSC, '').includes('\x07')
    // En una shell normal solo el BEL importa; la salida de `ls` no es "trabajar".
    if (kind === 'shell') return bell ? update(s, { type: 'output', bell }) : undefined
    update(s, { type: 'output', bell })
    if (!hooked) {
      clearTimeout(s.quiet)
      s.quiet = setTimeout(() => update(s, { type: 'quiet' }), QUIET_MS)
    }
  })
  proc.onExit(() => {
    clearTimeout(s.quiet)
    update(s, { type: 'exit' })
    removeHookSettings(id)
    removePrompt(id)
  })
  return info(s)
}

const info = ({ id, cwd, kind, title, status, hooked, worktree }: Session): SessionInfo => ({
  id,
  cwd,
  kind,
  title,
  status,
  hooked,
  worktree
})

export const listSessions = (): SessionInfo[] => [...sessions.values()].map(info)

// Lo que ya imprimió la sesión, para pintarla al volver a montarla.
export const readBuffer = (id: string): string => sessions.get(id)?.buffer ?? ''

export function handleHook(id: string, ev: { hook_event_name?: string }): void {
  const s = sessions.get(id)
  if (s && ev.hook_event_name) update(s, { type: 'hook', name: ev.hook_event_name })
}

export function writeSession(id: string, data: string): void {
  sessions.get(id)?.pty.write(data)
}

export function resizeSession(id: string, cols: number, rows: number): void {
  const s = sessions.get(id)
  if (s && s.status !== 'exited' && cols > 0 && rows > 0) s.pty.resize(cols, rows)
}

export function renameSession(id: string, title: string): void {
  const s = sessions.get(id)
  if (s) s.title = title.trim() || s.title
}

export function closeSession(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  sessions.delete(id)
  clearTimeout(s.quiet)
  if (s.status !== 'exited') s.pty.kill()
  removeHookSettings(id)
  removePrompt(id)
}

// En Windows, matar una pty es asíncrono (lista los procesos de su consola con un ayudante y
// vacía la salida en otro hilo): salir sin esperar deja el proceso de Slate colgado al cerrar.
// Por eso se espera a que terminen, con un tope por si alguna no responde.
export async function closeAll(): Promise<void> {
  const exited = [...sessions.values()]
    .filter((s) => s.status !== 'exited')
    .map((s) => new Promise<void>((done) => s.pty.onExit(() => done())))
  for (const id of [...sessions.keys()]) closeSession(id)
  await Promise.race([Promise.all(exited), new Promise((done) => setTimeout(done, 3000))])
}
