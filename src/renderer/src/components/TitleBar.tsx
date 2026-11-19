import { useEffect, useState } from 'react'
import { Copy, Minus, PanelLeft, Square, X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { toggleSidebar, useStore } from '@renderer/store'

const { win } = window.slate

function WinButton({
  onClick,
  label,
  danger,
  children
}: {
  onClick: () => void
  label: string
  danger?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'no-drag grid h-9 w-11 place-items-center text-muted-foreground transition-colors duration-100',
        danger ? 'hover:bg-destructive hover:text-white' : 'hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => win.onMaximized(setMaximized), [])

  const active = useStore((s) => s.sessions.find((x) => x.id === s.activeId))
  const folder = useStore((s) => s.projects.find((p) => p.path === active?.cwd)?.name)

  return (
    <header className="drag flex h-9 shrink-0 items-center">
      <button
        onClick={toggleSidebar}
        aria-label="Mostrar u ocultar la barra lateral"
        className="no-drag ml-2 grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground"
      >
        <PanelLeft size={16} strokeWidth={1.6} />
      </button>
      <p className="ml-3 truncate text-[12px] text-muted-foreground">
        {active && (
          <>
            <span className="text-foreground">{active.title}</span>
            {folder && <span> en {folder}</span>}
          </>
        )}
      </p>
      <div className="ml-auto flex">
        <WinButton onClick={win.minimize} label="Minimizar">
          <Minus size={15} strokeWidth={1.5} />
        </WinButton>
        <WinButton onClick={win.maximize} label={maximized ? 'Restaurar' : 'Maximizar'}>
          {maximized ? (
            <Copy size={13} strokeWidth={1.5} />
          ) : (
            <Square size={13} strokeWidth={1.5} />
          )}
        </WinButton>
        <WinButton onClick={win.close} label="Cerrar" danger>
          <X size={16} strokeWidth={1.5} />
        </WinButton>
      </div>
    </header>
  )
}
