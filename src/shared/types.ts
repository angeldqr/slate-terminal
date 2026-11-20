// Tipos que comparten main, preload y renderer. Sin imports de Node aquí.
export type AgentId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'cursor'
// Una sesión es una shell o uno de los agentes que Slate sabe lanzar.
export const SESSION_KINDS = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'shell'] as const
export type SessionKind = (typeof SESSION_KINDS)[number]

export const STATUSES = ['idle', 'working', 'attention', 'done', 'error', 'exited'] as const
export type Status = (typeof STATUSES)[number]

export type SessionInfo = {
  id: string
  cwd: string
  kind: SessionKind
  title: string
  status: Status
  hooked: boolean
  // Solo en sesiones aisladas: su worktree y la carpeta de la barra lateral desde la que salió.
  worktree?: SessionWorktree
  parent?: string // la sesión que la lanzó por MCP: a ella le llega lo que reporte
}

export type SessionWorktree = {
  project: string // carpeta de la barra lateral
  root: string // raíz del repo principal
  path: string // carpeta del worktree
  branch: string // slate/<nombre>
  base: string // rama de la que salió y a la que vuelve
  task?: string // la tarea con la que se lanzó: el mensaje de commit por defecto
}

export type FileChange = {
  path: string
  status: 'A' | 'M' | 'D'
  add: number
  del: number
  binary: boolean
}

// Con qué se compara el panel: la rama base, lo que falta por guardar o el último commit.
export type DiffScope = 'base' | 'uncommitted' | 'last'

// Lo que muestra el panel de cambios de una sesión.
export type Changes = {
  branch: string
  base: string // con qué se compara: la rama base o el último commit (HEAD)
  isolated: boolean // en su propia rama: se puede fusionar, abrir PR o descartar
  files: FileChange[]
}

// Cómo abrir una sesión: en su propia rama y, opcionalmente, ya con una tarea.
export type SessionOpts = { isolate?: boolean; prompt?: string; parent?: string }

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

// Estado de las actualizaciones (Ajustes › Actualizaciones). `unsupported`: sin instalar
// (desarrollo), donde no hay de dónde actualizar.
export type UpdateState = {
  status:
    | 'unsupported'
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'error'
  version?: string
  progress?: number
  error?: string
}

// Lo que gasta un proceso y todo lo que cuelga de él: bytes de memoria y segundos de CPU.
export type ProcessUsage = { pid: number; memory: number; cpu: number; processes: number }
