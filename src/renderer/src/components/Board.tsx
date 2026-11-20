import { memo, useEffect, useId, useRef, useState } from 'react'
import { motion, useIsPresent } from 'motion/react'
import { GitBranchIcon, PaperPlaneTiltIcon, XIcon } from '@phosphor-icons/react'
import { useAgo } from '@renderer/lib/useAgo'
import { cn } from '@renderer/lib/utils'
import { openTask } from '@renderer/overlays'
import { shortcutKeys, useShortcutsRev } from '@renderer/shortcuts'
import { terminals } from '@renderer/terminals'
import {
  baseName,
  folderOf,
  getState,
  needsYou,
  openFromBoard,
  setDiffStats,
  sidebarOrder,
  sum,
  toggleBoard,
  useStore,
  type Session
} from '@renderer/store'
import type { Status } from '../../../shared/types'
import { Counts } from './ChangesPanel'
import { SessionIcon } from './SessionIcon'

// Tablero: todas las sesiones a la vez, como tarjetas vivas (estado, rama, cambios y lo último
// que imprimió cada una). Pensado para cuando varios agentes trabajan en tareas distintas.

const LINES = 9 // lo último de cada terminal que cabe en la tarjeta
const SCREEN_MS = 1000
const CHANGES_MS = 5000 // ponytail: sondeo de git por sesión aislada; un watcher si hay muchas

type Filter = 'all' | 'working' | 'attention' | 'done'
const FILTERS: { id: Filter; label: string; match: (s: Status) => boolean }[] = [
  { id: 'all', label: 'Todas', match: () => true },
  { id: 'working', label: 'Trabajando', match: (s) => s === 'working' },
  { id: 'attention', label: 'Te necesitan', match: needsYou },
  { id: 'done', label: 'Terminadas', match: (s) => s === 'done' || s === 'idle' || s === 'exited' }
]

const STATUS: Record<Status, { label: string; dot: string }> = {
  working: { label: 'Trabajando', dot: 'bg-foreground' },
  attention: { label: 'Te necesita', dot: 'bg-attention' },
  error: { label: 'Error', dot: 'bg-destructive' },
  done: { label: 'Terminó', dot: 'bg-unread' },
  idle: { label: 'En reposo', dot: 'bg-muted-foreground/60' },
  exited: { label: 'Cerrada', dot: 'bg-muted-foreground/30' }
}

function useBoardScreens(
  viewport: React.RefObject<HTMLDivElement | null>,
  shownIds: string
): Record<string, string> {
  const [screens, setScreens] = useState<Record<string, string>>({})
  useEffect(() => {
    const root = viewport.current
    if (!root || !shownIds) return
    const near = new Map<Element, string>()
    let disposed = false
    const active = (): boolean =>
      !disposed && document.visibilityState === 'visible' && getState().board
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (isIntersecting) near.set(target, (target as HTMLElement).dataset.boardSession!)
          else near.delete(target)
        }
      },
      { root, rootMargin: '120px 0px' }
    )
    root.querySelectorAll('[data-board-session]').forEach((el) => observer.observe(el))

    let screenTimer: ReturnType<typeof setTimeout>
    let changesTimer: ReturnType<typeof setTimeout>
    const readScreens = async (): Promise<void> => {
      try {
        if (active() && near.size) {
          const next = await window.slate.sessions.screens([...near.values()], LINES)
          if (active()) {
            setScreens((prev) => {
              const entries = Object.entries(next).filter(([id, text]) => prev[id] !== text)
              return entries.length ? { ...prev, ...Object.fromEntries(entries) } : prev
            })
          }
        }
      } finally {
        if (!disposed) screenTimer = setTimeout(() => void readScreens().catch(() => {}), SCREEN_MS)
      }
    }
    const readChanges = async (): Promise<void> => {
      try {
        const isolated = new Set(
          getState()
            .sessions.filter((s) => s.worktree)
            .map((s) => s.id)
        )
        // Uno a la vez: desplazar el tablero no debe lanzar una ráfaga de procesos Git.
        for (const [el, id] of near) {
          if (!active()) break
          if (!isolated.has(id)) continue
          const changes = await window.slate.git.changes(id).catch(() => null)
          if (changes && active() && near.has(el)) {
            setDiffStats(id, sum(changes.files, 'add'), sum(changes.files, 'del'))
          }
        }
      } finally {
        if (!disposed) changesTimer = setTimeout(() => void readChanges(), CHANGES_MS)
      }
    }
    // Da al observador el primer pintado para saber qué tarjetas están a la vista.
    screenTimer = setTimeout(() => void readScreens().catch(() => {}), 100)
    changesTimer = setTimeout(() => void readChanges(), 200)
    return () => {
      disposed = true
      observer.disconnect()
      clearTimeout(screenTimer)
      clearTimeout(changesTimer)
    }
  }, [viewport, shownIds])
  return screens
}

// "ahora", "4 min", "2 h": cuánto lleva en su estado.
export function Board(): React.JSX.Element {
  useShortcutsRev()
  const sessions = useStore(sidebarOrder)
  const diffStats = useStore((s) => s.diffStats)
  const activeId = useStore((s) => s.activeId)
  const [filter, setFilter] = useState<Filter>('all')
  const filterName = useId()
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const present = useIsPresent()
  const panelMs = useStore((s) => s.prefs.panelMs) // la misma velocidad que los demás paneles

  // Toma el foco (Escape lo cierra), salvo si se abrió solo mientras escribías en un terminal:
  // un agente que lanza otros no te quita el teclado.
  useEffect(() => {
    const previous = document.activeElement
    if (previous instanceof HTMLElement) opener.current = previous
    if (!previous?.closest('.xterm')) root.current?.focus()
  }, [])

  const close = (): void => {
    toggleBoard()
    if (opener.current && opener.current !== document.body && opener.current.checkVisibility()) {
      opener.current.focus()
    } else if (activeId) {
      terminals.get(activeId)?.focus()
    }
  }

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.id, sessions.filter((s) => f.match(s.status)).length])
  ) as Record<Filter, number>
  const { match } = FILTERS.find((f) => f.id === filter)!
  const shown = sessions.filter((s) => match(s.status))
  const screens = useBoardScreens(viewport, shown.map((s) => s.id).join(','))
  // Agrupadas por carpeta, en el orden de la barra lateral.
  const byFolder = new Map<string, Session[]>()
  for (const s of shown) byFolder.set(folderOf(s), [...(byFolder.get(folderOf(s)) ?? []), s])
  const groups = [...byFolder.entries()]
  const needing = (n: number): string => (n === 1 ? '1 te necesita' : `${n} te necesitan`)

  return (
    <motion.div
      ref={root}
      tabIndex={-1}
      data-board=""
      aria-label="Tablero de sesiones"
      inert={!present}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: panelMs / 1000, ease: [0.32, 0.72, 0, 1] }}
      onKeyDown={(e) => e.key === 'Escape' && close()}
      className="absolute inset-0 z-10 flex flex-col bg-background outline-none"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold tracking-tight">Tablero</h2>
          <p className="mt-0.5 text-muted-foreground">
            {counts.working
              ? `${counts.working} trabajando${counts.attention ? `, ${needing(counts.attention)}` : ''}.`
              : counts.attention
                ? `${needing(counts.attention)}.`
                : 'Nadie trabaja ahora mismo.'}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Filtrar sesiones"
          className="ml-auto flex flex-wrap rounded-md bg-accent/60 p-0.5"
        >
          {FILTERS.map((f) => (
            <label key={f.id} className="relative">
              <input
                type="radio"
                name={filterName}
                checked={filter === f.id}
                onChange={() => setFilter(f.id)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[12px] transition-colors duration-120 peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-ring',
                  filter === f.id
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {counts[f.id]}
                </span>
              </span>
            </label>
          ))}
        </div>
        <button
          onClick={openTask}
          className="flex h-8 items-center gap-2 rounded-md bg-foreground px-3 font-semibold text-background transition-colors duration-120 hover:bg-foreground/85"
        >
          <PaperPlaneTiltIcon size={15} weight="regular" />
          Nueva tarea
        </button>
        <button
          onClick={close}
          aria-label="Cerrar tablero"
          title={`Cerrar (Esc o ${shortcutKeys('board')})`}
          className="grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground"
        >
          <XIcon size={16} />
        </button>
      </header>

      <div ref={viewport} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {!shown.length ? (
          <div className="grid h-full place-items-center pb-16 text-center">
            <div>
              <p className="text-[15px] font-medium">
                {sessions.length ? 'Ninguna sesión en este estado' : 'Nada en marcha'}
              </p>
              <p className="mt-1.5 text-muted-foreground">
                {sessions.length
                  ? 'Prueba con otro filtro.'
                  : 'Lanza una o varias tareas y aquí verás a cada agente trabajar.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {groups.map(([folder, list]) => (
              <section key={folder} className="mb-6 last:mb-0">
                <h3 className="mb-2.5 flex items-baseline gap-2 px-0.5 text-[12px] font-medium text-muted-foreground">
                  {baseName(folder)}
                  <span className="font-mono text-[11px] tabular-nums">{list.length}</span>
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,290px),1fr))] gap-3">
                  {list.map((s) => (
                    <Card
                      key={s.id}
                      session={s}
                      active={s.id === activeId}
                      screen={screens[s.id] ?? ''}
                      stats={diffStats[s.id]}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </motion.div>
  )
}

// Memorizada: solo se redibuja la tarjeta cuya sesión, pantalla o cambios se movieron.
const Card = memo(function Card({
  session: s,
  active,
  screen,
  stats
}: {
  session: Session
  active: boolean
  screen: string
  stats?: { add: number; del: number }
}): React.JSX.Element {
  const since = useAgo(s.since)
  const status = STATUS[s.status]
  const lines = screen.split('\n').slice(-LINES)
  return (
    <button
      data-board-session={s.id}
      aria-current={active ? 'true' : undefined}
      onClick={() => openFromBoard(s.id)}
      data-status={s.status}
      className={cn(
        'flex min-w-0 flex-col rounded-lg border border-border bg-sidebar/50 text-left transition-colors duration-120 hover:border-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active && 'border-muted-foreground/60 bg-accent/25',
        s.status === 'attention' && 'border-attention/60',
        s.status === 'exited' && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <SessionIcon kind={s.kind} size={15} />
        <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          <span aria-hidden className={cn('size-1.5 rounded-full', status.dot)} />
          {status.label}
          <span className="ml-1 text-muted-foreground/60 tabular-nums">{since}</span>
        </span>
      </div>
      <div className="flex h-5 items-center gap-1.5 px-3.5 pt-1 text-[12px] text-muted-foreground">
        {s.worktree ? (
          <>
            <GitBranchIcon size={12} className="shrink-0" />
            <span className="truncate">{s.worktree.branch.replace(/^slate\//, '')}</span>
          </>
        ) : (
          <span className="truncate">{baseName(s.cwd)}</span>
        )}
        {stats && (stats.add > 0 || stats.del > 0) && (
          <Counts add={stats.add} del={stats.del} className="ml-auto" />
        )}
      </div>
      {s.worktree?.task && (
        <p className="line-clamp-2 px-3.5 pt-2 text-[12px] leading-relaxed">{s.worktree.task}</p>
      )}
      {/* Lo último del terminal, con un fundido arriba: es una ventana, no el historial. */}
      <pre
        aria-hidden
        style={{ height: `calc(${LINES} * 1.5em + 1rem)` }}
        className="m-3 mt-2.5 flex flex-col justify-end overflow-hidden rounded-md border border-border/70 bg-background px-2.5 py-2 font-mono text-[11px] leading-[1.5] text-muted-foreground [mask-image:linear-gradient(to_bottom,transparent,black_35%)]"
      >
        {lines.map((l, i) => (
          <div key={i} className={cn('truncate', i === lines.length - 1 && 'text-foreground')}>
            {l || ' '}
          </div>
        ))}
      </pre>
    </button>
  )
})
