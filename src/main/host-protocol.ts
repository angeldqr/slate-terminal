import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Socket } from 'node:net'

// Lo que se dicen Slate y el host de sesiones: mensajes JSON, uno por línea, por una tubería con
// nombre (Windows) o un socket de Unix. Sin imports de electron: el host corre como Node puro.

export const PROTOCOL = 2

export type SpawnRequest = {
  file: string
  args: string[]
  cwd: string
  env: Record<string, string>
  cols: number
  rows: number
}

// Lo que el host guarda de cada sesión para devolvérselo a Slate al reconectar. Slate decide qué
// es (SessionInfo); el host solo lo custodia.
export type Meta = Record<string, unknown>

export type ToHost =
  | { t: 'hello'; token: string; protocol: number }
  | { t: 'spawn'; rid: number; id: string; req: SpawnRequest; meta: Meta }
  | { t: 'write'; id: string; data: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'kill'; id: string }
  | { t: 'meta'; id: string; meta: Meta }
  | { t: 'list'; rid: number; screens?: boolean } // screens: con la foto de cada pantalla
  | { t: 'shutdown' }

export type HostSession = {
  id: string
  meta: Meta
  // Foto de su pantalla a cols × rows (mirror.ts). Un host anterior manda la salida cruda en
  // `buffer`: con ese, la sesión vuelve como antes.
  screen?: string
  buffer?: string
  exited: boolean
  cols: number // su tamaño actual: la pantalla espejo de Slate se reconstruye igual
  rows: number
  pid?: number // el proceso de la shell (Ajustes › Avanzado muestra lo que gasta)
}

export type FromHost =
  | { t: 'ready'; protocol: number }
  | { t: 'spawned'; rid: number; id: string; error?: string }
  | { t: 'list'; rid: number; sessions: HostSession[]; hostPid?: number }
  | { t: 'data'; id: string; data: string }
  | { t: 'exit'; id: string }

// Una tubería por carpeta de datos: dos instalaciones (o el recorrido de prueba con la suya)
// tienen hosts separados.
export function pipePath(userData: string): string {
  const tag = createHash('sha256').update(userData.toLowerCase()).digest('hex').slice(0, 16)
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\slate-host-${tag}`
    : join(userData, `host-${tag}.sock`)
}

// Lee mensajes de una línea cada uno, aunque lleguen partidos o varios juntos.
export function readLines(socket: Socket, onMessage: (msg: unknown) => void): void {
  let pending = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    pending += chunk
    // Una línea sin fin (alguien que no habla el protocolo) no crece sin tope.
    if (pending.length > 16 * 1024 * 1024) return void socket.destroy()
    let nl: number
    while ((nl = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, nl)
      pending = pending.slice(nl + 1)
      if (!line) continue
      try {
        onMessage(JSON.parse(line))
      } catch {
        // una línea rota no tumba la conexión
      }
    }
  })
}

export const send = (socket: Socket, msg: ToHost | FromHost): void => {
  if (!socket.destroyed) socket.write(JSON.stringify(msg) + '\n')
}
