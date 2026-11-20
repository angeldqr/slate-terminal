import { useEffect, useState } from 'react'
import {
  CopySimpleIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  SidebarSimpleIcon,
  SquareIcon,
  XIcon
} from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import { openPalette } from '@renderer/overlays'
import { shortcutKeys } from '@renderer/shortcuts'
import { Keys } from './Keys'
import { folderOf, samePath, toggleSidebar, useStore } from '@renderer/store'

const { win } = window.slate
const HIDE_DELAY = 450 // margen para no esconderla al rozar el borde al pasar
// Zona que la revela: algo más que la franja de 8 px, porque Windows se queda con los primeros
// píxeles del borde para redimensionar y ahí la app no recibe el ratón.
const REVEAL_ZONE = 14
const BAR = 36 // alto de la barra abierta (design.md §5)

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
      title={label}
      className={cn(
        'no-drag grid h-9 w-11 place-items-center text-muted-foreground transition-colors duration-120',
        danger
          ? 'hover:bg-destructive hover:text-destructive-foreground'
          : 'hover:bg-accent/70 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

// Barra superior escondida: una franja de 8 px que crece al acercar el puntero y se superpone
// al contenido en vez de empujarlo, así el terminal nunca salta.
// En Windows una zona arrastrable (-webkit-app-region: drag) no entrega eventos de ratón a la app:
// por eso la franja escondida no arrastra (debe notar el puntero), la barra abierta sí, y la
// salida del puntero se detecta con su posición en toda la ventana, no con mouseleave.
export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const [near, setNear] = useState(false)
  // Solo el foco del teclado la mantiene abierta: tras un clic el botón conserva el foco
  // y la barra no se escondería nunca.
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  useEffect(() => {
    win.isMaximized().then(setMaximized)
    return win.onMaximized(setMaximized)
  }, [])

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const onMove = (e: MouseEvent): void => {
      if (e.clientY <= REVEAL_ZONE) {
        clearTimeout(hideTimer)
        setNear(true)
      } else if (e.clientY > BAR + 12) {
        clearTimeout(hideTimer)
        hideTimer = setTimeout(() => setNear(false), HIDE_DELAY)
      }
    }
    document.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('mousemove', onMove)
      clearTimeout(hideTimer)
    }
  }, [])

  const active = useStore((s) => s.sessions.find((x) => x.id === s.activeId))
  const folder = useStore(
    (s) => s.projects.find((p) => active && samePath(p.path, folderOf(active)))?.name
  )
  const hint = useStore((s) => s.hint)
  // Con un aviso o una capa abierta se queda a la vista: el aviso vive en ella.
  const pinned = useStore((s) => !!s.hint || !!s.overlay)
  // Con una capa abierta no arrastra: si no, su franja se tragaría los clics al fondo de la capa.
  const overlay = useStore((s) => !!s.overlay)
  const pinTopBar = useStore((s) => s.prefs.pinTopBar)
  const open = near || pinned || keyboardFocus || pinTopBar

  return (
    <header
      onFocus={(e) => setKeyboardFocus(e.target.matches(':focus-visible'))}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setKeyboardFocus(false)}
      className={cn(
        'absolute inset-x-0 top-0 z-[35] overflow-hidden transition-[height,background-color,box-shadow] duration-200 ease-out-quint',
        open && !overlay ? 'drag' : 'no-drag',
        open ? 'h-9 bg-sidebar/90 shadow-[var(--elevation-bar)] backdrop-blur-xl' : 'h-2'
      )}
    >
      <div
        className={cn(
          'relative flex h-9 items-center transition-[opacity,translate] duration-200 ease-out-quint',
          open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        )}
      >
        <button
          onClick={toggleSidebar}
          aria-label="Mostrar u ocultar la barra lateral"
          title="Barra lateral"
          className="no-drag ml-2 grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground"
        >
          <SidebarSimpleIcon size={17} />
        </button>
        {/* Blendy transforma este botón en la paleta: necesita un único hijo envoltorio. */}
        <button
          data-blendy-from="palette"
          onClick={openPalette}
          className="no-drag ml-1.5 h-7 rounded-sm border border-border bg-background/40 pr-1.5 pl-2.5 text-[12px] text-muted-foreground transition-colors duration-120 hover:border-muted-foreground/40 hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <MagnifyingGlassIcon size={14} />
            <span className="pr-6">Buscar</span>
            <Keys combo={shortcutKeys('palette')} />
          </span>
        </button>

        {/* Centrado respecto a la ventana, no al espacio que dejan los botones. */}
        <p
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 mx-auto w-fit max-w-[40%] truncate text-[12px] text-muted-foreground"
        >
          {hint ? (
            <span className="text-foreground">{hint}</span>
          ) : (
            active && (
              <>
                <span className="text-foreground">{active.title}</span>
                {folder && <span> en {folder}</span>}
              </>
            )
          )}
        </p>

        <div className="ml-auto flex">
          <WinButton onClick={win.minimize} label="Minimizar">
            <MinusIcon size={16} />
          </WinButton>
          <WinButton onClick={win.maximize} label={maximized ? 'Restaurar' : 'Maximizar'}>
            {maximized ? <CopySimpleIcon size={15} /> : <SquareIcon size={14} />}
          </WinButton>
          <WinButton onClick={win.close} label="Cerrar" danger>
            <XIcon size={17} />
          </WinButton>
        </div>
      </div>
    </header>
  )
}
