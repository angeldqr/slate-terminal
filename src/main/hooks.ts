import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

// Servidor local al que Claude Code manda sus hooks por HTTP y por el que habla con el MCP de
// Slate. El token en la ruta evita que otro proceso del equipo finja eventos o use las herramientas.
const dir = join(app.getPath('userData'), 'hooks')
const serverFile = join(dir, 'server.json')

// Puerto y token se conservan entre arranques: los Claude Code que siguieron vivos en el host de
// sesiones leyeron esta dirección al arrancar y no la vuelven a leer.
const saved = ((): { port?: number; token?: string } => {
  try {
    return JSON.parse(readFileSync(serverFile, 'utf8'))
  } catch {
    return {}
  }
})()
const token = saved.token ?? randomBytes(16).toString('hex')
let port = 0

type HookEvent = {
  hook_event_name?: string
  notification_type?: string
  message?: string
  prompt?: string
}

export type McpHandler = (sessionId: string, req: IncomingMessage, res: ServerResponse) => void

export function startHookServer(
  onEvent: (sessionId: string, ev: HookEvent) => void,
  onMcp: McpHandler
): Promise<void> {
  mkdirSync(dir, { recursive: true })
  const server = createServer((req, res) => {
    const [, root, key, sessionId] = req.url?.split('/') ?? []
    if (key !== token || !sessionId) {
      res.writeHead(404).end()
      return
    }
    // El MCP lee su propio cuerpo: se le pasa la petición sin tocar.
    if (root === 'mcp') return onMcp(sessionId, req, res)
    if (req.method !== 'POST' || root !== 'hooks') {
      res.writeHead(404).end()
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
      try {
        onEvent(sessionId, JSON.parse(body))
      } catch {
        // cuerpo inválido: se ignora, el hook no debe frenar al agente
      }
    })
  })
  // ponytail: si el puerto de la vez anterior está ocupado se usa otro, y las sesiones que
  // sobrevivieron pierden sus hooks y su MCP hasta que se abran de nuevo.
  const listen = (wanted: number): Promise<void> =>
    new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(wanted, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
  return listen(saved.port ?? 0)
    .catch(() => listen(0))
    .then(() => {
      port = (server.address() as { port: number }).port
      writeFileSync(serverFile, JSON.stringify({ port, token }), { mode: 0o600 })
    })
}

const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Elicitation',
  'ElicitationResult',
  'Stop',
  'StopFailure',
  'SessionEnd'
]

// Escribe el archivo de settings que se le pasa a `claude --settings` para esta sesión.
export function writeHookSettings(sessionId: string): string {
  const hook = [
    {
      hooks: [
        { type: 'http', url: `http://127.0.0.1:${port}/hooks/${token}/${sessionId}`, timeout: 5 }
      ]
    }
  ]
  const file = join(dir, `${sessionId}.json`)
  writeFileSync(file, JSON.stringify({ hooks: Object.fromEntries(EVENTS.map((e) => [e, hook])) }))
  return file
}

// El archivo que se le pasa a `claude --mcp-config`: el MCP de Slate para esta sesión.
// Sin tope práctico de espera: wait_for_status puede esperar varios minutos a que otro agente termine.
export function writeMcpConfig(sessionId: string): string {
  const slate = {
    type: 'http',
    url: `http://127.0.0.1:${port}/mcp/${token}/${sessionId}`,
    timeout: 600_000
  }
  const file = join(dir, `${sessionId}.mcp.json`)
  writeFileSync(file, JSON.stringify({ mcpServers: { slate } }))
  return file
}

export function removeHookSettings(sessionId: string): void {
  rmSync(join(dir, `${sessionId}.json`), { force: true })
  rmSync(join(dir, `${sessionId}.mcp.json`), { force: true })
}
