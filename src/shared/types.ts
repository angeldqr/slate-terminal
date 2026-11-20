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
  // Solo en sesiones aisladas: su worktree y la carpeta de la barra lateral desde la que salió.
  worktree?: SessionWorktree
}

export type SessionWorktree = {
  project: string // carpeta de la barra lateral
  root: string // raíz del repo principal
  path: string // carpeta del worktree
  branch: string // slate/<nombre>
  base: string // rama de la que salió y a la que vuelve
}

// Cómo abrir una sesión: en su propia rama y, opcionalmente, ya con una tarea.
export type SessionOpts = { isolate?: boolean; prompt?: string }

export type Agent = {
  id: AgentId
  name: string
  cmd: string
  hooks?: boolean
  installed?: boolean
  // Cómo recibe una tarea al arrancar: '' = como argumento suelto, si no, con esa opción.
  promptFlag?: string
}

// Aviso del sistema; `id` es la sesión a la que lleva al pulsarlo ('' si no lleva a ninguna).
export type Notice = { id: string; title: string; body: string; silent: boolean }
