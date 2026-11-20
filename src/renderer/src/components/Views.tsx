import { useState } from 'react'
import { SquareSplitHorizontalIcon, SquareSplitVerticalIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import { frames, type Box, type Divider as DividerFrame } from '@renderer/layout'
import {
  closeSession,
  resizeSplit,
  selectSession,
  splitSession,
  useStore,
  viewOf
} from '@renderer/store'
import { SessionIcon } from './SessionIcon'
import { TerminalPane } from './TerminalPane'

const iconButton =
  'grid size-6 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground'

const toStyle = (b: Box): React.CSSProperties => ({
  left: `${b.x * 100}%`,
  top: `${b.y * 100}%`,
  width: `${b.w * 100}%`,
  height: `${b.h * 100}%`
})

function PaneHeader({ id }: { id: string }): React.JSX.Element | null {
  const session = useStore((s) => s.sessions.find((x) => x.id === id))
  const focused = useStore((s) => s.activeId === id)
  const [asking, setAsking] = useState(false)
  if (!session) return null

  return (
    <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
      <SessionIcon kind={session.kind} size={13} />
      <span
        className={cn(
          'truncate text-[12px]',
          focused ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {session.title}
      </span>
      <div className="ml-auto flex items-center">
        <button
          className={iconButton}
          aria-label="Dividir a la derecha"
          title="Dividir a la derecha"
          onClick={() => splitSession(id, 'row')}
        >
          <SquareSplitHorizontalIcon size={14} />
        </button>
        <button
          className={iconButton}
          aria-label="Dividir abajo"
          title="Dividir abajo"
          onClick={() => splitSession(id, 'col')}
        >
          <SquareSplitVerticalIcon size={14} />
        </button>
        {/* Cerrar un agente que trabaja pide un segundo clic, igual que en la barra lateral. */}
        <button
          className={cn(
            iconButton,
            asking && 'w-auto px-1.5 text-destructive hover:text-destructive'
          )}
          aria-label={asking ? 'Está trabajando. ¿Cerrar?' : 'Cerrar sesión'}
          title={asking ? 'Está trabajando. ¿Cerrar?' : 'Cerrar sesión'}
          onMouseLeave={() => setAsking(false)}
          onBlur={() => setAsking(false)}
          onClick={() => {
            if (session.status === 'working' && !asking) return setAsking(true)
            closeSession(id)
          }}
        >
          {asking ? <span className="text-[12px]">¿Cerrar?</span> : <XIcon size={14} />}
        </button>
      </div>
    </header>
  )
}

function Pane({
  id,
  multi,
  visible
}: {
  id: string
  multi: boolean
  visible: boolean
}): React.JSX.Element {
  const focused = useStore((s) => s.activeId === id)
  const padding = useStore((s) => s.prefs.terminalPadding)
  return (
    // Capturar el clic antes que xterm: tocar un panel lo vuelve el activo.
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      onMouseDownCapture={() => !focused && selectSession(id)}
    >
      {multi && <PaneHeader id={id} />}
      <div className="min-h-0 flex-1" style={{ padding }}>
        <TerminalPane sessionId={id} focused={focused} visible={visible} />
      </div>
    </div>
  )
}

const STEP = 0.05 // lo que mueve una flecha del teclado

// La línea entre dos paneles: se arrastra con el ratón o se mueve con las flechas.
// Su zona de agarre es más ancha que lo que se ve.
function Divider({ viewId, frame }: { viewId: string; frame: DividerFrame }): React.JSX.Element {
  const { box, dir, ratio, path } = frame
  const row = dir === 'row'
  const at = row ? box.x + box.w * ratio : box.y + box.h * ratio
  const style: React.CSSProperties = row
    ? { left: `${at * 100}%`, top: `${box.y * 100}%`, height: `${box.h * 100}%` }
    : { top: `${at * 100}%`, left: `${box.x * 100}%`, width: `${box.w * 100}%` }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Divisor de paneles"
      aria-orientation={row ? 'vertical' : 'horizontal'}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(ratio * 100)}
      style={style}
      className={cn(
        'absolute z-10 bg-border outline-none transition-colors duration-120 hover:bg-muted-foreground focus-visible:bg-muted-foreground',
        "before:absolute before:content-['']",
        row
          ? 'w-px -translate-x-1/2 cursor-col-resize before:inset-y-0 before:-inset-x-1'
          : 'h-px -translate-y-1/2 cursor-row-resize before:inset-x-0 before:-inset-y-1'
      )}
      onKeyDown={(e) => {
        const back = row ? 'ArrowLeft' : 'ArrowUp'
        const forward = row ? 'ArrowRight' : 'ArrowDown'
        if (e.key === back) resizeSplit(viewId, path, ratio - STEP)
        if (e.key === forward) resizeSplit(viewId, path, ratio + STEP)
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const handle = e.currentTarget
        const area = handle.parentElement!.getBoundingClientRect()
        handle.setPointerCapture(e.pointerId)
        // Como mucho una actualización por frame: cada una redimensiona los terminales.
        let frameRequest = 0
        const move = (ev: PointerEvent): void => {
          cancelAnimationFrame(frameRequest)
          frameRequest = requestAnimationFrame(() => {
            const pos = row
              ? ((ev.clientX - area.left) / area.width - box.x) / box.w
              : ((ev.clientY - area.top) / area.height - box.y) / box.h
            resizeSplit(viewId, path, pos)
          })
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener(
          'lostpointercapture',
          () => handle.removeEventListener('pointermove', move),
          { once: true }
        )
      }}
    />
  )
}

// Cada terminal se dibuja una sola vez, con su clave fija, y solo se mueve a su rectángulo:
// dividir, cerrar o cambiar de vista nunca lo desmonta, así no pierde scroll ni pantalla.
export function Views(): React.JSX.Element {
  const ids = useStore((s) => s.sessions.map((x) => x.id))
  const view = useStore((s) => viewOf(s, s.activeId))
  const { panes, dividers } = view ? frames(view.layout) : { panes: [], dividers: [] }
  const boxes = new Map(panes.map((p) => [p.id, p.box]))
  const multi = panes.length > 1

  return (
    <div className="relative h-full">
      {ids.map((id) => {
        const box = boxes.get(id)
        return (
          <div key={id} className={cn('absolute', !box && 'hidden')} style={box && toStyle(box)}>
            <Pane id={id} multi={multi} visible={!!box} />
          </div>
        )
      })}
      {view && dividers.map((d) => <Divider key={view.id + d.path} viewId={view.id} frame={d} />)}
    </div>
  )
}
