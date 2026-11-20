import { memo, useEffect, useId, useRef, useState } from 'react'
import {
  CaretRightIcon,
  GearSixIcon,
  GitBranchIcon,
  ArrowBendDownRightIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SquaresFourIcon,
  TerminalWindowIcon
} from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import { useAgo } from '@renderer/lib/useAgo'
import { resolveStatus } from '@renderer/lib/status'
import { PulseDot } from '@renderer/components/ui/motion-bits'
import { useReduceMotion } from '@renderer/motion'
import {
  closeSession,
  groupByView,
  isShared,
  moveToOwnView,
  needsYou,
  newSession,
  placeBeside,
  removeFolder,
  renameSession,
  folderOf,
  samePath,
  selectSession,
  splitSession,
  toggleBoard,
  toggleFolder,
  useStore,
  viewOf,
  type Project,
  type Session
} from '@renderer/store'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { SessionIcon } from '@renderer/components/SessionIcon'
import { Counts } from '@renderer/components/ChangesPanel'
import { openNewSessionMenu, openSettings, openTask } from '@renderer/overlays'
import { shortcutKeys, useShortcutsRev } from '@renderer/shortcuts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

const rowClass =
  'relative flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left transition-colors duration-120 hover:bg-accent/40'

// Las mismas opciones sirven al botón "+" y al clic derecho de la carpeta.
function NewSessionItems({
  path,
  Item,
  Separator
}: {
  path: string
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator
}): React.JSX.Element {
  const agents = useStore((s) => s.agents.filter((a) => a.installed))
  return (
    <>
      <Item onSelect={() => newSession(path)}>
        <TerminalWindowIcon /> Nueva shell
      </Item>
      {agents.length > 0 && <Separator />}
      {agents.map((a) => (
        <Item key={a.id} onSelect={() => newSession(path, a.id)}>
          <SessionIcon kind={a.id} /> {a.name}
        </Item>
      ))}
    </>
  )
}

// Acción destructiva que, si `ask` trae una pregunta, pide un segundo clic antes de ejecutarse.
// El estado vive en el item: al cerrarse el menú se desmonta y la confirmación se olvida sola.
function DangerItem({
  label,
  ask,
  onConfirm
}: {
  label: string
  ask?: string
  onConfirm: () => void
}): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  return (
    <ContextMenuItem
      variant="destructive"
      onSelect={(e) => {
        if (ask && !asking) {
          e.preventDefault()
          setAsking(true)
          return
        }
        onConfirm()
      }}
    >
      {asking ? ask : label}
    </ContextMenuItem>
  )
}

// Hace cuánto está en su estado; cambia justo cuando el texto cambia.
function Since({ since }: { since: number }): React.JSX.Element {
  return (
    <span className="ml-auto shrink-0 pl-1 text-3xs text-muted-foreground/60 tabular-nums">
      {useAgo(since)}
    </span>
  )
}

const SessionRow = memo(function SessionRow({
  session,
  active
}: {
  session: Session
  active: boolean
}): React.JSX.Element {
  // Desde el menú, el campo espera a que el menú termine de cerrarse para tomar el foco:
  // si lo tomara antes, el cierre se lo quitaría y ese blur guardaría el nombre al instante.
  const [editing, setEditing] = useState<false | 'direct' | 'menu'>(false)
  const input = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const shared = useStore((s) => isShared(s, session.id))
  const stats = useStore((s) => s.diffStats[session.id])
  // Quien la lanzó por MCP (orquestación): se nombra al pasar el puntero y con su marca.
  const parentTitle = useStore((s) => s.sessions.find((x) => x.id === session.parent)?.title)
  // Solo tiene sentido traerla junto al panel activo si está en otra vista.
  const elsewhere = useStore((s) => !!s.activeId && viewOf(s, s.activeId) !== viewOf(s, session.id))

  // Un solo estado visible (lib/status.ts); lo que no es de ahora, a media luz.
  const shownState = resolveStatus(session)

  const finishRename = (value: string): void => {
    if (!cancelled.current) renameSession(session.id, value)
    cancelled.current = false
    setEditing(false)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role={editing ? undefined : 'button'}
          tabIndex={editing ? undefined : 0}
          data-status={session.status}
          data-unread={session.unread}
          data-state={shownState}
          aria-current={active ? 'true' : undefined}
          onClick={() => selectSession(session.id)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
            e.preventDefault()
            selectSession(session.id)
          }}
          onDoubleClick={() => setEditing('direct')}
          title={parentTitle && `Lanzada por ${parentTitle}`}
          className={cn(
            rowClass,
            'pl-7 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
            session.worktree && 'h-auto min-h-7 py-1',
            active ? 'bg-accent hover:bg-accent' : 'opacity-75 hover:opacity-100',
            shownState === 'exited' && 'text-muted-foreground'
          )}
        >
          <span aria-hidden className="chalk" />
          <SessionIcon kind={session.kind} />
          {parentTitle && (
            <ArrowBendDownRightIcon
              size={11}
              aria-hidden
              className="absolute top-1.5 left-4 text-muted-foreground"
            />
          )}
          {editing ? (
            <input
              ref={input}
              autoFocus={editing === 'direct'}
              defaultValue={session.title}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => finishRename(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  cancelled.current = true
                  e.currentTarget.blur()
                }
              }}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          ) : (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{session.title}</span>
              {/* La rama propia de una sesión aislada, sin el prefijo slate/ que comparten todas. */}
              {session.worktree && (
                <span
                  title={session.worktree.branch}
                  className="flex items-center gap-1 text-[12px] text-muted-foreground"
                >
                  <GitBranchIcon size={12} className="shrink-0" />
                  <span className="truncate">
                    {session.worktree.branch.replace(/^slate\//, '')}
                  </span>
                  {/* Lo último que contó el panel de cambios. */}
                  {stats && <Counts add={stats.add} del={stats.del} className="ml-auto pl-1" />}
                </span>
              )}
            </span>
          )}
          {!editing && <Since since={session.since} />}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-52"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          input.current?.focus()
        }}
      >
        <ContextMenuItem onSelect={() => setEditing('menu')}>Renombrar</ContextMenuItem>
        <ContextMenuSeparator />
        {elsewhere && (
          <>
            <ContextMenuItem onSelect={() => placeBeside(session.id, 'row')}>
              Abrir a la derecha del panel actual
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => placeBeside(session.id, 'col')}>
              Abrir debajo del panel actual
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem onSelect={() => splitSession(session.id, 'row')}>
          Dividir a la derecha con una shell nueva
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => splitSession(session.id, 'col')}>
          Dividir abajo con una shell nueva
        </ContextMenuItem>
        {shared && (
          <ContextMenuItem onSelect={() => moveToOwnView(session.id)}>
            Mover a su propia vista
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <DangerItem
          label="Cerrar"
          ask={session.status === 'working' ? 'Está trabajando. ¿Cerrar?' : undefined}
          onConfirm={() => closeSession(session.id)}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
})

// Las sesiones que comparten vista van juntas dentro de un recuadro, en el orden en que aparecen.
function SessionList({ sessions }: { sessions: Session[] }): React.JSX.Element {
  const activeId = useStore((s) => s.activeId)
  const groups = useStore((s) => groupByView(s, sessions))

  return (
    <>
      {groups.map((members) => {
        const rows = members.map((s) => (
          <SessionRow key={s.id} session={s} active={s.id === activeId} />
        ))
        return members.length > 1 ? (
          <div key={members[0].id} className="space-y-0.5 rounded-md border border-border p-0.5">
            {rows}
          </div>
        ) : (
          rows
        )
      })}
    </>
  )
}

function FolderGroup({ project }: { project: Project }): React.JSX.Element {
  const sessions = useStore((s) => s.sessions.filter((x) => samePath(folderOf(x), project.path)))
  const sessionsId = useId()

  return (
    <section>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              rowClass,
              'group gap-0 px-0 font-medium text-muted-foreground hover:text-foreground'
            )}
          >
            <button
              type="button"
              aria-expanded={project.open}
              aria-controls={sessionsId}
              className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              onClick={() => toggleFolder(project.path)}
            >
              <CaretRightIcon
                size={14}
                className={cn(
                  'shrink-0 transition-transform duration-150',
                  project.open && 'rotate-90'
                )}
              />
              {/* Monograma: la inicial del proyecto, para reconocerlo de un vistazo. */}
              <span
                aria-hidden
                className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-accent text-3xs font-semibold text-foreground uppercase"
              >
                {project.name.charAt(0)}
              </span>
              <span className="truncate" title={project.path}>
                {project.name}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                onClick={(e) => e.stopPropagation()}
                aria-label={`Nueva sesión en ${project.name}`}
                className="mr-1.5 grid size-5 shrink-0 place-items-center rounded-sm opacity-0 transition-opacity duration-120 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <PlusIcon size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <NewSessionItems
                  path={project.path}
                  Item={DropdownMenuItem}
                  Separator={DropdownMenuSeparator}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <NewSessionItems
            path={project.path}
            Item={ContextMenuItem}
            Separator={ContextMenuSeparator}
          />
          <ContextMenuSeparator />
          <DangerItem
            label="Quitar de la barra lateral"
            ask={
              sessions.length
                ? `Cerrará ${sessions.length === 1 ? 'su sesión' : `sus ${sessions.length} sesiones`}. ¿Quitar?`
                : undefined
            }
            onConfirm={() => removeFolder(project.path)}
          />
        </ContextMenuContent>
      </ContextMenu>
      <div id={sessionsId} hidden={!project.open}>
        {project.open && <SessionList sessions={sessions} />}
      </div>
    </section>
  )
}

// Sesiones cuya carpeta no está en la barra lateral: siguen vivas, así que deben verse.
function OtherSessions(): React.JSX.Element | null {
  const others = useStore((s) =>
    s.sessions.filter((x) => !s.projects.some((p) => samePath(p.path, folderOf(x))))
  )
  if (!others.length) return null
  return (
    <section>
      <p className="flex h-7 items-center px-2 font-medium text-muted-foreground">Otras sesiones</p>
      <SessionList sessions={others} />
    </section>
  )
}

// Cuántos agentes trabajan y cuántos te necesitan, de un vistazo; abre el tablero.
function Activity(): React.JSX.Element {
  useShortcutsRev()
  const working = useStore((s) => s.sessions.filter((x) => x.status === 'working').length)
  const waiting = useStore((s) => s.sessions.filter((x) => needsYou(x.status)).length)
  const board = useStore((s) => s.board)
  const label = [
    working && `${working} trabajando`,
    waiting && `${waiting} te ${waiting === 1 ? 'necesita' : 'necesitan'}`
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <button
      onClick={toggleBoard}
      aria-pressed={board}
      aria-label={label ? `Tablero: ${label}` : 'Tablero'}
      title={`Tablero (${shortcutKeys('board')})`}
      className={cn(
        'ml-auto flex h-7 items-center gap-2 rounded-sm px-1.5 text-[12px] text-muted-foreground transition-colors duration-120 hover:bg-accent/40 hover:text-foreground',
        board && 'bg-accent text-foreground'
      )}
    >
      {working > 0 && (
        <span className="flex items-center gap-1 tabular-nums">
          <PulseDot className="bg-foreground" />
          {working}
        </span>
      )}
      {waiting > 0 && (
        <span className="flex items-center gap-1 text-attention tabular-nums">
          <span className="size-1.5 rounded-full bg-attention" />
          {waiting}
        </span>
      )}
      <SquaresFourIcon size={15} />
    </button>
  )
}

// Carpetas, sesiones y el botón de nueva sesión. Lo comparten la barra acoplada y la flotante;
// solo la acoplada es origen del morph de Blendy (dos orígenes con el mismo id lo confundirían).
function SidebarContent({ morphSource }: { morphSource: boolean }): React.JSX.Element {
  useShortcutsRev()
  const projects = useStore((s) => s.projects)
  return (
    <>
      <div className="flex h-9 shrink-0 items-center pr-2 pl-4">
        <span className="text-[13px] font-semibold tracking-tight">Slate</span>
        <Activity />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pt-1">
        {projects.map((p) => (
          <FolderGroup key={p.path} project={p} />
        ))}
        <OtherSessions />
      </nav>
      <footer className="flex h-11 items-center px-2">
        {/* Blendy transforma este botón en el menú de nueva sesión: un único hijo envoltorio. */}
        <button
          data-blendy-from={morphSource ? 'new-session' : undefined}
          onClick={openNewSessionMenu}
          className={cn(rowClass, 'w-auto text-muted-foreground hover:text-foreground')}
        >
          <span className="flex items-center gap-2">
            <PlusIcon size={15} /> Nueva sesión
          </span>
        </button>
        {/* Blendy transforma el avión de papel en el composer y el engranaje en Ajustes. */}
        <button
          data-blendy-from={morphSource ? 'task' : undefined}
          onClick={openTask}
          aria-label="Nueva tarea"
          title={`Nueva tarea (${shortcutKeys('task')})`}
          className="ml-auto grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent/40 hover:text-foreground"
        >
          <span className="grid place-items-center">
            <PaperPlaneTiltIcon size={16} />
          </span>
        </button>
        <button
          data-blendy-from={morphSource ? 'settings' : undefined}
          onClick={openSettings}
          aria-label="Ajustes"
          title={`Ajustes (${shortcutKeys('settings')})`}
          className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent/40 hover:text-foreground"
        >
          <span className="grid place-items-center">
            <GearSixIcon size={16} />
          </span>
        </button>
      </footer>
    </>
  )
}

// Un menú de Radix abierto vive fuera de la barra flotante: salir hacia él no debe esconderla.
const menuOpen = (): boolean =>
  !!document.querySelector(
    '[data-slot="context-menu-content"], [data-slot="dropdown-menu-content"]'
  )

// Acoplada: el ancho cambia de una vez para que xterm no se reajuste por cada cuadro.
// Plegada: al llevar el puntero al borde izquierdo sale flotando sobre el terminal, esmerilada;
// entra en 200 ms y sale en 160 ms (design.md §7).
export function Sidebar(): React.JSX.Element {
  const open = useStore((s) => s.sidebar)
  const pinnedBar = useStore((s) => s.prefs.pinTopBar)
  const reduce = useReduceMotion()
  const [peek, setPeek] = useState<'off' | 'in' | 'out'>('off')
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(leaving.current), [])

  const show = (): void => {
    clearTimeout(leaving.current)
    setPeek('in')
  }
  const hide = (): void => {
    if (menuOpen()) return
    if (reduce) return setPeek('off')
    setPeek('out')
    leaving.current = setTimeout(() => setPeek('off'), 160)
  }

  return (
    <>
      <aside inert={!open} className={cn('shrink-0 overflow-hidden', open ? 'w-60' : 'w-0')}>
        {open && (
          <div className="flex h-full w-60 flex-col animate-in duration-(--panel-ms) ease-drawer fade-in-0 slide-in-from-left-2">
            <SidebarContent morphSource />
          </div>
        )}
      </aside>
      {!open && (
        <div
          aria-hidden
          className={cn('fixed bottom-0 left-0 z-30 w-2', pinnedBar ? 'top-9' : 'top-2')}
          onMouseEnter={show}
        />
      )}
      {!open && peek !== 'off' && (
        <aside
          aria-label="Barra lateral"
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{ animationFillMode: 'forwards' }}
          className={cn(
            pinnedBar ? 'top-11' : 'top-2',
            'fixed bottom-2 left-2 z-30 flex w-60 flex-col rounded-lg glass',
            peek === 'in'
              ? 'animate-in duration-(--panel-ms) ease-drawer slide-in-from-left-full'
              : 'animate-out duration-160 ease-in slide-out-to-left-full'
          )}
        >
          <SidebarContent morphSource={false} />
        </aside>
      )}
    </>
  )
}
