import { connect, createServer, type Socket } from 'node:net'
import { appendFileSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
import { createMirror, type Mirror } from './mirror'

// Un aviso en host.log (junto al token), sin cortar nada: para lo que se degrada sin fallar.
const note = (text: string): void => {
  try {
    appendFileSync(
      join(dirname(process.argv[3] ?? '.'), 'host.log'),
      `${new Date().toISOString()} ${text}\n`
    )
  } catch {
    // sin registro no se pierde nada importante
  }
}

// Host de sesiones: un proceso aparte que mantiene vivas las terminales aunque Slate se cierre.
// ponytail: la tubería tiene un nombre predecible y la ACL por defecto de Windows; otro usuario
// del equipo que la creara antes podría recibir el token. Aceptable en un equipo de una persona;
// con varios usuarios, una ACL propia.
// Slate lo lanza desacoplado y se reconecta al volver. Aquí solo viven los procesos y lo que
// imprimieron; estados, hooks, MCP y git siguen en Slate.
// Argumentos: la tubería donde escuchar y el archivo con el token que debe traer Slate.

const [pipe, tokenFile] = process.argv.slice(2)
const token = readFileSync(tokenFile, 'utf8').trim()
// Sin Slate conectado: si no queda ninguna sesión, el host se va enseguida; si solo quedan
// terminadas, las guarda un rato para que Slate muestre cómo acabaron al volver.
const EMPTY_EXIT_MS = 10_000
const DEAD_EXIT_MS = 60 * 60_000

type Session = {
  id: string
  proc: pty.IPty
  screen: Mirror // lo que se repinta cuando Slate vuelve
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
  const options = {
    name: 'xterm-256color',
    cols: req.cols,
    rows: req.rows,
    cwd: req.cwd,
    env: req.env
  }
  // En Windows se usa la ConPTY que trae node-pty (la misma de Windows Terminal): la del sistema
  // redibuja la pantalla al cambiar de tamaño y, con una TUI como Claude Code, duplica y mezcla
  // filas. Si no carga, se usa la del sistema.
  let proc: pty.IPty
  try {
    proc = pty.spawn(req.file, req.args, {
      ...options,
      ...(process.platform === 'win32' && { useConptyDll: true })
    })
  } catch (err) {
    note(
      `ConPTY de node-pty no disponible, se usa la del sistema: ${(err as Error)?.message ?? err}`
    )
    proc = pty.spawn(req.file, req.args, options)
  }
  const s: Session = {
    id,
    proc,
    screen: createMirror(req.cols, req.rows),
    meta,
    exited: false,
    cols: req.cols,
    rows: req.rows
  }
  sessions.set(id, s)
  proc.onData((data) => {
    s.screen.write(data)
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
      s.screen.term.resize(msg.cols, msg.rows)
      s.cols = msg.cols
      s.rows = msg.rows
      return
    case 'kill':
      if (s && !s.exited) s.proc.kill()
      s?.screen.term.dispose()
      sessions.delete(msg.id)
      checkIdle()
      return
    case 'meta':
      if (s) s.meta = { ...s.meta, ...msg.meta }
      return
    case 'list': {
      const { rid, screens } = msg
      Promise.all(
        [...sessions.values()].map(async ({ id, meta, screen, exited, cols, rows, proc }) => {
          const base: HostSession = { id, meta, exited, cols, rows, pid: proc.pid }
          if (!screens) return base
          const shot = await screen.snapshot()
          return { ...base, screen: shot.data, cols: shot.cols, rows: shot.rows }
        })
      ).then((list) => tell({ t: 'list', rid, sessions: list, hostPid: process.pid }))
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
