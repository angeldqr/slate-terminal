import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { parsePatch } from 'diff'
import type { ThemedToken } from 'shiki/core'
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  CaretDownIcon,
  CaretRightIcon,
  CircleNotchIcon,
  FileIcon,
  FileMinusIcon,
  FilePlusIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitDiffIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  MinusIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  XIcon
} from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import { langOf, tokenize } from '@renderer/highlight'
import {
  closeSession,
  flashHint,
  reason,
  setDiffStats,
  setPrefs,
  sum,
  toggleChanges,
  useStore
} from '@renderer/store'
import { LIMITS } from '@renderer/prefs'
import { useDark } from '@renderer/theme'
import type { Changes, FileChange } from '../../../shared/types'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

const { git } = window.slate
const POLL_MS = 4000 // ponytail: sondeo mientras el panel está abierto; fs.watch si llega a pesar
const LINES_PER_FILE = 400 // más se despliega a petición: un diff enorme no congela el panel

const iconButton =
  'grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground'

type Line = {
  kind: ' ' | '+' | '-'
  old?: number
  new?: number
  tokens: ThemedToken[] | string
}
type Hunk = { header: string; lines: Line[] }

type RawHunk = { header: string; oldStart: number; newStart: number; lines: string[] }

// El patch en bloques, sin el marcador "No newline at end of file".
function parse(patch: string): RawHunk[] {
  const [parsed] = parsePatch(patch)
  return (parsed?.hunks ?? []).map((h) => ({
    header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    oldStart: h.oldStart,
    newStart: h.newStart,
    lines: h.lines.filter((l) => !l.startsWith('\\'))
  }))
}

// Los primeros `max` renglones, cortando dentro del bloque donde se acaben: solo eso se resalta.
function clip(hunks: RawHunk[], max: number): RawHunk[] {
  const out: RawHunk[] = []
  for (const h of hunks) {
    if (max <= 0) break
    out.push({ ...h, lines: h.lines.slice(0, max) })
    max -= h.lines.length
  }
  return out
}

// Cada bloque se resalta entero (lado viejo y lado nuevo) para que un comentario o una cadena
// de varias líneas se pinten bien.
function highlight(hunks: RawHunk[], path: string, dark: boolean): Promise<Hunk[]> {
  const lang = langOf(path)
  return Promise.all(
    hunks.map(async (h) => {
      const text = (keep: string): string =>
        h.lines
          .filter((l) => keep.includes(l[0]))
          .map((l) => l.slice(1).replace(/\r$/, ''))
          .join('\n')
      const [oldTokens, newTokens] = await Promise.all([
        tokenize(text(' -'), lang, dark),
        tokenize(text(' +'), lang, dark)
      ])
      let o = 0
      let n = 0
      const lines = h.lines.map((l): Line => {
        const kind = l[0] as Line['kind']
        if (kind === '-') return { kind, old: h.oldStart + o, tokens: oldTokens[o++] ?? '' }
        if (kind === '+') return { kind, new: h.newStart + n, tokens: newTokens[n++] ?? '' }
        o++
        return { kind, old: h.oldStart + o - 1, new: h.newStart + n, tokens: newTokens[n++] ?? '' }
      })
      return { header: h.header, lines }
    })
  )
}

function Code({ tokens }: { tokens: Line['tokens'] }): React.JSX.Element {
  if (typeof tokens === 'string') return <>{tokens}</>
  return (
    <>
      {tokens.map((t, i) => (
        <span
          key={i}
          style={{
            color: t.color,
            fontStyle: t.fontStyle && t.fontStyle & 1 ? 'italic' : undefined,
            fontWeight: t.fontStyle && t.fontStyle & 2 ? 600 : undefined
          }}
        >
          {t.content}
        </span>
      ))}
    </>
  )
}

function Diff({
  sessionId,
  file,
  tick
}: {
  sessionId: string
  file: FileChange
  tick: number
}): React.JSX.Element {
  const dark = useDark()
  const { codeFontSize, diffWrap, diffIgnoreSpace } = useStore((s) => ({
    codeFontSize: s.prefs.codeFontSize,
    diffWrap: s.prefs.diffWrap,
    diffIgnoreSpace: s.prefs.diffIgnoreSpace
  }))
  const [raw, setRaw] = useState<RawHunk[] | null>(null)
  const [hunks, setHunks] = useState<Hunk[] | null>(null)
  const [all, setAll] = useState(false)

  // `tick` sube con cada sondeo del panel: el agente puede seguir editando el archivo.
  useEffect(() => {
    let current = true
    git
      .fileDiff(sessionId, file.path, diffIgnoreSpace)
      .then((patch) => current && setRaw(parse(patch)))
      .catch(() => current && setRaw([]))
    return () => void (current = false)
  }, [sessionId, file.path, tick, diffIgnoreSpace])

  useEffect(() => {
    if (!raw) return
    let current = true
    highlight(clip(raw, all ? Infinity : LINES_PER_FILE), file.path, dark)
      .then((h) => current && setHunks(h))
      .catch(() => current && setHunks([]))
    return () => void (current = false)
  }, [raw, all, file.path, dark])

  if (file.binary) {
    return (
      <p className="px-4 py-3 text-muted-foreground">
        Binario, carpeta o archivo grande: sin vista previa.
      </p>
    )
  }
  if (!hunks || !raw) return <p className="px-4 py-3 text-muted-foreground">Cargando…</p>
  if (!hunks.length) {
    return (
      <p className="px-4 py-3 text-muted-foreground">
        {diffIgnoreSpace ? 'Solo cambian espacios en blanco.' : 'Sin cambios de texto.'}
      </p>
    )
  }

  const total = raw.reduce((sum, h) => sum + h.lines.length, 0)
  return (
    <div
      className={cn(
        'border-t border-border bg-background/60 font-mono',
        !diffWrap && 'overflow-x-auto'
      )}
      style={{ fontSize: codeFontSize, lineHeight: 1.6 }}
    >
      <div className={cn(!diffWrap && 'min-w-max')}>
        {hunks.map((h, i) => {
          return (
            <div key={i}>
              <div className="bg-accent/30 px-3 text-muted-foreground">{h.header}</div>
              {h.lines.map((l, j) => (
                <div
                  key={j}
                  className={cn(
                    'grid grid-cols-[3.5ch_3.5ch_1fr] gap-x-2 pr-4 pl-2',
                    diffWrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre',
                    l.kind === '+' && 'bg-added/10 shadow-[inset_2px_0_var(--added)]',
                    l.kind === '-' && 'bg-removed/10 shadow-[inset_2px_0_var(--removed)]'
                  )}
                >
                  <span className="text-right text-muted-foreground/60 select-none">{l.old}</span>
                  <span className="text-right text-muted-foreground/60 select-none">{l.new}</span>
                  <span className="select-text">
                    <Code tokens={l.tokens} />
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {!all && total > LINES_PER_FILE && (
        <button
          onClick={() => setAll(true)}
          className="w-full px-4 py-2 text-left font-sans text-muted-foreground hover:text-foreground"
        >
          Mostrar {total - LINES_PER_FILE} líneas más
        </button>
      )}
    </div>
  )
}

// Lo añadido y lo quitado, en sus colores de estado.
export function Counts({
  add,
  del,
  className
}: {
  add: number
  del: number
  className?: string
}): React.JSX.Element {
  return (
    <span className={cn('shrink-0 font-mono text-[12px] tabular-nums', className)}>
      {add > 0 && <span className="text-added">+{add}</span>}
      {del > 0 && <span className="ml-1.5 text-removed">−{del}</span>}
    </span>
  )
}

const STATUS = {
  A: { Icon: FilePlusIcon, color: 'text-added', label: 'Nuevo' },
  D: { Icon: FileMinusIcon, color: 'text-removed', label: 'Borrado' },
  M: { Icon: FileIcon, color: 'text-muted-foreground', label: 'Modificado' }
}

function FileRow({
  sessionId,
  file,
  open,
  onToggle,
  tick
}: {
  sessionId: string
  file: FileChange
  open: boolean
  onToggle: () => void
  tick: number
}): React.JSX.Element {
  // Con prefers-reduced-motion la altura no se anima: aparece en el acto.
  const reduce = useReducedMotion()
  const slash = file.path.lastIndexOf('/')
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : ''
  const name = file.path.slice(slash + 1)
  const status = STATUS[file.status]
  return (
    <div className="border-b border-border/60">
      <button
        onClick={onToggle}
        aria-expanded={open}
        title={`${status.label}: ${file.path}`}
        className="flex h-9 w-full items-center gap-2 px-3 text-left transition-colors duration-120 hover:bg-accent/40"
      >
        {open ? (
          <CaretDownIcon size={12} className="shrink-0 text-muted-foreground" />
        ) : (
          <CaretRightIcon size={12} className="shrink-0 text-muted-foreground" />
        )}
        <status.Icon size={15} className={cn('shrink-0', status.color)} />
        {/* La carpeta se recorta por el principio: lo que importa es el final de la ruta. */}
        <span className="flex min-w-0 flex-1">
          {dir && (
            <span className="min-w-0 truncate text-muted-foreground [direction:rtl]">
              <bdi>{dir}</bdi>
            </span>
          )}
          <span className="shrink-0">{name}</span>
        </span>
        <Counts add={file.add} del={file.del} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <Diff sessionId={sessionId} file={file} tick={tick} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Descartar pide un segundo clic: borra la carpeta y la rama con todo lo que tengan.
function DiscardItem({ onConfirm }: { onConfirm: () => void }): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  return (
    <DropdownMenuItem
      variant="destructive"
      onSelect={(e) => {
        if (!asking) {
          e.preventDefault()
          setAsking(true)
          return
        }
        onConfirm()
      }}
    >
      <TrashIcon /> {asking ? 'Se borra todo. ¿Descartar?' : 'Descartar rama'}
    </DropdownMenuItem>
  )
}

type Action = 'merge' | 'pr' | 'commit' | 'discard'

// Lo que se hace con el trabajo de una rama aislada. La acción principal es fusionar en su base.
function Actions({
  sessionId,
  changes
}: {
  sessionId: string
  changes: Changes
}): React.JSX.Element {
  const task = useStore((s) => s.sessions.find((x) => x.id === sessionId)?.worktree?.task)
  const [message, setMessage] = useState(() =>
    (task?.split('\n')[0] ?? `Cambios de ${changes.branch}`).slice(0, 72)
  )
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const empty = !changes.files.length

  const run = async (action: Action, work: () => Promise<string | void>): Promise<void> => {
    setBusy(action)
    setError(null)
    try {
      const hint = await work()
      if (hint) flashHint(hint)
    } catch (err) {
      setError(reason(err))
      flashHint(reason(err))
    } finally {
      setBusy(null)
    }
  }
  const merge = (): Promise<void> =>
    run('merge', async () => {
      const hint = await git.merge(sessionId, message)
      closeSession(sessionId) // main ya la cerró
      return hint
    })

  return (
    <footer className="space-y-2 border-t border-border p-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        aria-label="Mensaje del commit"
        rows={2}
        className="block w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 leading-5 outline-none placeholder:text-muted-foreground focus:border-muted-foreground/50"
        placeholder="Qué hace este cambio"
      />
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex">
        <button
          onClick={merge}
          disabled={!!busy || empty || !message.trim()}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-l-md bg-foreground font-semibold text-background transition-colors duration-120 hover:bg-foreground/85 disabled:opacity-50"
        >
          {busy === 'merge' ? (
            <CircleNotchIcon size={14} className="animate-spin" />
          ) : (
            <GitMergeIcon size={14} weight="regular" />
          )}
          Fusionar en {changes.base}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={!!busy}
            aria-label="Más acciones"
            className="grid h-9 w-9 place-items-center rounded-r-md border-l border-background/20 bg-foreground text-background transition-colors duration-120 hover:bg-foreground/85 disabled:opacity-50"
          >
            {busy && busy !== 'merge' ? (
              <CircleNotchIcon size={14} className="animate-spin" />
            ) : (
              <CaretDownIcon size={13} weight="bold" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              disabled={empty}
              onSelect={() =>
                run('pr', async () => {
                  await git.pr(sessionId, message)
                  return 'Rama subida: el PR se abrió en el navegador'
                })
              }
            >
              <GitPullRequestIcon /> Crear PR
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={empty}
              onSelect={() =>
                run('commit', async () =>
                  (await git.commit(sessionId, message))
                    ? 'Commit hecho en la rama'
                    : 'No había nada nuevo que guardar'
                )
              }
            >
              <GitCommitIcon /> Solo hacer commit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DiscardItem
              onConfirm={() =>
                run('discard', async () => {
                  const hint = await git.discard(sessionId)
                  closeSession(sessionId)
                  return hint
                })
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </footer>
  )
}

// Panel de cambios: a la derecha del terminal, lo que la sesión activa ha tocado.
// Entra deslizando su ancho (200 ms), igual que la barra lateral.
export function ChangesPanel(): React.JSX.Element {
  const open = useStore((s) => s.changes)
  const id = useStore((s) => s.activeId)
  const width = useStore((s) => s.prefs.changesWidth)
  const [dragging, setDragging] = useState(false)
  return (
    <aside
      aria-label="Cambios"
      inert={!open}
      style={{ width: open ? width : 0 }}
      className={cn(
        'relative shrink-0 overflow-hidden',
        !dragging && 'transition-[width] duration-(--panel-ms) ease-drawer',
        open && 'border-l border-border'
      )}
    >
      {open && <ResizeHandle width={width} onDragging={setDragging} />}
      <MotionConfig reducedMotion="user">
        {/* Por sesión: al cambiar de sesión todo vuelve a empezar, plegado. */}
        <PanelBody key={id ?? 'ninguna'} id={id} open={open} width={width} />
      </MotionConfig>
    </aside>
  )
}

// El borde izquierdo del panel: se arrastra para ensancharlo (o con las flechas, con el foco).
function ResizeHandle({
  width,
  onDragging
}: {
  width: number
  onDragging: (on: boolean) => void
}): React.JSX.Element {
  const { min, max } = LIMITS.changesWidth
  const clamp = (w: number): number => Math.round(Math.min(max, Math.max(min, w)))
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho del panel de cambios"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0
        if (step) setPrefs({ changesWidth: clamp(width + step) })
      }}
      onPointerDown={(e) => {
        const startX = e.clientX
        onDragging(true)
        const move = (ev: PointerEvent): void =>
          setPrefs({ changesWidth: clamp(width + startX - ev.clientX) })
        const up = (): void => {
          onDragging(false)
          removeEventListener('pointermove', move)
          removeEventListener('pointerup', up)
        }
        addEventListener('pointermove', move)
        addEventListener('pointerup', up)
      }}
      className="group absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize outline-none"
    >
      <span className="absolute inset-y-0 left-0 w-px transition-colors duration-120 group-hover:bg-muted-foreground/50 group-focus-visible:bg-foreground group-active:bg-foreground" />
    </div>
  )
}

function PanelBody({
  id,
  open,
  width
}: {
  id: string | null
  open: boolean
  width: number
}): React.JSX.Element {
  const status = useStore((s) => s.sessions.find((x) => x.id === id)?.status)
  const [changes, setChanges] = useState<Changes | null | undefined>(undefined)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [spinning, setSpinning] = useState(false)
  const [tick, setTick] = useState(0)
  const asked = useRef(0)

  // Pide los cambios; el estado se escribe cuando llega la respuesta, y solo si es la última
  // pedida (un sondeo lento no pisa a uno más nuevo).
  const load = useCallback((): Promise<void> => {
    if (!id) return Promise.resolve()
    const mine = ++asked.current
    return git
      .changes(id)
      .catch(() => null)
      .then((next) => {
        if (mine !== asked.current) return
        // Sin cambios no hay estado nuevo; pero el tick sube siempre: una línea editada de nuevo
        // deja el mismo +1/−1 y los diffs abiertos deben volver a pedirse.
        setChanges((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        setTick((t) => t + 1)
        if (next) setDiffStats(id, sum(next.files, 'add'), sum(next.files, 'del'))
      })
  }, [id])

  useEffect(() => {
    if (!open) return
    const first = setTimeout(load) // fuera del efecto: el estado llega con la respuesta
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [open, load, status])

  const refresh = (): void => {
    setSpinning(true)
    load().finally(() => setSpinning(false))
  }

  const files = changes?.files ?? []
  const add = sum(files, 'add')
  const del = sum(files, 'del')
  const allOpen = files.length > 0 && files.every((f) => expanded.has(f.path))
  const toggle = (path: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(path)) next.add(path)
      return next
    })

  return (
    <div className="flex h-full flex-col bg-sidebar/40" style={{ width }}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-3">
        {changes ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <GitBranchIcon size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{changes.branch.replace(/^slate\//, '')}</span>
            {changes.isolated && (
              <>
                <ArrowRightIcon size={12} className="shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-muted-foreground">{changes.base}</span>
              </>
            )}
          </span>
        ) : (
          <span className="font-medium">Cambios</span>
        )}
        <Counts add={add} del={del} className="ml-auto" />
        <button onClick={refresh} aria-label="Recargar" title="Recargar" className={iconButton}>
          <ArrowClockwiseIcon size={15} className={cn(spinning && 'animate-spin')} />
        </button>
        <button
          onClick={() => setExpanded(allOpen ? new Set() : new Set(files.map((f) => f.path)))}
          disabled={!files.length}
          aria-label={allOpen ? 'Plegar todo' : 'Desplegar todo'}
          title={allOpen ? 'Plegar todo' : 'Desplegar todo'}
          className={cn(iconButton, 'disabled:opacity-40')}
        >
          {allOpen ? (
            <ArrowsInLineVerticalIcon size={15} />
          ) : (
            <ArrowsOutLineVerticalIcon size={15} />
          )}
        </button>
        <DiffOptions />
        <button
          onClick={toggleChanges}
          aria-label="Cerrar cambios"
          title="Cerrar"
          className={iconButton}
        >
          <XIcon size={15} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!id ? (
          <Empty title="Sin sesión" text="Abre una sesión para ver lo que cambia." />
        ) : changes === null ? (
          <Empty title="Sin git" text="Esta carpeta no es un repositorio git con commits." />
        ) : changes && !files.length ? (
          <Empty
            title="Sin cambios todavía"
            text="Cuando la sesión toque archivos aparecerán aquí, con su diff."
          />
        ) : (
          files.map((f) => (
            <FileRow
              key={f.path}
              sessionId={id}
              file={f}
              open={expanded.has(f.path)}
              onToggle={() => toggle(f.path)}
              tick={tick}
            />
          ))
        )}
      </div>

      {id && changes?.isolated && <Actions sessionId={id} changes={changes} />}
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center px-8 pt-20 text-center">
      <span className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground">
        <GitDiffIcon size={18} />
      </span>
      <p className="mt-4 text-[15px] font-medium">{title}</p>
      <p className="mt-1.5 max-w-64 leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

// Cómo se ve el diff: ajuste de línea, espacios y tamaño del código. Se guarda en las preferencias.
function DiffOptions(): React.JSX.Element {
  const { diffWrap, diffIgnoreSpace, codeFontSize } = useStore((s) => ({
    diffWrap: s.prefs.diffWrap,
    diffIgnoreSpace: s.prefs.diffIgnoreSpace,
    codeFontSize: s.prefs.codeFontSize
  }))
  const { min, max } = LIMITS.codeFontSize
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Opciones del diff"
        title="Opciones del diff"
        className={iconButton}
      >
        <SlidersHorizontalIcon size={15} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuCheckboxItem
          checked={diffWrap}
          onCheckedChange={(v) => setPrefs({ diffWrap: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Ajustar líneas largas
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={diffIgnoreSpace}
          onCheckedChange={(v) => setPrefs({ diffIgnoreSpace: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Ignorar espacios en blanco
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <div className="flex items-center gap-1 py-1 pr-1 pl-2">
          <span className="flex-1">Tamaño del código</span>
          <button
            aria-label="Código más pequeño"
            disabled={codeFontSize <= min}
            onClick={() => setPrefs({ codeFontSize: codeFontSize - 1 })}
            className={cn(iconButton, 'disabled:opacity-40')}
          >
            <MinusIcon size={13} />
          </button>
          <span className="w-7 text-center font-mono text-[12px] tabular-nums">{codeFontSize}</span>
          <button
            aria-label="Código más grande"
            disabled={codeFontSize >= max}
            onClick={() => setPrefs({ codeFontSize: codeFontSize + 1 })}
            className={cn(iconButton, 'disabled:opacity-40')}
          >
            <PlusIcon size={13} />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
