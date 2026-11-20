import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { app } from 'electron'
import { Terminal } from '@xterm/headless'
import { AGENTS } from './agents'
import { nextStatus, type StatusEvent } from './status'
import type {
  SessionInfo,
  SessionKind,
  SessionOpts,
  SessionWorktree,
  Status
} from '../shared/types'
import { writeHookSettings, removeHookSettings, writeMcpConfig } from './hooks'
import { freeTitle, samePath } from './titles'
import { createWorktree, removeWorktree, repoRoot, slug, worktreeNames } from './git'
import { listRemote, RemotePty, setMeta, spawnRemote } from './host-client'

// La pty vive en el host de sesiones (host.ts): sobrevive al cierre de Slate.
type Session = SessionInfo & {
  pty: RemotePty
  buffer: string
  quiet?: NodeJS.Timeout
  // Una copia de lo que se ve en su terminal, para que otro agente pueda leerla tal cual.
  screen: Terminal
  // Quien espera un cambio de estado (wait_for_status del MCP).
  waiters: Set<() => void>
}

const sessions = new Map<string, Session>()
const MAX_BUFFER = 256 * 1024 // lo que se le devuelve al renderer si se recarga
const QUIET_MS = 1500 // silencio que cuenta como "terminó" en agentes sin hooks

let send: (channel: string, ...args: unknown[]) => void = () => {}
export const onSessionEvent = (fn: typeof send): void => void (send = fn)
// Para avisos al renderer que no salen de una sesión concreta (sesiones lanzadas por MCP).
export const emit = (channel: string, ...args: unknown[]): void => send(channel, ...args)

// La salida de todas las sesiones viaja junta cada ~6 ms (menos de un frame): un agente que
// imprime a ráfagas no satura el IPC con miles de mensajes pequeños.
const pending = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | undefined
function queueData(id: string, data: string): void {
  pending.set(id, (pending.get(id) ?? '') + data)
  flushTimer ??= setTimeout(flushData, 6)
}
function flushData(): void {
  clearTimeout(flushTimer)
  flushTimer = undefined
  if (!pending.size) return
  send('session:data', Object.fromEntries(pending))
  pending.clear()
}

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

// Las shells instaladas que se pueden elegir en Ajustes para las terminales nuevas. Los agentes
// siempre arrancan en la de por defecto: su orden de arranque está escrito para ella.
type ShellChoice = { id: string; name: string; file: string; args: string[] }
const has = (exe: string): boolean => {
  try {
    execFileSync(isWin ? 'where' : 'which', [exe], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
// ponytail: se detectan una vez por arranque; una shell instalada con Slate abierto aparece al
// reabrirlo.
let shells: ShellChoice[] | undefined
export function listShells(): { id: string; name: string }[] {
  shells ??= (
    isWin
      ? [
          { id: 'pwsh', name: 'PowerShell 7', file: 'pwsh.exe', args: ['-NoLogo'] },
          {
            id: 'powershell',
            name: 'Windows PowerShell',
            file: 'powershell.exe',
            args: ['-NoLogo']
          },
          { id: 'cmd', name: 'Símbolo del sistema', file: 'cmd.exe', args: [] },
          {
            id: 'gitbash',
            name: 'Git Bash',
            file: join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
            args: ['--login', '-i']
          },
          { id: 'wsl', name: 'WSL', file: 'wsl.exe', args: [] }
        ]
      : [
          { id: 'bash', name: 'Bash', file: 'bash', args: ['-l'] },
          { id: 'zsh', name: 'Zsh', file: 'zsh', args: ['-l'] },
          { id: 'fish', name: 'Fish', file: 'fish', args: ['-l'] }
        ]
  ).filter((s) => (s.id === 'gitbash' ? existsSync(s.file) : has(s.file)))
  return shells.map(({ id, name }) => ({ id, name }))
}
let shellChoice = 'auto'
export const setShell = (id: unknown): void => void (shellChoice = String(id ?? 'auto'))

// El agente corre dentro de la shell: al salir de él queda la shell en la misma carpeta.
function launch(command?: string): [string, string[]] {
  if (!command) {
    // Con "Automática" no hace falta mirar qué hay instalado (son llamadas que bloquean).
    if (shellChoice !== 'auto') listShells()
    const chosen = shells?.find((s) => s.id === shellChoice)
    if (chosen) return [chosen.file, chosen.args]
    return [defaultShell, isWin ? ['-NoLogo'] : ['-l']]
  }
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
  setMeta(s.id, { status })
  flushData() // la última salida llega antes que el aviso de estado
  send('session:status', s.id, status)
  s.waiters.forEach((wake) => wake())
}

// Orquestación: Claude Code recibe el MCP de Slate (ver mcp.ts). Se apaga en Ajustes.
let orchestration = true
export const setOrchestration = (on: boolean): void => void (orchestration = on)

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
async function isolate(cwd: string, name: string, task?: string): Promise<SessionWorktree> {
  const root = await repoRoot(cwd)
  if (!root)
    throw new Error('Esta carpeta no es un repositorio git: no se puede aislar en una rama.')
  const wt = await createWorktree(root, freeTitle(slug(name), await worktreeNames(root), '-'))
  return { project: cwd, root, task, ...wt }
}

export async function createSession(
  cwd: string,
  kind: SessionKind = 'shell',
  opts: SessionOpts = {}
): Promise<SessionInfo> {
  const id = randomUUID()
  const agent = AGENTS.find((a) => a.id === kind)
  const worktree = opts.isolate
    ? await isolate(cwd, opts.prompt || agent?.name || 'shell', opts.prompt)
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
    // ponytail: solo Claude Code recibe el MCP; los demás agentes lo configuran en sus propios
    // archivos (Codex en config.toml, Gemini en settings.json) y no conviene tocarlos.
    ...(hooked && orchestration ? [`--mcp-config ${quote(writeMcpConfig(id))}`] : []),
    // Una tarea que empieza por "-" no debe leerse como opción: `--` cierra las opciones.
    ...(opts.prompt && agent.promptFlag !== undefined
      ? [
          agent.promptFlag || (opts.prompt.trimStart().startsWith('-') ? '--' : ''),
          promptArg(id, opts.prompt)
        ].filter(Boolean)
      : [])
  ]
  const [file, args] = launch(parts?.join(' '))

  const base: SessionInfo = {
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
    parent: opts.parent
  }
  let proc: RemotePty
  try {
    proc = await spawnRemote(
      id,
      {
        file,
        args,
        cwd: dir,
        cols: 100,
        rows: 30,
        env: {
          ...process.env,
          SLATE_SESSION_ID: id,
          TERM_PROGRAM: 'Slate',
          COLORTERM: 'truecolor'
        } as Record<string, string>
      },
      base
    )
  } catch (err) {
    // Sin proceso no hay sesión: no se dejan atrás la rama ni los archivos de la sesión.
    removeHookSettings(id)
    removePrompt(id)
    if (worktree) await removeWorktree(worktree.root, worktree).catch(() => {})
    throw err
  }
  const s = adopt(base, proc, '')
  return info(s)
}

// Pone en marcha lo que Slate hace con una sesión: su pantalla espejo (con lo que ya imprimió,
// si viene del host), los estados según su salida y la limpieza al terminar.
function adopt(
  base: SessionInfo,
  proc: RemotePty,
  buffer: string,
  size = { cols: 100, rows: 30 }
): Session {
  const { id, kind, hooked } = base
  const s: Session = {
    ...base,
    pty: proc,
    buffer,
    screen: new Terminal({ ...size, scrollback: 2000, allowProposedApi: true }),
    waiters: new Set()
  }
  if (buffer) s.screen.write(buffer)
  sessions.set(id, s)

  proc.onData((data) => {
    s.buffer = (s.buffer + data).slice(-MAX_BUFFER)
    if (sessions.has(id)) s.screen.write(data)
    queueData(id, data)
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
  return s
}

// Al abrir Slate: las sesiones que siguieron vivas en el host (o terminaron mientras Slate
// estaba cerrado) vuelven con lo que imprimieron. Devuelve cuántas.
export async function restoreSessions(): Promise<number> {
  const remote = await listRemote()
  for (const h of remote) {
    const meta = h.meta as SessionInfo
    // Mientras Slate estaba cerrado sus hooks no llegaron: "trabajando" ya no es seguro. Queda en
    // reposo hasta su próximo evento real.
    const status = h.exited ? 'exited' : meta.status === 'working' ? 'idle' : meta.status
    adopt({ ...meta, status }, new RemotePty(h.id), h.buffer, {
      cols: h.cols,
      rows: h.rows
    })
  }
  return remote.length
}

const info = ({
  id,
  cwd,
  kind,
  title,
  status,
  hooked,
  worktree,
  parent
}: Session): SessionInfo => ({
  id,
  cwd,
  kind,
  title,
  status,
  hooked,
  worktree,
  parent
})

export const listSessions = (): SessionInfo[] => [...sessions.values()].map(info)
export const sessionInfo = (id: string): SessionInfo | undefined => {
  const s = sessions.get(id)
  return s && info(s)
}

// Lo que ya imprimió la sesión, para pintarla al volver a montarla.
// Antes de responder sale el lote pendiente: llega al renderer antes que este buffer (IPC respeta
// el orden), cuando el terminal aún no escucha; así ningún trozo se pinta dos veces.
export function readBuffer(id: string): string {
  flushData()
  return sessions.get(id)?.buffer ?? ''
}

export function handleHook(id: string, ev: { hook_event_name?: string }): void {
  const s = sessions.get(id)
  if (s && ev.hook_event_name) update(s, { type: 'hook', name: ev.hook_event_name })
}

export function writeSession(id: string, data: string): void {
  sessions.get(id)?.pty.write(data)
}

export function resizeSession(id: string, cols: number, rows: number): void {
  const s = sessions.get(id)
  if (!s || s.status === 'exited' || cols <= 0 || rows <= 0) return
  s.pty.resize(cols, rows)
  s.screen.resize(cols, rows)
}

// Las últimas `lines` líneas de lo que se ve en la sesión, en texto plano.
export function readScreen(id: string, lines: number): string | null {
  const s = sessions.get(id)
  if (!s) return null
  const buffer = s.screen.buffer.active
  // Hasta la línea del cursor: con poca salida, lo de debajo son filas vacías de la pantalla.
  const end = Math.min(buffer.length, buffer.baseY + buffer.cursorY + 1)
  const out: string[] = []
  for (let y = Math.max(0, end - lines); y < end; y++) {
    out.push(buffer.getLine(y)?.translateToString(true) ?? '')
  }
  while (out.length && !out.at(-1)!.trim()) out.pop()
  return out.join('\n')
}

// Escribe en la sesión como si lo tecleara una persona. El texto va como pegado (bracketed paste):
// así un salto de línea no envía el mensaje a medias. Enter llega un momento después, cuando la
// interfaz del agente ya tiene el texto.
// Solo si la aplicación lo activó (Claude Code sí; Windows PowerShell 5.1 no lo entiende).
// Antes se quitan los caracteres de control: un ESC o un retorno de carro dentro del texto
// podrían cerrar el pegado o enviar algo que nadie escribió.
// eslint-disable-next-line no-control-regex -- los controles son justo lo que se quita
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g
export function sendText(id: string, text: string, submit: boolean): boolean {
  const s = sessions.get(id)
  if (!s || s.status === 'exited') return false
  const clean = text.replace(CONTROL, '')
  s.pty.write(s.screen.modes.bracketedPasteMode ? `\x1b[200~${clean}\x1b[201~` : clean)
  if (submit) {
    setTimeout(() => sessions.has(id) && s.status !== 'exited' && s.pty.write('\r'), 150)
  }
  return true
}

// Resuelve cuando la sesión lleva `quietMs` sin imprimir nada (ya arrancó y espera), o a los 5 s.
export function whenSettled(id: string, quietMs = 500): Promise<void> {
  const s = sessions.get(id)
  if (!s) return Promise.resolve()
  return new Promise((done) => {
    let timer = setTimeout(finish, quietMs)
    const cap = setTimeout(finish, 5000)
    const sub = s.pty.onData(() => {
      clearTimeout(timer)
      timer = setTimeout(finish, quietMs)
    })
    function finish(): void {
      clearTimeout(timer)
      clearTimeout(cap)
      sub.dispose()
      done()
    }
  })
}

// Espera a que la sesión cambie a uno de esos estados, o hasta `ms`. Devuelve el estado final.
// Si ya está en uno, da un margen corto: si acaba de recibir un mensaje, en un instante pasará a
// "working" y entonces se sigue esperando.
// Si quien espera cancela (`signal`), la espera termina en el acto.
export function waitFor(
  id: string,
  until: readonly Status[],
  ms: number,
  signal?: AbortSignal
): Promise<Status | null> {
  const s = sessions.get(id)
  if (!s) return Promise.resolve(null)
  return new Promise((done) => {
    const finish = (): void => {
      s.waiters.delete(wake)
      clearTimeout(timer)
      clearTimeout(grace)
      signal?.removeEventListener('abort', finish)
      done(sessions.has(id) ? s.status : null) // null: la cerraron mientras se esperaba
    }
    const wake = (): void => {
      if (!sessions.has(id) || s.status === 'exited' || until.includes(s.status)) return finish()
      clearTimeout(grace) // cambió a otro estado (p. ej. trabajando): el margen ya no aplica
    }
    s.waiters.add(wake)
    signal?.addEventListener('abort', finish)
    const timer = setTimeout(finish, ms)
    const grace = until.includes(s.status) ? setTimeout(finish, 3000) : undefined
  })
}

export function renameSession(id: string, title: string): void {
  const s = sessions.get(id)
  if (!s) return
  s.title = title.trim() || s.title
  setMeta(id, { title: s.title })
}

export function closeSession(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  sessions.delete(id)
  clearTimeout(s.quiet)
  s.waiters.forEach((wake) => wake())
  s.screen.dispose() // la salida que llegue tarde ya no la escribe: la sesión salió del mapa
  s.pty.kill() // el host la olvida, viva o terminada
  removeHookSettings(id)
  removePrompt(id)
}

// En Windows, matar una pty es asíncrono: borrar la carpeta de una shell que sigue viva falla,
// y apagar el host sin esperar dejaría sus consolas a medio cerrar. Por eso se espera a que terminen, con un
// tope por si alguna no responde.
export async function closeAndWait(ids: string[]): Promise<void> {
  const exited = ids
    .map((id) => sessions.get(id))
    .filter((s) => s && s.status !== 'exited')
    .map((s) => new Promise<void>((done) => s!.pty.onExit(() => done())))
  ids.forEach(closeSession)
  await Promise.race([Promise.all(exited), new Promise((done) => setTimeout(done, 3000))])
}

export const closeAll = (): Promise<void> => closeAndWait([...sessions.keys()])
