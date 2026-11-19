import { useState } from 'react'
import { Bot, ChevronRight, FolderPlus, Plus, SquareTerminal } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import {
  addFolder,
  closeSession,
  newSession,
  removeFolder,
  renameSession,
  select,
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

const row =
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

function SessionRow({ session, active }: { session: Session; active: boolean }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const exited = session.status === 'exited'
  const Icon = session.kind === 'shell' ? SquareTerminal : Bot

  return (
    <ContextMenu onOpenChange={(open) => !open && setConfirming(false)}>
      <ContextMenuTrigger asChild>
        <div
          data-status={session.status}
          data-unread={session.unread}
          onClick={() => select(session.id)}
          onDoubleClick={() => setEditing(true)}
          className={cn(row, 'pl-7', active && 'bg-accent', exited && 'text-muted-foreground')}
        >
          <span className="chalk" />
          <Icon size={14} strokeWidth={1.6} className="shrink-0 text-muted-foreground" />
          {editing ? (
            <input
              autoFocus
              defaultValue={session.title}
              onBlur={(e) => (renameSession(session.id, e.target.value), setEditing(false))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          ) : (
            <span className="truncate">{session.title}</span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => setEditing(true)}>Renombrar</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={(e) => {
            // Cerrar un agente que trabaja pide un segundo clic.
            if (session.status === 'working' && !confirming) {
              e.preventDefault()
              setConfirming(true)
              return
            }
            closeSession(session.id)
          }}
        >
          {confirming ? 'Está trabajando. ¿Cerrar?' : 'Cerrar'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function FolderGroup({ project }: { project: Project }): React.JSX.Element {
  const sessions = useStore((s) => s.sessions.filter((x) => x.cwd === project.path))
  const activeId = useStore((s) => s.activeId)

  return (
    <section>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(row, 'group font-semibold')}
            onClick={() => toggleFolder(project.path)}
          >
            <ChevronRight
              size={14}
              strokeWidth={1.8}
              className={cn(
                'shrink-0 text-muted-foreground transition-transform duration-150',
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
                className="ml-auto grid size-5 place-items-center rounded-sm text-muted-foreground opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <Plus size={14} strokeWidth={1.8} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <NewSessionItems
                  path={project.path}
                  Item={DropdownMenuItem}
                  Separator={DropdownMenuSeparator}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <NewSessionItems
            path={project.path}
            Item={ContextMenuItem}
            Separator={ContextMenuSeparator}
          />
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => removeFolder(project.path)}>
            Quitar de la barra lateral
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {project.open &&
        sessions.map((s) => <SessionRow key={s.id} session={s} active={s.id === activeId} />)}
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
      </nav>
      <footer className="flex h-11 items-center px-2">
        <button
          onClick={addFolder}
          className={cn(row, 'w-auto text-muted-foreground hover:text-foreground')}
        >
          <FolderPlus size={15} strokeWidth={1.6} /> Añadir carpeta
        </button>
      </footer>
    </aside>
  )
}
