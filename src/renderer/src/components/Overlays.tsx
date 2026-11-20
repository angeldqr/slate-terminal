import { useEffect, useRef, useState } from 'react'
import {
  CaretRightIcon,
  CheckIcon,
  CircleHalfIcon,
  FolderSimplePlusIcon,
  PaperPlaneTiltIcon,
  TerminalWindowIcon
} from '@phosphor-icons/react'
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
import { Keys } from './Keys'
import { Kbd } from '@renderer/components/ui/kbd'
import { Settings } from './Settings'
import { TaskComposer } from './TaskComposer'
import { setTheme, THEMES } from '@renderer/theme'
import { PALETTES } from '../../../shared/palettes'
import { closeOverlay, openTask } from '@renderer/overlays'
import { keysOf, SHORTCUTS, shortcutKeys, useShortcutsRev } from '@renderer/shortcuts'
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
        <TerminalWindowIcon /> Nueva shell
        {withKeys && (
          <CommandShortcut>
            <Keys combo={shortcutKeys('new-shell')} />
          </CommandShortcut>
        )}
      </CommandItem>
      {agents.map((a) => (
        <CommandItem
          key={a.id}
          value={`nueva sesión ${a.name}`}
          onSelect={pick(() => newSession(folder, a.id))}
        >
          <SessionIcon kind={a.id} /> {a.name}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

// Abre el submenú de temas; Retroceso (con el campo vacío) o Escape vuelven a la lista.
function ThemeItem({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const theme = useStore((s) => s.prefs.theme)
  return (
    <CommandItem value="cambiar tema claro oscuro automático" onSelect={onOpen}>
      <CircleHalfIcon /> Cambiar tema
      <span className="ml-auto flex items-center gap-1 text-[12px] text-muted-foreground">
        {THEMES.find((t) => t.id === theme)?.label}
        <CaretRightIcon size={12} />
      </span>
    </CommandItem>
  )
}

// El submenú: el modo y el tema gris de cada modo. Se queda abierto para ver el cambio y seguir.
function ThemePage(): React.JSX.Element {
  const theme = useStore((s) => s.prefs.theme)
  const darkPalette = useStore((s) => s.prefs.darkPalette)
  const lightPalette = useStore((s) => s.prefs.lightPalette)
  const mark = (on: boolean): React.JSX.Element | null =>
    on ? <CheckIcon className="ml-auto" /> : null
  return (
    <>
      <CommandGroup heading="Modo">
        {THEMES.map((t) => (
          <CommandItem key={t.id} value={`modo ${t.label}`} onSelect={() => setTheme(t.id)}>
            {t.label}
            {mark(theme === t.id)}
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandGroup heading="Tema oscuro">
        {PALETTES.filter((p) => p.dark).map((p) => (
          <CommandItem
            key={p.id}
            value={`oscuro ${p.label}`}
            onSelect={() => setTheme({ darkPalette: p.id })}
          >
            {p.label}
            {mark(darkPalette === p.id)}
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandGroup heading="Tema claro">
        {PALETTES.filter((p) => !p.dark).map((p) => (
          <CommandItem
            key={p.id}
            value={`claro ${p.label}`}
            onSelect={() => setTheme({ lightPalette: p.id })}
          >
            {p.label}
            {mark(lightPalette === p.id)}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  )
}

const AddFolderItem = (): React.JSX.Element => (
  <CommandItem value="añadir carpeta" onSelect={pick(addFolder)}>
    <FolderSimplePlusIcon /> Añadir carpeta
  </CommandItem>
)

// Las destructivas, al final y en rojo (design.md §4).
const paletteActions = SHORTCUTS.filter((s) => s.inPalette !== false).sort(
  (a, b) => Number(!!a.danger) - Number(!!b.danger)
)

function Palette(): React.JSX.Element {
  useShortcutsRev()
  const sessions = useStore(sidebarOrder)
  const projects = useStore((s) => s.projects)
  const folder = useStore(currentFolder)
  // Páginas de la paleta: la lista y el submenú de temas. Retroceso con el campo vacío vuelve.
  const [page, setPage] = useState<'root' | 'theme'>('root')
  const [search, setSearch] = useState('')
  const go = (next: 'root' | 'theme'): void => {
    setPage(next)
    setSearch('')
  }

  return (
    <Command
      onKeyDown={(e) => {
        if (e.key === 'Escape') return page === 'root' ? closeOverlay() : go('root')
        if (e.key === 'Backspace' && page !== 'root' && !search) {
          e.preventDefault()
          go('root')
        }
      }}
      className="bg-transparent [&_[cmdk-group-heading]]:text-[12px]"
    >
      <CommandInput
        autoFocus
        value={search}
        onValueChange={setSearch}
        placeholder={page === 'theme' ? 'Tema…' : 'Busca una sesión, carpeta o acción…'}
      />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>Nada coincide.</CommandEmpty>
        {page === 'theme' ? (
          <ThemePage />
        ) : (
          <>
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
                    <TerminalWindowIcon /> Nueva shell en {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup heading="Acciones">
              <AddFolderItem />
              <ThemeItem onOpen={() => go('theme')} />
              {paletteActions.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.label}
                  onSelect={pick(a.run)}
                  className={cn(
                    a.danger && 'text-destructive data-[selected=true]:text-destructive'
                  )}
                >
                  {a.icon && <a.icon className={cn(a.danger && 'text-destructive')} />}
                  {a.label}
                  <CommandShortcut>
                    <Keys combo={keysOf(a)} />
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      {/* Pie con las teclas que mueven la paleta. */}
      <footer className="flex h-8 items-center gap-4 border-t border-border px-3 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navegar
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> elegir
        </span>
        {page !== 'root' && (
          <span className="flex items-center gap-1.5">
            <Kbd>⌫</Kbd> volver
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>Esc</Kbd> {page === 'root' ? 'cerrar' : 'volver'}
        </span>
      </footer>
    </Command>
  )
}

// El menú que sale del botón "Nueva sesión" del pie de la barra lateral.
function NewSessionMenu(): React.JSX.Element {
  useShortcutsRev()
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
          {folder && (
            <CommandItem value="nueva tarea" onSelect={openTask}>
              <PaperPlaneTiltIcon /> Nueva tarea…
              <CommandShortcut>
                <Keys combo={shortcutKeys('task')} />
              </CommandShortcut>
            </CommandItem>
          )}
          <AddFolderItem />
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

const CONTENT = {
  palette: Palette,
  'new-session': NewSessionMenu,
  settings: Settings,
  task: TaskComposer
}
const PANELS = {
  palette: 'inset-x-0 top-[12vh] mx-auto w-[min(560px,calc(100vw-32px))] rounded-xl',
  'new-session': 'bottom-12 left-2 w-60 rounded-lg',
  task: 'inset-x-0 top-[14vh] mx-auto w-[min(640px,calc(100vw-32px))] rounded-xl',
  settings:
    'inset-0 m-auto h-[min(580px,calc(100vh-64px))] w-[min(820px,calc(100vw-48px))] rounded-xl'
}

// Capa flotante: fondo atenuado que cierra al hacer clic y el panel que Blendy anima desde su botón.
// El panel se centra con márgenes automáticos y no con transform: Blendy usa el transform para animar.
export function Overlays(): React.JSX.Element | null {
  const overlay = useStore((s) => s.overlay)
  if (!overlay) return null
  const Content = CONTENT[overlay]

  return (
    <>
      <div
        className="fixed inset-0 z-40 animate-in bg-black/30 duration-150 fade-in-0"
        onMouseDown={() => closeOverlay()}
      />
      <div
        data-blendy-to={overlay}
        className={`fixed z-50 overflow-hidden glass ${PANELS[overlay]}`}
      >
        <div className="h-full">
          <Content />
        </div>
      </div>
    </>
  )
}
