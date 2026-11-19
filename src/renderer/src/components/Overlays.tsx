import { useEffect, useRef } from 'react'
import { Bot, FolderPlus, SquareTerminal } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@renderer/components/ui/command'
import { cn } from '@renderer/lib/utils'
import { SessionIcon } from './SessionIcon'
import { closeOverlay } from '@renderer/overlays'
import { keysOf, SHORTCUTS, shortcutKeys } from '@renderer/shortcuts'
import {
  addFolder,
  currentFolder,
  newSession,
  selectSession,
  sidebarOrder,
  useStore
} from '@renderer/store'

// Cierra la capa y ejecuta la acción en el acto, sin esperar a que termine la animación.
const pick = (action: () => void) => () => {
  closeOverlay()
  action()
}

const folderName = (path: string | undefined): string =>
  path?.split(/[\\/]/).filter(Boolean).pop() ?? ''

// Nueva shell y un agente por cada uno instalado, en la carpeta actual. Lo usan la paleta y el menú.
function NewSessionGroup({
  folder,
  withKeys
}: {
  folder: string
  withKeys?: boolean
}): React.JSX.Element {
  const agents = useStore((s) => s.agents.filter((a) => a.installed))
  return (
    <CommandGroup heading={`Nueva sesión en ${folderName(folder)}`}>
      <CommandItem value="nueva shell" onSelect={pick(() => newSession(folder))}>
        <SquareTerminal /> Nueva shell
        {withKeys && <CommandShortcut>{shortcutKeys('new-shell')}</CommandShortcut>}
      </CommandItem>
      {agents.map((a) => (
        <CommandItem
          key={a.id}
          value={`nueva sesión ${a.name}`}
          onSelect={pick(() => newSession(folder, a.id))}
        >
          <Bot /> {a.name}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

const AddFolderItem = (): React.JSX.Element => (
  <CommandItem value="añadir carpeta" onSelect={pick(addFolder)}>
    <FolderPlus /> Añadir carpeta
  </CommandItem>
)

// Las destructivas, al final y en rojo (design.md §4).
const paletteActions = SHORTCUTS.filter((s) => s.inPalette !== false).sort(
  (a, b) => Number(!!a.danger) - Number(!!b.danger)
)

function Palette(): React.JSX.Element {
  const sessions = useStore(sidebarOrder)
  const projects = useStore((s) => s.projects)
  const folder = useStore(currentFolder)

  return (
    <Command
      onKeyDown={(e) => e.key === 'Escape' && closeOverlay()}
      className="bg-transparent [&_[cmdk-group-heading]]:text-[12px]"
    >
      <CommandInput autoFocus placeholder="Busca una sesión, carpeta o acción…" />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>Nada coincide.</CommandEmpty>
        {sessions.length > 0 && (
          <CommandGroup heading="Sesiones">
            {sessions.map((s) => (
              <CommandItem
                key={s.id}
                value={`sesión ${s.title} ${folderName(s.cwd)} ${s.id}`}
                onSelect={pick(() => selectSession(s.id))}
              >
                <SessionIcon kind={s.kind} />
                {s.title}
                <span className="ml-auto text-[12px] text-muted-foreground">
                  {folderName(s.cwd)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {folder && <NewSessionGroup folder={folder} withKeys />}
        {/* Con una sola carpeta, el grupo de nueva sesión ya la cubre. */}
        {projects.length > 1 && (
          <CommandGroup heading="Carpetas">
            {projects.map((p) => (
              <CommandItem
                key={p.path}
                value={`carpeta ${p.name} ${p.path}`}
                onSelect={pick(() => newSession(p.path))}
              >
                <SquareTerminal /> Nueva shell en {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Acciones">
          <AddFolderItem />
          {paletteActions.map((a) => (
            <CommandItem
              key={a.id}
              value={a.label}
              onSelect={pick(a.run)}
              className={cn(a.danger && 'text-destructive data-[selected=true]:text-destructive')}
            >
              {a.icon && <a.icon className={cn(a.danger && 'text-destructive')} />}
              {a.label}
              <CommandShortcut>{keysOf(a)}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

// El menú que sale del botón "Nueva sesión" del pie de la barra lateral.
function NewSessionMenu(): React.JSX.Element {
  const folder = useStore(currentFolder)
  const root = useRef<HTMLDivElement>(null)
  // Sin campo de búsqueda: el foco va a la lista para moverse con flechas y elegir con Enter.
  useEffect(() => root.current?.focus(), [])

  return (
    <Command
      ref={root}
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && closeOverlay()}
      className="bg-transparent outline-none [&_[cmdk-group-heading]]:text-[12px]"
    >
      <CommandList>
        {folder ? (
          <NewSessionGroup folder={folder} />
        ) : (
          <p className="px-3 py-2 text-[12px] text-muted-foreground">
            Añade una carpeta para abrir shells y agentes en ella.
          </p>
        )}
        <CommandSeparator />
        <CommandGroup>
          <AddFolderItem />
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

// Capa flotante: fondo atenuado que cierra al hacer clic y el panel que Blendy anima desde su botón.
// El panel se centra con márgenes automáticos y no con transform: Blendy usa el transform para animar.
export function Overlays(): React.JSX.Element | null {
  const overlay = useStore((s) => s.overlay)
  if (!overlay) return null
  const panel =
    overlay === 'palette'
      ? 'inset-x-0 top-[12vh] mx-auto w-[min(560px,calc(100vw-32px))] rounded-xl'
      : 'bottom-12 left-2 w-60 rounded-lg'

  return (
    <>
      <div
        className="fixed inset-0 z-40 animate-in bg-black/30 duration-150 fade-in-0"
        onMouseDown={() => closeOverlay()}
      />
      <div
        data-blendy-to={overlay}
        className={`fixed z-50 overflow-hidden border border-border bg-popover shadow-2xl ${panel}`}
      >
        <div>{overlay === 'palette' ? <Palette /> : <NewSessionMenu />}</div>
      </div>
    </>
  )
}
