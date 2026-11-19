import type { Status } from '../shared/types'

export type { Status }

export type StatusEvent =
  | { type: 'hook'; name: string }
  | { type: 'output'; bell: boolean }
  | { type: 'quiet' }
  | { type: 'exit' }

// Eventos de hooks de Claude Code → estado. Los que no aparecen no cambian nada.
const HOOKS: Record<string, Status> = {
  SessionStart: 'idle',
  UserPromptSubmit: 'working',
  PreToolUse: 'working',
  PostToolUse: 'working',
  PostToolUseFailure: 'working',
  ElicitationResult: 'working',
  Notification: 'attention',
  Elicitation: 'attention',
  Stop: 'done',
  StopFailure: 'error',
  SessionEnd: 'exited'
}

// `hooked` = la sesión reporta por hooks; entonces la salida del terminal no decide nada,
// salvo el BEL. Sin hooks se usa la heurística: hay salida → trabajando, silencio → terminado.
// ponytail: heurística para agentes sin hooks; da falsos "trabajando" con salidas largas sin agente.
export function nextStatus(prev: Status, ev: StatusEvent, hooked: boolean): Status {
  if (prev === 'exited') return prev
  switch (ev.type) {
    case 'exit':
      return 'exited'
    case 'hook':
      return HOOKS[ev.name] ?? prev
    case 'output':
      if (ev.bell) return 'attention'
      return hooked || prev === 'attention' ? prev : 'working'
    case 'quiet':
      return !hooked && prev === 'working' ? 'done' : prev
  }
}
