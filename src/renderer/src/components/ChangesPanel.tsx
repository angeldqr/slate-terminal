// Panel de cambios. Basado en el DiffPanel de T3 Code (MIT); ver THIRD_PARTY_NOTICES.md.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReduceMotion } from '@renderer/motion'
import {
  ArrowClockwiseIcon,
  ArrowLineUpIcon,
  ArrowRightIcon,
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  CaretDownIcon,
  CaretRightIcon,
  CircleNotchIcon,
  CopyIcon,
  CodeIcon,
  FolderOpenIcon,
  ListIcon,
  TreeStructureIcon,
  FileIcon,
  FileMinusIcon,
  FilePlusIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  MinusIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  XIcon
} from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import { DiffPool, DiffView } from './diffs/DiffView'
import { Skeleton } from './ui/skeleton'
import { Empty as EmptyCards } from './ui/empty'
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
import type { Changes, DiffScope, FileChange } from '../../../shared/types'
import {
  progressLabel,
  resolveQuickActions,
  treeRows,
  type QuickId,
  type Row
} from '@renderer/changes.logic'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

const { git } = window.slate
const POLL_MS = 4000 // ponytail: sondeo mientras el panel está abierto; fs.watch si llega a pesar

const TEST_FILE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|\.check\.mts$/i

const iconButton =
  'grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground'

function Diff({
  sessionId,
  file,
  tick,
  scope
}: {
  sessionId: string
  file: FileChange
  tick: number
  scope: DiffScope
}): React.JSX.Element {
  const diffIgnoreSpace = useStore((s) => s.prefs.diffIgnoreSpace)
  // null = cargando; '' = sin texto que mostrar. Se conserva el patch anterior mientras llega el nuevo.
  const [patch, setPatch] = useState<string | null>(null)

  // tick sube con cada sondeo del panel: el agente puede seguir editando el archivo.
  useEffect(() => {
    let current = true
    git
      .fileDiff(sessionId, file.path, diffIgnoreSpace, scope)
      .then((p) => current && setPatch(p))
      .catch(() => current && setPatch(''))
    return () => void (current = false)
  }, [sessionId, file.path, tick, diffIgnoreSpace, scope])

  if (file.binary) {
    return (
      <p className="px-4 py-3 text-muted-foreground">
        Binario, carpeta o archivo grande: sin vista previa.
      </p>
    )
  }
  if (patch === '') {
    return (
      <p className="px-4 py-3 text-muted-foreground">
        {diffIgnoreSpace ? 'Solo cambian espacios en blanco.' : 'Sin cambios de texto.'}
      </p>
    )
  }
  return (
    <div className="border-t border-border bg-background/60">
      <DiffView sessionId={sessionId} path={file.path} patch={patch} scope={scope} />
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

// true en cuanto la fila abierta está a menos de 600 px de la vista; después no vuelve a false.
// Un panel con muchos archivos desplegados solo pide el diff de los que se van a ver.
function useNear(ref: React.RefObject<HTMLElement | null>, active: boolean): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!active || near || !el) return
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), {
      rootMargin: '600px 0px'
    })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, active, near])
  return near
}

function FileRow({
  sessionId,
  file,
  open,
  onToggle,
  tick,
  scope,
  depth,
  tree
}: {
  sessionId: string
  file: FileChange
  open: boolean
  onToggle: () => void
  tick: number
  scope: DiffScope
  depth: number
  tree: boolean // en el árbol solo se muestra el nombre: la carpeta ya está arriba
}): React.JSX.Element {
  // Con prefers-reduced-motion la altura no se anima: aparece en el acto.
  const reduce = useReduceMotion()
  const rowRef = useRef<HTMLDivElement>(null)
  const near = useNear(rowRef, open)
  const slash = file.path.lastIndexOf('/')
  const dir = !tree && slash >= 0 ? file.path.slice(0, slash + 1) : ''
  const name = file.path.slice(slash + 1)
  const status = STATUS[file.status]
  return (
    <div ref={rowRef} className="border-b border-border/60">
      <div className="group/file sticky top-0 z-[1] flex h-9 items-center bg-sidebar transition-colors duration-120 hover:bg-accent/40">
        <button
          onClick={onToggle}
          aria-expanded={open}
          title={`${status.label}: ${file.path}`}
          style={{ paddingLeft: 12 + depth * 14 }}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 pr-1 text-left"
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
        <FileActions sessionId={sessionId} file={file} scope={scope} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {near ? (
              <Diff sessionId={sessionId} file={file} tick={tick} scope={scope} />
            ) : (
              <div className="space-y-2 border-t border-border px-4 py-3">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// La fila de una carpeta en la vista de árbol: pliega y despliega lo que contiene.
function DirRow({
  row,
  onToggle
}: {
  row: Extract<Row<FileChange>, { kind: 'dir' }>
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onToggle}
      aria-expanded={row.open}
      style={{ paddingLeft: 12 + row.depth * 14 }}
      className="flex h-8 w-full items-center gap-2 border-b border-border/60 pr-3 text-left text-muted-foreground transition-colors duration-120 hover:bg-accent/40 hover:text-foreground"
    >
      {row.open ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
      <span className="truncate" title={row.path}>
        {row.name}
      </span>
    </button>
  )
}

// Copiar la ruta, mostrarla en el explorador y descartar lo de un solo archivo (con segundo
// clic), a la derecha de la fila. Un commit ya hecho no se descarta archivo a archivo.
function FileActions({
  sessionId,
  file,
  scope
}: {
  sessionId: string
  file: FileChange
  scope: DiffScope
}): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAsking(false), 3000)
    return () => clearTimeout(t)
  }, [asking])
  return (
    <span className="flex shrink-0 items-center pr-1.5 opacity-0 transition-opacity duration-120 group-focus-within/file:opacity-100 group-hover/file:opacity-100 pointer-coarse:opacity-100">
      <button
        aria-label="Copiar la ruta"
        title="Copiar la ruta"
        onClick={() => {
          navigator.clipboard.writeText(file.path).then(
            () => flashHint('Ruta copiada'),
            () => flashHint('No se pudo copiar')
          )
        }}
        className={iconButton}
      >
        <CopyIcon size={14} />
      </button>
      <button
        aria-label="Mostrar en el explorador"
        title="Mostrar en el explorador"
        onClick={() => void git.showFile(sessionId, file.path, scope)}
        className={iconButton}
      >
        <FolderOpenIcon size={14} />
      </button>
      <button
        aria-label="Abrir en VS Code"
        title="Abrir en VS Code"
        onClick={() => void git.showFile(sessionId, file.path, scope, true)}
        className={iconButton}
      >
        <CodeIcon size={14} />
      </button>
      {scope !== 'last' && (
        <button
          aria-label={asking ? 'Se pierde este cambio. ¿Descartar?' : 'Descartar este archivo'}
          title={asking ? 'Se pierde este cambio. ¿Descartar?' : 'Descartar este archivo'}
          onClick={() => {
            if (!asking) return setAsking(true)
            setAsking(false)
            git.discardFile(sessionId, file.path, scope).then(
              (ok) => flashHint(ok ? 'Archivo descartado' : 'No se pudo descartar'),
              (err) => flashHint(reason(err))
            )
          }}
          className={cn(
            iconButton,
            asking && 'w-auto px-1.5 text-destructive hover:text-destructive'
          )}
        >
          {asking ? <span className="text-[12px]">¿Descartar?</span> : <TrashIcon size={14} />}
        </button>
      )}
    </span>
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

// Elegir qué archivos entran en el commit o el PR; los demás se quedan sin guardar en la carpeta.
function CommitDialog({
  mode,
  files,
  onClose,
  onConfirm
}: {
  mode: 'commit' | 'pr' | 'push'
  files: FileChange[]
  onClose: () => void
  onConfirm: (excluded: string[]) => void
}): React.JSX.Element {
  const [left, setLeft] = useState<Set<string>>(new Set())
  const flip = (path: string): void =>
    setLeft((prev) => {
      const next = new Set(prev)
      if (!next.delete(path)) next.add(path)
      return next
    })
  const leftNow = files.filter((f) => left.has(f.path)).map((f) => f.path) // el sondeo pudo quitar alguno
  const included = files.length - leftNow.length
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'pr' ? 'Crear PR' : mode === 'push' ? 'Subir la rama' : 'Hacer commit'}
          </DialogTitle>
          <DialogDescription>
            Desmarca lo que no quieras incluir: se queda sin guardar en la carpeta de la sesión.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 overflow-y-auto rounded-md border border-border">
          {files.map((f) => (
            <li key={f.path}>
              <label className="flex h-8 cursor-pointer items-center gap-2 px-3 hover:bg-accent/40">
                <input
                  type="checkbox"
                  checked={!left.has(f.path)}
                  onChange={() => flip(f.path)}
                  className="accent-foreground"
                />
                <span className="min-w-0 flex-1 truncate" title={f.path}>
                  {f.path}
                </span>
                <Counts add={f.add} del={f.del} />
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 rounded-md px-3 text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            disabled={included === 0}
            onClick={() => onConfirm(leftNow)}
            className="h-8 rounded-md bg-foreground px-3 font-semibold text-background disabled:opacity-50"
          >
            {mode === 'pr' ? 'Subir y abrir PR' : mode === 'push' ? 'Subir' : 'Hacer commit'} (
            {included})
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ACTION_ICON = {
  merge: GitMergeIcon,
  pr: GitPullRequestIcon,
  commit: GitCommitIcon,
  push: ArrowLineUpIcon,
  discard: TrashIcon
}

// Lo que se hace con el trabajo de una rama aislada. La acción principal es fusionar en su base;
// la tabla de qué se puede y por qué no vive en changes.logic.ts.
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
  const [busy, setBusy] = useState<QuickId | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [dialog, setDialog] = useState<'commit' | 'pr' | 'push' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Los segundos que lleva la acción en curso, dentro del propio botón.
  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => {
      clearInterval(timer)
      setSeconds(0)
    }
  }, [busy])

  const actions = resolveQuickActions({
    isolated: true,
    empty: !changes.files.length,
    message,
    busy: !!busy,
    base: changes.base
  })
  const [primary, ...others] = actions

  const run = async (id: QuickId, work: () => Promise<string | void>): Promise<void> => {
    setBusy(id)
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
  const commit = (excluded: string[]): Promise<void> =>
    run('commit', async () =>
      (await git.commit(sessionId, message, excluded))
        ? 'Commit hecho en la rama'
        : 'No había nada nuevo que guardar'
    )
  const pr = (excluded: string[]): Promise<void> =>
    run('pr', async () => {
      await git.pr(sessionId, message, excluded)
      return 'Rama subida: el PR se abrió en el navegador'
    })
  const push = (excluded: string[]): Promise<void> =>
    run('push', () => git.push(sessionId, message, excluded))
  const discard = (): Promise<void> =>
    run('discard', async () => {
      const hint = await git.discard(sessionId)
      closeSession(sessionId)
      return hint
    })

  const PrimaryIcon = ACTION_ICON.merge
  return (
    <footer className="space-y-2 border-t border-border/80 bg-sidebar/45 p-3">
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
          disabled={!primary.enabled}
          title={primary.reason}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-l-md bg-foreground font-semibold text-background transition-colors duration-120 hover:bg-foreground/85 disabled:opacity-50"
        >
          {busy ? (
            <CircleNotchIcon size={14} className="animate-spin" />
          ) : (
            <PrimaryIcon size={14} weight="regular" />
          )}
          {busy ? progressLabel(busy, seconds) : primary.label}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={!!busy}
            aria-label="Más acciones"
            className="grid h-9 w-9 place-items-center rounded-r-md border-l border-background/20 bg-foreground text-background transition-colors duration-120 hover:bg-foreground/85 disabled:opacity-50"
          >
            <CaretDownIcon size={13} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {others.map((a) => {
              const Icon = ACTION_ICON[a.id]
              return (
                <div key={a.id}>
                  {a.id === 'discard' && <DropdownMenuSeparator />}
                  {a.id === 'discard' ? (
                    <DiscardItem onConfirm={discard} />
                  ) : (
                    <DropdownMenuItem
                      disabled={!a.enabled}
                      title={a.reason}
                      onSelect={() =>
                        setDialog(a.id === 'pr' ? 'pr' : a.id === 'push' ? 'push' : 'commit')
                      }
                    >
                      <Icon /> {a.label}
                    </DropdownMenuItem>
                  )}
                </div>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dialog && (
        <CommitDialog
          mode={dialog}
          files={changes.files}
          onClose={() => setDialog(null)}
          onConfirm={(excluded) => {
            const mode = dialog
            setDialog(null)
            void (mode === 'pr'
              ? pr(excluded)
              : mode === 'push'
                ? push(excluded)
                : commit(excluded))
          }}
        />
      )}
    </footer>
  )
}

// Panel de cambios: a la derecha del terminal, lo que la sesión activa ha tocado.
// Reserva su ancho de una vez y desliza solo su superficie, para no redibujar xterm por cada frame.
export function ChangesPanel(): React.JSX.Element {
  const open = useStore((s) => s.changes)
  const id = useStore((s) => s.activeId)
  const savedWidth = useStore((s) => s.prefs.changesWidth)
  const panelMs = useStore((s) => s.prefs.panelMs)
  const reduce = useReduceMotion()
  const [present, setPresent] = useState(open)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const width = dragWidth ?? savedWidth
  const occupiesSpace = open || present

  // El terminal cambia de tamaño una vez al abrir y una vez al terminar de cerrar. Animar el ancho
  // del contenedor forzaba a xterm/WebGL a repintarse en cada frame y podía dejar el lienzo corrupto.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => setPresent(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    <aside
      aria-label="Cambios"
      inert={!open}
      style={{ width: occupiesSpace ? width : 0 }}
      className={cn('relative shrink-0 overflow-hidden', occupiesSpace && 'border-l border-border')}
    >
      {open && (
        <ResizeHandle
          width={width}
          onResize={setDragWidth}
          onCommit={(next) => {
            setDragWidth(null)
            if (next !== savedWidth) setPrefs({ changesWidth: next })
          }}
        />
      )}
      <AnimatePresence initial={false} onExitComplete={() => !open && setPresent(false)}>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: '5%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '5%' }}
            transition={{ duration: reduce ? 0 : panelMs / 1000, ease: [0.32, 0.72, 0, 1] }}
            className="h-full w-full will-change-transform"
          >
            {/* Por sesión: al cambiar de sesión todo vuelve a empezar, plegado. */}
            <DiffPool>
              <PanelBody key={id ?? 'ninguna'} id={id} open={open} width={width} />
            </DiffPool>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  )
}

// El borde izquierdo del panel: se arrastra para ensancharlo (o con las flechas, con el foco).
function ResizeHandle({
  width,
  onResize,
  onCommit
}: {
  width: number
  onResize: (width: number | null) => void
  onCommit: (width: number) => void
}): React.JSX.Element {
  const { min, max } = LIMITS.changesWidth
  const clamp = (w: number): number => Math.round(Math.min(max, Math.max(min, w)))
  const drag = useRef<{ id: number; startX: number; startWidth: number; width: number } | null>(
    null
  )
  useEffect(() => () => onResize(null), [onResize])

  const finish = (commit: boolean): void => {
    const current = drag.current
    if (!current) return
    drag.current = null
    if (commit) onCommit(current.width)
    else onResize(null)
  }

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
        if (e.button !== 0 || drag.current) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { id: e.pointerId, startX: e.clientX, startWidth: width, width }
      }}
      onPointerMove={(e) => {
        const current = drag.current
        if (!current || current.id !== e.pointerId) return
        current.width = clamp(current.startWidth + current.startX - e.clientX)
        onResize(current.width)
      }}
      onPointerUp={(e) => {
        if (drag.current?.id === e.pointerId) finish(true)
      }}
      onPointerCancel={(e) => {
        if (drag.current?.id === e.pointerId) finish(false)
      }}
      onLostPointerCapture={(e) => {
        if (drag.current?.id === e.pointerId) finish(false)
      }}
      className="group absolute inset-y-0 left-0 z-10 w-1.5 touch-none cursor-col-resize outline-none"
    >
      <span className="absolute inset-y-0 left-0 w-px transition-colors duration-120 group-hover:bg-muted-foreground/50 group-focus-visible:bg-foreground group-active:bg-foreground" />
    </div>
  )
}

const SCOPES: { id: DiffScope; label: string; title: string }[] = [
  { id: 'base', label: 'Toda la rama', title: 'Todo lo que cambió desde la rama base' },
  { id: 'uncommitted', label: 'Sin guardar', title: 'Lo que falta por guardar en un commit' },
  { id: 'last', label: 'Último commit', title: 'Solo lo que entró en el último commit' }
]

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
  const hideTests = useStore((s) => s.prefs.hideTests)
  const asTree = useStore((s) => s.prefs.changesView === 'tree')
  const [scope, setScope] = useState<DiffScope>('base')
  const [changes, setChanges] = useState<Changes | null | undefined>(undefined)
  // Lo de toda la rama, sea cual sea la pestaña: las acciones (commit, fusionar…) actúan sobre eso.
  const [branch, setBranch] = useState<Changes | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [folded, setFolded] = useState<Set<string>>(new Set()) // carpetas plegadas del árbol
  const [spinning, setSpinning] = useState(false)
  const [tick, setTick] = useState(0)
  const asked = useRef(0)
  const seeded = useRef<DiffScope | null>(null)
  const scopeId = useId()

  // Pide los cambios; el estado se escribe cuando llega la respuesta, y solo si es la última
  // pedida (un sondeo lento no pisa a uno más nuevo).
  const load = useCallback((): Promise<void> => {
    if (!id) return Promise.resolve()
    const mine = ++asked.current
    return git
      .changes(id, scope)
      .catch(() => null)
      .then((next) => {
        if (mine !== asked.current) return
        // Sin cambios no hay estado nuevo; pero el tick sube siempre: una línea editada de nuevo
        // deja el mismo +1/−1 y los diffs abiertos deben volver a pedirse.
        setChanges((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        setTick((t) => t + 1)
        // Los cuatro primeros archivos llegan desplegados; el resto se carga al abrirlos.
        if (next?.files.length && seeded.current !== scope) {
          seeded.current = scope
          setExpanded(new Set(next.files.slice(0, 4).map((f) => f.path)))
        }
        if (scope === 'base') {
          setBranch((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
          if (next) setDiffStats(id, sum(next.files, 'add'), sum(next.files, 'del'))
        }
      })
      .then(async () => {
        if (scope === 'base' || mine !== asked.current) return
        const whole = await git.changes(id, 'base').catch(() => null)
        setBranch((prev) => (JSON.stringify(prev) === JSON.stringify(whole) ? prev : whole))
        if (whole) setDiffStats(id, sum(whole.files, 'add'), sum(whole.files, 'del'))
      })
  }, [id, scope])

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
  const pick = (next: DiffScope): void => {
    if (next === scope) return
    asked.current++ // una respuesta tardía de la pestaña anterior ya no se pinta
    setChanges(undefined)
    setExpanded(new Set())
    setScope(next)
  }

  const all = changes?.files ?? []
  const files = all.filter((f) => !hideTests || !TEST_FILE.test(f.path))
  const hidden = all.length - files.length // siguen en commit, fusión y descarte
  const add = sum(files, 'add')
  const del = sum(files, 'del')
  const allOpen = files.length > 0 && files.every((f) => expanded.has(f.path))
  const toggle = (path: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(path)) next.add(path)
      return next
    })
  const rows: Row<FileChange>[] = asTree
    ? treeRows(files, folded)
    : files.map((file) => ({ kind: 'file', file, name: file.path, depth: 0 }))
  // Sin rama propia, "toda la rama" es lo mismo que "sin guardar".
  const isolated = branch?.isolated ?? changes?.isolated
  const scopes = SCOPES.filter((s) => s.id !== 'base' || isolated !== false)
  const visibleScope = scope === 'base' && isolated === false ? 'uncommitted' : scope

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
        <button
          onClick={() => setPrefs({ changesView: asTree ? 'list' : 'tree' })}
          aria-label={asTree ? 'Ver como lista' : 'Ver como árbol'}
          title={asTree ? 'Ver como lista' : 'Ver como árbol'}
          className={iconButton}
        >
          {asTree ? <ListIcon size={15} /> : <TreeStructureIcon size={15} />}
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
      <div
        role="tablist"
        aria-label="Qué comparar"
        className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5"
      >
        {scopes.map((s, index) => (
          <button
            key={s.id}
            role="tab"
            id={`${scopeId}-${s.id}`}
            aria-controls={`${scopeId}-diff`}
            aria-selected={visibleScope === s.id}
            tabIndex={visibleScope === s.id ? 0 : -1}
            title={s.title}
            onClick={() => pick(s.id)}
            onKeyDown={(e) => {
              const last = scopes.length - 1
              const next =
                e.key === 'ArrowRight'
                  ? index === last
                    ? 0
                    : index + 1
                  : e.key === 'ArrowLeft'
                    ? index === 0
                      ? last
                      : index - 1
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? last
                        : -1
              if (next < 0) return
              e.preventDefault()
              const target = scopes[next].id
              document.getElementById(`${scopeId}-${target}`)?.focus()
              pick(target)
            }}
            className={cn(
              'h-6 rounded-sm px-2 text-[12px] transition-colors duration-120 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
              visibleScope === s.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${scopeId}-diff`}
        aria-labelledby={`${scopeId}-${visibleScope}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {!id ? (
          <Empty title="Sin sesión" text="Abre una sesión para ver lo que cambia." />
        ) : changes === null ? (
          <Empty title="Sin git" text="Esta carpeta no es un repositorio git con commits." />
        ) : changes && !files.length && !hidden ? (
          <Empty
            title={scope === 'last' ? 'Sin commits' : 'Sin cambios todavía'}
            text={
              scope === 'last'
                ? 'El último commit no cambió nada que mostrar.'
                : 'Cuando la sesión toque archivos aparecerán aquí, con su diff.'
            }
          />
        ) : (
          rows.map((r) =>
            r.kind === 'dir' ? (
              <DirRow
                key={'d' + r.path}
                row={r}
                onToggle={() =>
                  setFolded((prev) => {
                    const next = new Set(prev)
                    if (!next.delete(r.path)) next.add(r.path)
                    return next
                  })
                }
              />
            ) : (
              <FileRow
                key={r.file.path}
                sessionId={id}
                file={r.file}
                open={expanded.has(r.file.path)}
                onToggle={() => toggle(r.file.path)}
                tick={tick}
                scope={scope}
                depth={r.depth}
                tree={asTree}
              />
            )
          )
        )}
        {hidden > 0 && (
          <p className="px-3 py-2 text-[12px] text-muted-foreground">
            {hidden === 1 ? '1 archivo de prueba oculto' : `${hidden} archivos de prueba ocultos`}
          </p>
        )}
      </div>

      {id && branch?.isolated && <Actions sessionId={id} changes={branch} />}
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }): React.JSX.Element {
  return (
    <div className="flex justify-center pt-16">
      <EmptyCards title={title} text={text} compact />
    </div>
  )
}

// Cómo se ve el diff: ajuste de línea, espacios y tamaño del código. Se guarda en las preferencias.
function DiffOptions(): React.JSX.Element {
  const { diffStyle, hideTests, diffWrap, diffIgnoreSpace, codeFontSize } = useStore((s) => ({
    diffStyle: s.prefs.diffStyle,
    hideTests: s.prefs.hideTests,
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
          checked={diffStyle === 'split'}
          onCheckedChange={(v) => setPrefs({ diffStyle: v ? 'split' : 'unified' })}
          onSelect={(e) => e.preventDefault()}
        >
          Lado a lado
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={hideTests}
          onCheckedChange={(v) => setPrefs({ hideTests: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Ocultar archivos de prueba
        </DropdownMenuCheckboxItem>
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
