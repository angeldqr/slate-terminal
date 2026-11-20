import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import { app } from 'electron'
import hostPath from './host?modulePath'
import {
  PROTOCOL,
  pipePath,
  readLines,
  send,
  type FromHost,
  type HostSession,
  type Meta,
  type SpawnRequest
} from './host-protocol'

// El lado de Slate del host de sesiones (host.ts). Lo encuentra o lo lanza, y ofrece una
// "pty remota" con la misma forma que la de node-pty para que sessions.ts apenas cambie.

const dataDir = app.getPath('userData')
const pipe = pipePath(dataDir)
const tokenFile = join(dataDir, 'host-token')

// El mismo token entre arranques: un host que sigue vivo de la vez anterior lo reconoce.
function token(): string {
  try {
    return readFileSync(tokenFile, 'utf8').trim()
  } catch {
    const fresh = randomBytes(24).toString('hex')
    writeFileSync(tokenFile, fresh, { mode: 0o600 })
    return fresh
  }
}

type Listener<T> = Set<(arg: T) => void>
let socket: Socket | null = null
let nextRid = 0
const replies = new Map<number, { done: (msg: FromHost) => void; fail: (err: Error) => void }>()
const dataListeners = new Map<string, Listener<string>>()
const exitListeners = new Map<string, Listener<void>>()
// Salida que llegó antes de que su sesión se registrara (en el mismo paquete que la respuesta a
// spawn o list): se entrega en cuanto alguien la escucha.
const unclaimed = new Map<string, string>()
const REQUEST_MS = 15_000

const listen = <T>(
  map: Map<string, Listener<T>>,
  id: string,
  fn: (arg: T) => void
): { dispose: () => void } => {
  const set = map.get(id) ?? new Set()
  map.set(id, set)
  set.add(fn)
  const early = map === (dataListeners as unknown) ? unclaimed.get(id) : undefined
  if (early !== undefined) {
    unclaimed.delete(id)
    queueMicrotask(() => (fn as (arg: string) => void)(early))
  }
  return { dispose: (): void => void set.delete(fn) }
}

function onMessage(msg: FromHost): void {
  if (msg.t === 'data') {
    const set = dataListeners.get(msg.id)
    if (set?.size) return set.forEach((fn) => fn(msg.data))
    unclaimed.set(msg.id, (unclaimed.get(msg.id) ?? '') + msg.data)
    return
  }
  if (msg.t === 'exit') {
    exitListeners.get(msg.id)?.forEach((fn) => fn())
    // Terminó: sus oyentes ya no harán falta.
    dataListeners.delete(msg.id)
    exitListeners.delete(msg.id)
    unclaimed.delete(msg.id)
    return
  }
  if ('rid' in msg) {
    replies.get(msg.rid)?.done(msg)
    replies.delete(msg.rid)
  }
}

const request = <T extends FromHost>(
  msg: (rid: number) => Parameters<typeof send>[1]
): Promise<T> =>
  new Promise((done, fail) => {
    if (!socket) return fail(new Error('El host de sesiones no está conectado.'))
    const rid = ++nextRid
    // Sin respuesta en un tiempo razonable (o si el host se cae), la petición falla en vez de
    // dejar a quien espera colgado para siempre.
    const timer = setTimeout(() => {
      replies.delete(rid)
      fail(new Error('El host de sesiones no respondió.'))
    }, REQUEST_MS)
    replies.set(rid, {
      done: (reply) => (clearTimeout(timer), done(reply as T)),
      fail: (err) => (clearTimeout(timer), fail(err))
    })
    send(socket, msg(rid))
  })

const tryConnect = (): Promise<Socket | null> =>
  new Promise((done) => {
    const s = connect(pipe)
    s.once('connect', () => done(s))
    s.once('error', () => done(null))
  })

// ponytail: necesita el fuse RunAsNode de Electron activo (lo está por defecto); si algún día se
// apaga, el host tendría que ser un ejecutable propio.
// En Windows un hijo hereda los handles heredables del padre: el host se quedaría con las
// tuberías de quien lanzó Slate (una terminal, `npm run dev`) y ese proceso creería que Slate
// sigue abierto mientras el host viva. Start-Process lo crea con ShellExecute, sin heredar nada;
// el PowerShell intermedio vive medio segundo y solo cuando no había host.
function launchHost(): void {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  const args = [hostPath, pipe, tokenFile]
  if (process.platform !== 'win32') {
    spawn(process.execPath, args, { detached: true, stdio: 'ignore', env })
      .on('error', () => {}) // si no arranca, startHost lo dice al no poder conectarse
      .unref()
    return
  }
  const ps = (text: string): string => `'${text.replace(/'/g, "''")}'`
  const list = args.map((a) => ps(`"${a}"`)).join(',')
  spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process -FilePath ${ps(process.execPath)} -ArgumentList ${list} -WindowStyle Hidden`
    ],
    { stdio: 'ignore', windowsHide: true, env }
  )
    .on('error', () => {}) // sin PowerShell, startHost lo dice al no poder conectarse
    .unref()
}

// Un host de otra versión de Slate (se actualizó con sesiones vivas): no se entienden.
export class HostVersionError extends Error {}
let stale: Socket | null = null

// Detiene ese host viejo, con sus sesiones, y arranca uno de esta versión.
export async function replaceHost(): Promise<void> {
  if (stale) send(stale, { t: 'shutdown' })
  // Deja de escuchar en el acto (host.ts): en cuanto la tubería no responde, se lanza el nuevo.
  for (let i = 0; i < 50; i++) {
    const probe = await tryConnect()
    if (!probe) break
    probe.destroy()
    await new Promise((r) => setTimeout(r, 100))
  }
  stale?.destroy()
  stale = null
  await startHost()
}

// Se conecta al host que ya corre o lanza uno nuevo, desacoplado: así sobrevive al cierre de
// Slate. Corre con el mismo binario en modo Node, así node-pty encaja sin compilar nada.
export async function startHost(): Promise<void> {
  const secret = token()
  let s = await tryConnect()
  // Se reintenta el lanzamiento: si un host viejo aún soltaba la tubería, el nuevo no pudo
  // escuchar y se fue. El primer arranque de PowerShell puede tardar con el antivirus.
  for (let i = 0; i < 200 && !s; i++) {
    if (i % 40 === 0) launchHost()
    await new Promise((r) => setTimeout(r, 100))
    s = await tryConnect()
  }
  if (!s) throw new Error('No se pudo arrancar el host de sesiones.')
  const ready = new Promise<void>((done, fail) => {
    readLines(s!, (raw) => {
      const msg = raw as FromHost
      if (msg.t === 'ready') {
        if (msg.protocol !== PROTOCOL) {
          stale = s // se puede detener con replaceHost()
          return fail(new HostVersionError('El host de sesiones es de otra versión de Slate.'))
        }
        return done()
      }
      onMessage(msg)
    })
    s!.once('close', () => fail(new Error('El host de sesiones rechazó la conexión.')))
  })
  send(s, { t: 'hello', token: secret, protocol: PROTOCOL })
  await ready
  socket = s
  // Si el host se cae, sus sesiones terminaron: cada una se entera por su onExit, y lo que
  // esperaba respuesta falla.
  s.on('close', () => {
    socket = null
    replies.forEach((r) => r.fail(new Error('Se perdió el host de sesiones.')))
    replies.clear()
    exitListeners.forEach((set) => set.forEach((fn) => fn()))
  })
}

// Lo mismo que usa sessions.ts de una pty de node-pty, pero hablando con el host.
export class RemotePty {
  constructor(readonly id: string) {}
  write(data: string): void {
    if (socket) send(socket, { t: 'write', id: this.id, data })
  }
  resize(cols: number, rows: number): void {
    if (socket) send(socket, { t: 'resize', id: this.id, cols, rows })
  }
  kill(): void {
    if (socket) send(socket, { t: 'kill', id: this.id })
  }
  onData(fn: (data: string) => void): { dispose: () => void } {
    return listen(dataListeners, this.id, fn)
  }
  onExit(fn: () => void): { dispose: () => void } {
    return listen(exitListeners, this.id, fn)
  }
}

export async function spawnRemote(id: string, req: SpawnRequest, meta: Meta): Promise<RemotePty> {
  const reply = await request<Extract<FromHost, { t: 'spawned' }>>((rid) => ({
    t: 'spawn',
    rid,
    id,
    req,
    meta
  }))
  if (reply.error) throw new Error(reply.error)
  return new RemotePty(id)
}

export async function listRemote(): Promise<HostSession[]> {
  return (await request<Extract<FromHost, { t: 'list' }>>((rid) => ({ t: 'list', rid }))).sessions
}

export const setMeta = (id: string, meta: Meta): void => {
  if (socket) send(socket, { t: 'meta', id, meta })
}

// Detiene todas las sesiones y el host (salir sin mantenerlas).
export const shutdownHost = (): void => {
  if (socket) send(socket, { t: 'shutdown' })
}
