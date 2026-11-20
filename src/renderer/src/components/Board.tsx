import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'
import { GitBranchIcon, PaperPlaneTiltIcon, XIcon } from '@phosphor-icons/react'
import { useAgo } from '@renderer/lib/time'
import { PulseDot, useOnscreen } from '@renderer/components/ui/motion-bits'
import { cn } from '@renderer/lib/utils'
import { openTask } from '@renderer/overlays'
import { shortcutKeys, useShortcutsRev } from '@renderer/shortcuts'
import {
  baseName,
  folderOf,
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
  working: { label: 'Trabajando', dot: 'bg-foreground animate-breathe' },
  attention: { label: 'Te necesita', dot: 'bg-attention' },
  error: { label: 'Error', dot: 'bg-destructive' },
  done: { label: 'Terminó', dot: 'bg-unread' },
  idle: { label: 'En reposo', dot: 'bg-muted-foreground/60' },
  exited: { label: 'Cerrada', dot: 'bg-muted-foreground/30' }
}

// "ahora", "4 min", "2 h": cuánto lleva en su estado.
export function Board(): React.JSX.Element {
  useShortcutsRev()
  const sessions = useStore(sidebarOrder)
  const diffStats = useStore((s) => s.diffStats)
  const [filter, setFilter] = useState<Filter>('all')
  const [screens, setScreens] = useState<Record<string, string>>({})
  const root = useRef<HTMLDivElement>(null)
  const panelMs = useStore((s) => s.prefs.panelMs) // la misma velocidad que los demás paneles

  const ids = sessions.map((s) => s.id).join(',')
  // Lo último de cada pantalla, cada segundo (solo mientras el tablero está abierto).
  useEffect(() => {
    const list = ids ? ids.split(',') : []
    // Solo se escribe el estado si alguna pantalla cambió: un tablero quieto no se redibuja.
    const read = (): void =>
      void window.slate.sessions
        .screens(list, LINES)
        .then((next) =>
          setScreens((prev) =>
            Object.keys(next).length === Object.keys(prev).length &&
            Object.entries(next).every(([id, text]) => prev[id] === text)
              ? prev
              : next
          )
        )
    const first = setTimeout(read)
    const timer = setInterval(() => document.visibilityState === 'visible' && read(), SCREEN_MS)
    return () => (clearTimeout(first), clearInterval(timer))
  }, [ids])

  // Los cambios de las sesiones en su rama: el +N −N de cada tarjeta.
  const isolated = sessions
    .filter((s) => s.worktree)
    .map((s) => s.id)
    .join(',')
  useEffect(() => {
    if (!isolated) return
    const read = (): void =>
      isolated.split(',').forEach((id) =>
        window.slate.git
          .changes(id)
          .then((c) => {
            if (!c) return
            setDiffStats(id, sum(c.files, 'add'), sum(c.files, 'del'))
          })
          .catch(() => {})
      )
    const first = setTimeout(read)
    const timer = setInterval(() => document.visibilityState === 'visible' && read(), CHANGES_MS)
    return () => (clearTimeout(first), clearInterval(timer))
  }, [isolated])

  // Toma el foco (Escape lo cierra), salvo si se abrió solo mientras escribías en un terminal:
  // un agente que lanza otros no te quita el teclado.
  useEffect(() => {
    if (!document.activeElement?.closest('.xterm')) root.current?.focus()
  }, [])

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.id, sessions.filter((s) => f.match(s.status)).length])
  ) as Record<Filter, number>
  const { match } = FILTERS.find((f) => f.id === filter)!
  const shown = sessions.filter((s) => match(s.status))
  // Agrupadas por carpeta, en el orden de la barra lateral.
  const byFolder = new Map<string, Session[]>()
  for (const s of shown) byFolder.set(folderOf(s), [...(byFolder.get(folderOf(s)) ?? []), s])
  const groups = [...byFolder.entries()]
  const needing = (n: number): string => (n === 1 ? '1 te necesita' : `${n} te necesitan`)

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        ref={root}
        tabIndex={-1}
        aria-label="Tablero de sesiones"
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.985 }}
        transition={{ duration: panelMs / 1000, ease: [0.32, 0.72, 0, 1] }}
        onKeyDown={(e) => e.key === 'Escape' && toggleBoard()}
        className="absolute inset-0 z-10 flex flex-col bg-background outline-none"
      >
        <header className="flex shrink-0 items-center gap-4 px-6 pt-5 pb-4">
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
          <LayoutGroup id="board-filter">
            <div
              role="radiogroup"
              aria-label="Filtrar sesiones"
              className="ml-auto flex rounded-md bg-accent/60 p-0.5"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'relative flex h-7 items-center gap-1.5 rounded-sm px-3 text-[12px] transition-colors duration-120',
                    filter === f.id
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {filter === f.id && (
                    <motion.span
                      layoutId="board-pill"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                      className="absolute inset-0 rounded-sm bg-background shadow-sm ring-1 ring-border"
                    />
                  )}
                  <span className="relative">{f.label}</span>
                  <span className="relative font-mono text-[11px] text-muted-foreground tabular-nums">
                    {counts[f.id]}
                  </span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          <button
            onClick={openTask}
            className="flex h-8 items-center gap-2 rounded-md bg-foreground px-3 font-semibold text-background transition-colors duration-120 hover:bg-foreground/85"
          >
            <PaperPlaneTiltIcon size={15} weight="regular" />
            Nueva tarea
          </button>
          <button
            onClick={toggleBoard}
            aria-label="Cerrar tablero"
            title={`Cerrar (Esc o ${shortcutKeys('board')})`}
            className="grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground"
          >
            <XIcon size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
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
            <LayoutGroup id="board-cards">
              {groups.map(([folder, list]) => (
                <section key={folder} className="mb-6 last:mb-0">
                  <h3 className="mb-2.5 flex items-baseline gap-2 px-0.5 text-[12px] font-medium text-muted-foreground">
                    {baseName(folder)}
                    <span className="font-mono text-[11px] tabular-nums">{list.length}</span>
                  </h3>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
                    <AnimatePresence mode="popLayout" initial>
                      {list.map((s, i) => (
                        <Card
                          key={s.id}
                          session={s}
                          index={i}
                          screen={screens[s.id] ?? ''}
                          stats={diffStats[s.id]}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              ))}
            </LayoutGroup>
          )}
        </div>
      </motion.div>
    </MotionConfig>
  )
}

// Memorizada: solo se redibuja la tarjeta cuya sesión, pantalla o cambios se movieron.
const Card = memo(function Card({
  session: s,
  index,
  screen,
  stats
}: {
  session: Session
  index: number
  screen: string
  stats?: { add: number; del: number }
}): React.JSX.Element {
  const [ref, onscreen] = useOnscreen<HTMLButtonElement>()
  const since = useAgo(s.since)
  const status = STATUS[s.status]
  const lines = screen.split('\n').slice(-LINES)
  return (
    <motion.button
      ref={ref}
      data-offscreen={onscreen ? undefined : ''}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{
        duration: 0.28,
        ease: [0.22, 1, 0.36, 1],
        delay: Math.min(index, 8) * 0.035
      }}
      onClick={() => openFromBoard(s.id)}
      data-status={s.status}
      className={cn(
        'group relative flex flex-col rounded-lg border border-border bg-sidebar/50 text-left shadow-[inset_0_1px_0_var(--highlight)] transition-[border-color,box-shadow,translate] duration-200 ease-drawer outline-none hover:-translate-y-0.5 hover:border-muted-foreground/40 hover:shadow-[0_12px_32px_-16px_rgb(0_0_0/0.5)] focus-visible:border-foreground',
        s.status === 'working' && 'beam',
        s.status === 'attention' && 'border-attention/60',
        s.status === 'exited' && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <SessionIcon kind={s.kind} size={15} />
        <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          {s.status === 'working' ? (
            <PulseDot className={status.dot} />
          ) : (
            <span className={cn('size-1.5 rounded-full', status.dot)} />
          )}
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
    </motion.button>
  )
})
