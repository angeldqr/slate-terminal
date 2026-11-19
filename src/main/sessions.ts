import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import * as pty from 'node-pty'
import { AGENTS } from './agents'
import { nextStatus, type StatusEvent } from './status'
import type { SessionInfo } from '../shared/types'
import { writeHookSettings, removeHookSettings } from './hooks'

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

export function createSession(cwd: string, kind = 'shell'): SessionInfo {
  const id = randomUUID()
  const agent = AGENTS.find((a) => a.id === kind)
  const hooked = !!agent?.hooks
  const command =
    agent && (hooked ? `${agent.cmd} --settings ${quote(writeHookSettings(id))}` : agent.cmd)
  const [file, args] = launch(command)

  const proc = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd,
    env: {
      ...process.env,
      SLATE_SESSION_ID: id,
      TERM_PROGRAM: 'Slate',
      COLORTERM: 'truecolor'
    } as Record<string, string>
  })
  const s: Session = {
    id,
    cwd,
    kind,
    title: agent?.name ?? 'Shell',
    status: 'idle',
    hooked,
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
  proc.onExit(({ exitCode }) => {
    clearTimeout(s.quiet)
    update(s, { type: 'exit' })
    send('session:exit', id, exitCode)
    removeHookSettings(id)
  })
  return info(s)
}

const info = ({ id, cwd, kind, title, status, hooked }: Session): SessionInfo => ({
  id,
  cwd,
  kind,
  title,
  status,
  hooked
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
}

export function closeAll(): void {
  for (const id of [...sessions.keys()]) closeSession(id)
}
