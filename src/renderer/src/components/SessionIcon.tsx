import { Bot, SquareTerminal } from 'lucide-react'
import type { SessionKind } from '../../../shared/types'

// Icono de una sesión: shell o agente. Las marcas de cada agente llegarán con Simple Icons.
export function SessionIcon({
  kind,
  size = 14
}: {
  kind: SessionKind
  size?: number
}): React.JSX.Element {
  const Icon = kind === 'shell' ? SquareTerminal : Bot
  return <Icon size={size} strokeWidth={1.6} className="shrink-0 text-muted-foreground" />
}
