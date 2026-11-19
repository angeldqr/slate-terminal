// Tipos que comparten main, preload y renderer. Sin imports de Node aquí.
export type Status = 'idle' | 'working' | 'attention' | 'done' | 'error' | 'exited'

export type SessionInfo = {
  id: string
  cwd: string
  kind: string
  title: string
  status: Status
  hooked: boolean
}

export type Agent = { id: string; name: string; cmd: string; hooks?: boolean; installed?: boolean }
