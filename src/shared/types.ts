// Tipos que comparten main, preload y renderer. Sin imports de Node aquí.
export type AgentId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'cursor'
// Una sesión es una shell o uno de los agentes que Slate sabe lanzar.
export type SessionKind = 'shell' | AgentId

export type Status = 'idle' | 'working' | 'attention' | 'done' | 'error' | 'exited'

export type SessionInfo = {
  id: string
  cwd: string
  kind: SessionKind
  title: string
  status: Status
  hooked: boolean
}

export type Agent = { id: AgentId; name: string; cmd: string; hooks?: boolean; installed?: boolean }

// Aviso del sistema; `id` es la sesión a la que lleva al pulsarlo ('' si no lleva a ninguna).
export type Notice = { id: string; title: string; body: string; silent: boolean }
