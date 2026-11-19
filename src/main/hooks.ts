import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

// Servidor local al que Claude Code manda sus hooks por HTTP.
// El token en la ruta evita que otro proceso del equipo finja eventos.
const token = randomBytes(16).toString('hex')
const dir = join(app.getPath('userData'), 'hooks')
let port = 0

type HookEvent = {
  hook_event_name?: string
  notification_type?: string
  message?: string
  prompt?: string
}

export function startHookServer(
  onEvent: (sessionId: string, ev: HookEvent) => void
): Promise<void> {
  mkdirSync(dir, { recursive: true })
  const server = createServer((req, res) => {
    const [, root, key, sessionId] = req.url?.split('/') ?? []
    if (req.method !== 'POST' || root !== 'hooks' || key !== token || !sessionId) {
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
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as { port: number }).port
      resolve()
    })
  )
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

export function removeHookSettings(sessionId: string): void {
  rmSync(join(dir, `${sessionId}.json`), { force: true })
}
