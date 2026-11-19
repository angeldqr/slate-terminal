import { use } from 'react'
import { FolderPlus, SquareTerminal } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { TerminalPane } from './components/TerminalPane'
import { addFolder, init, newSession, useStore } from './store'

// Si algo falla al cargar, Slate abre igual con la barra lateral vacía en vez de en blanco.
const loading = init().catch((err) => console.error('Slate no pudo cargar sus datos:', err))

// Lo que se ve cuando no hay nada abierto: siempre con una acción clara.
function Empty(): React.JSX.Element {
  const firstProject = useStore((s) => s.projects[0])
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-xs text-center">
        <p className="text-[15px] font-semibold">
          {firstProject ? 'No hay ninguna sesión abierta' : 'Empieza por una carpeta'}
        </p>
        <p className="mt-1.5 text-muted-foreground">
          {firstProject
            ? `Abre una shell en ${firstProject.name} o elige un agente con el + de la carpeta.`
            : 'Slate agrupa tus shells y agentes por proyecto.'}
        </p>
        <button
          onClick={() => (firstProject ? newSession(firstProject.path) : addFolder())}
          className="mt-5 inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 transition-colors duration-100 hover:bg-accent"
        >
          {firstProject ? (
            <SquareTerminal size={15} strokeWidth={1.6} />
          ) : (
            <FolderPlus size={15} strokeWidth={1.6} />
          )}
          {firstProject ? 'Nueva shell' : 'Añadir carpeta'}
        </button>
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  use(loading)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const sidebar = useStore((s) => s.sidebar)

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {sidebar && <Sidebar />}
        <main
          className={`${sidebar ? '' : 'ml-2 '}mr-2 mb-2 min-w-0 flex-1 overflow-hidden rounded-lg bg-background p-2 shadow-[0_0_0_1px_var(--border)]`}
        >
          {sessions.map((s) => (
            <TerminalPane key={s.id} sessionId={s.id} active={s.id === activeId} />
          ))}
          {!sessions.length && <Empty />}
        </main>
      </div>
    </div>
  )
}

export default App
