import { OpenAiLogoIcon, RobotIcon, TerminalWindowIcon } from '@phosphor-icons/react'
import { siClaude, siCursor, siGooglegemini, siOpencode, type SimpleIcon } from 'simple-icons'
import type { SessionKind } from '../../../shared/types'

// Marca de cada agente, monocroma: el color en Slate solo comunica estado.
// OpenAI no está en Simple Icons; Codex usa el logo de Phosphor.
const BRANDS: Partial<Record<SessionKind, SimpleIcon>> = {
  claude: siClaude,
  gemini: siGooglegemini,
  cursor: siCursor,
  opencode: siOpencode
}

export function SessionIcon({
  kind,
  size = 15
}: {
  kind: SessionKind
  size?: number
}): React.JSX.Element {
  const classes = 'shrink-0 text-muted-foreground'
  const brand = BRANDS[kind]
  if (brand) {
    // Las marcas son macizas: algo más pequeñas que los iconos de trazo para pesar lo mismo.
    const box = Math.round(size * 0.86)
    return (
      <svg
        viewBox="0 0 24 24"
        width={box}
        height={box}
        fill="currentColor"
        aria-hidden
        className={classes}
      >
        <path d={brand.path} />
      </svg>
    )
  }
  if (kind === 'codex') return <OpenAiLogoIcon size={size} className={classes} />
  if (kind === 'shell') return <TerminalWindowIcon size={size} className={classes} />
  return <RobotIcon size={size} className={classes} />
}
