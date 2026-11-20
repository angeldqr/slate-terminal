import { connect, createServer, type Socket } from 'node:net'
import { readFileSync, rmSync } from 'node:fs'
import * as pty from 'node-pty'
import {
  PROTOCOL,
  readLines,
  send,
  type FromHost,
  type HostSession,
  type Meta,
  type ToHost
} from './host-protocol'

// Host de sesiones: un proceso aparte que mantiene vivas las terminales aunque Slate se cierre.
// ponytail: la tubería tiene un nombre predecible y la ACL por defecto de Windows; otro usuario
// del equipo que la creara antes podría recibir el token. Aceptable en un equipo de una persona;
// con varios usuarios, una ACL propia.
// Slate lo lanza desacoplado y se reconecta al volver. Aquí solo viven los procesos y lo que
// imprimieron; estados, hooks, MCP y git siguen en Slate.
// Argumentos: la tubería donde escuchar y el archivo con el token que debe traer Slate.

const [pipe, tokenFile] = process.argv.slice(2)
const token = readFileSync(tokenFile, 'utf8').trim()
const MAX_BUFFER = 256 * 1024 // lo mismo que guardaba Slate: lo que se repinta al volver
// Sin Slate conectado: si no queda ninguna sesión, el host se va enseguida; si solo quedan
// terminadas, las guarda un rato para que Slate muestre cómo acabaron al volver.
const EMPTY_EXIT_MS = 10_000
const DEAD_EXIT_MS = 60 * 60_000

type Session = {
  id: string
  proc: pty.IPty
  buffer: string
  meta: Meta
  exited: boolean
  cols: number
  rows: number
}
const sessions = new Map<string, Session>()
let client: Socket | null = null
let idleTimer: ReturnType<typeof setTimeout> | undefined
let stopping = false

const tell = (msg: FromHost): void => {
  if (client) send(client, msg)
}

// Si no queda nada vivo que cuidar ni nadie conectado, no tiene sentido seguir.
function checkIdle(): void {
  clearTimeout(idleTimer)
  const alive = [...sessions.values()].some((s) => !s.exited)
  if (alive || client) return
  idleTimer = setTimeout(() => process.exit(0), sessions.size ? DEAD_EXIT_MS : EMPTY_EXIT_MS)
}

function spawn(id: string, req: Extract<ToHost, { t: 'spawn' }>['req'], meta: Meta): void {
  const proc = pty.spawn(req.file, req.args, {
    name: 'xterm-256color',
    cols: req.cols,
    rows: req.rows,
    cwd: req.cwd,
    env: req.env
  })
  const s: Session = { id, proc, buffer: '', meta, exited: false, cols: req.cols, rows: req.rows }
  sessions.set(id, s)
  proc.onData((data) => {
    s.buffer = (s.buffer + data).slice(-MAX_BUFFER)
    tell({ t: 'data', id, data })
  })
  proc.onExit(() => {
    s.exited = true
    tell({ t: 'exit', id })
    checkIdle()
  })
}

function handle(msg: ToHost): void {
  const s = 'id' in msg ? sessions.get(msg.id) : undefined
  switch (msg.t) {
    case 'spawn':
      try {
        spawn(msg.id, msg.req, msg.meta)
        tell({ t: 'spawned', rid: msg.rid, id: msg.id })
      } catch (err) {
        tell({ t: 'spawned', rid: msg.rid, id: msg.id, error: (err as Error).message })
      }
      return
    case 'write':
      if (s && !s.exited) s.proc.write(msg.data)
      return
    case 'resize':
      if (!s || s.exited || msg.cols <= 0 || msg.rows <= 0) return
      s.proc.resize(msg.cols, msg.rows)
      s.cols = msg.cols
      s.rows = msg.rows
      return
    case 'kill':
      if (s && !s.exited) s.proc.kill()
      sessions.delete(msg.id)
      checkIdle()
      return
    case 'meta':
      if (s) s.meta = { ...s.meta, ...msg.meta }
      return
    case 'list': {
      const list: HostSession[] = [...sessions.values()].map(
        ({ id, meta, buffer, exited, cols, rows }) => ({ id, meta, buffer, exited, cols, rows })
      )
      tell({ t: 'list', rid: msg.rid, sessions: list })
      return
    }
    case 'shutdown':
      // Deja de escuchar en el acto: un Slate que se abra mientras este host se apaga lanza uno
      // nuevo en vez de conectarse a este y perder sus sesiones con él.
      stopping = true
      server.close()
      for (const x of sessions.values()) if (!x.exited) x.proc.kill()
      // Un momento para que las consolas terminen de cerrarse (ver closeAndWait en sessions.ts).
      setTimeout(() => process.exit(0), 1500)
      return
  }
}

// Un solo Slate a la vez: si se conecta otro (Slate se reabrió), el anterior queda fuera.
const server = createServer((socket) => {
  if (stopping) return void socket.destroy()
  let authed = false
  readLines(socket, (raw) => {
    const msg = raw as ToHost
    if (!authed) {
      if (msg.t !== 'hello' || msg.token !== token) {
        socket.destroy()
        return
      }
      authed = true
      client?.destroy()
      client = socket
      clearTimeout(idleTimer)
      send(socket, { t: 'ready', protocol: PROTOCOL })
      return
    }
    handle(msg)
  })
  socket.on('close', () => {
    if (client === socket) client = null
    checkIdle()
  })
  socket.on('error', () => socket.destroy())
})

server.on('error', () => process.exit(1)) // otro host ya escucha en esta tubería
if (process.platform === 'win32') {
  server.listen(pipe, checkIdle)
} else {
  // En Unix el socket es un archivo: uno viejo de un host caído no debe impedir escuchar, pero
  // el de un host vivo no se toca (si responde, este sobra y se va).
  const probe = connect(pipe)
  probe.once('connect', () => process.exit(0))
  probe.once('error', () => {
    rmSync(pipe, { force: true })
    server.listen(pipe, checkIdle)
  })
}
