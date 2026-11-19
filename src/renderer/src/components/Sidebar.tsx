import { useRef, useState } from 'react'
import { Bot, ChevronRight, FolderPlus, Plus, SquareTerminal } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import {
  addFolder,
  closeSession,
  newSession,
  removeFolder,
  renameSession,
  samePath,
  selectSession,
  toggleFolder,
  useStore,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

const rowClass =
  'relative flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left transition-colors duration-100 hover:bg-accent/40'

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
        <SquareTerminal /> Nueva shell
      </Item>
      {agents.length > 0 && <Separator />}
      {agents.map((a) => (
        <Item key={a.id} onSelect={() => newSession(path, a.id)}>
          <Bot /> {a.name}
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

function SessionRow({ session, active }: { session: Session; active: boolean }): React.JSX.Element {
  // Desde el menú, el campo espera a que el menú termine de cerrarse para tomar el foco:
  // si lo tomara antes, el cierre se lo quitaría y ese blur guardaría el nombre al instante.
  const [editing, setEditing] = useState<false | 'direct' | 'menu'>(false)
  const input = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const Icon = session.kind === 'shell' ? SquareTerminal : Bot

  const finishRename = (value: string): void => {
    if (!cancelled.current) renameSession(session.id, value)
    cancelled.current = false
    setEditing(false)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-status={session.status}
          data-unread={session.unread}
          onClick={() => selectSession(session.id)}
          onDoubleClick={() => setEditing('direct')}
          className={cn(
            rowClass,
            'pl-7',
            active && 'bg-accent hover:bg-accent',
            session.status === 'exited' && 'text-muted-foreground'
          )}
        >
          <span className="chalk" />
          <Icon size={14} strokeWidth={1.6} className="shrink-0 text-muted-foreground" />
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
            <span className="truncate">{session.title}</span>
          )}
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
        <DangerItem
          label="Cerrar"
          ask={session.status === 'working' ? 'Está trabajando. ¿Cerrar?' : undefined}
          onConfirm={() => closeSession(session.id)}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SessionList({ sessions }: { sessions: Session[] }): React.JSX.Element {
  const activeId = useStore((s) => s.activeId)
  return (
    <>
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} active={s.id === activeId} />
      ))}
    </>
  )
}

function FolderGroup({ project }: { project: Project }): React.JSX.Element {
  const sessions = useStore((s) => s.sessions.filter((x) => samePath(x.cwd, project.path)))

  return (
    <section>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              rowClass,
              'group font-medium text-muted-foreground hover:text-foreground'
            )}
            onClick={() => toggleFolder(project.path)}
          >
            <ChevronRight
              size={14}
              strokeWidth={1.8}
              className={cn(
                'shrink-0 transition-transform duration-150',
                project.open && 'rotate-90'
              )}
            />
            <span className="truncate" title={project.path}>
              {project.name}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                onClick={(e) => e.stopPropagation()}
                aria-label={`Nueva sesión en ${project.name}`}
                className="ml-auto grid size-5 place-items-center rounded-sm opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <Plus size={14} strokeWidth={1.8} />
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
      {project.open && <SessionList sessions={sessions} />}
    </section>
  )
}

// Sesiones cuya carpeta no está en la barra lateral: siguen vivas, así que deben verse.
function OtherSessions(): React.JSX.Element | null {
  const others = useStore((s) =>
    s.sessions.filter((x) => !s.projects.some((p) => samePath(p.path, x.cwd)))
  )
  if (!others.length) return null
  return (
    <section>
      <p className="flex h-7 items-center px-2 font-medium text-muted-foreground">Otras sesiones</p>
      <SessionList sessions={others} />
    </section>
  )
}

export function Sidebar(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  return (
    <aside className="flex w-60 shrink-0 flex-col">
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pt-1">
        {projects.map((p) => (
          <FolderGroup key={p.path} project={p} />
        ))}
        <OtherSessions />
      </nav>
      <footer className="flex h-11 items-center px-2">
        <button
          onClick={addFolder}
          className={cn(rowClass, 'w-auto text-muted-foreground hover:text-foreground')}
        >
          <FolderPlus size={15} strokeWidth={1.6} /> Añadir carpeta
        </button>
      </footer>
    </aside>
  )
}
