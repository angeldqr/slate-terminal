import type { Status } from '../../../shared/types'

// Lo que se ve de una sesión: un solo estado, el de más prioridad. Antes cada pantalla combinaba
// el estado y "sin leer" a su manera y no coincidían.
export type Shown = 'attention' | 'error' | 'working' | 'unread' | 'exited' | 'idle'

export function resolveStatus(s: { status: Status; unread: boolean }): Shown {
  if (s.status === 'attention') return 'attention' // te necesita: lo primero
  if (s.status === 'error') return 'error'
  if (s.status === 'working') return 'working'
  if (s.unread) return 'unread'
  if (s.status === 'exited') return 'exited'
  return 'idle'
}
