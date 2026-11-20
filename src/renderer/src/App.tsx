import { use, useEffect, useLayoutEffect } from 'react'
import { FolderSimplePlusIcon, PaperPlaneTiltIcon, TerminalWindowIcon } from '@phosphor-icons/react'
import { cn } from './lib/utils'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Views } from './components/Views'
import { Overlays } from './components/Overlays'
import { ChangesPanel } from './components/ChangesPanel'
import { Keys } from './components/Keys'
import { DottedGlowBackground } from './components/ui/dotted-glow-background'
import { initMotion, reducedMotion } from './motion'
import { openTask } from './overlays'
import { installShortcuts, shortcutKeys } from './shortcuts'
import { addFolder, init, newSession, useStore } from './store'
import { applyTheme, watchSystemTheme } from './theme'

// Si algo falla al cargar, Slate abre igual con la barra lateral vacía en vez de en blanco.
const loading = init().catch((err) => console.error('Slate no pudo cargar sus datos:', err))

// Lo que se ve cuando no hay nada abierto: una pizarra que espera, con una sola acción clara.
function Empty(): React.JSX.Element {
  const firstProject = useStore((s) => s.projects[0])
  const primary = firstProject
    ? { label: 'Nueva shell', Icon: TerminalWindowIcon, run: () => newSession(firstProject.path) }
    : { label: 'Añadir carpeta', Icon: FolderSimplePlusIcon, run: addFolder }

  return (
    <div className="relative grid h-full place-items-center overflow-hidden">
      {!reducedMotion() && (
        <DottedGlowBackground
          className="pointer-events-none [mask-image:radial-gradient(ellipse_55%_50%_at_50%_45%,black,transparent)]"
          gap={16}
          radius={1}
          colorDarkVar="--foreground"
          colorLightVar="--foreground"
          glowColorDarkVar="--foreground"
          glowColorLightVar="--foreground"
          opacity={0.3}
          speedScale={0.35}
        />
      )}
      <div className="relative max-w-sm px-6 text-center">
        <h1 className="text-[20px] font-semibold tracking-tight">
          {firstProject ? `Todo listo en ${firstProject.name}` : 'Empieza por una carpeta'}
        </h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          {firstProject
            ? 'Abre una shell o dale una tarea a uno o varios agentes. Slate te avisa cuando alguno te necesite.'
            : 'Slate agrupa tus shells y agentes por proyecto y te avisa cuando alguno te necesita.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={primary.run}
            className="inline-flex h-9 items-center gap-2 rounded-sm bg-foreground px-4 font-semibold text-background transition-colors duration-120 hover:bg-foreground/85"
          >
            <primary.Icon size={16} weight="regular" />
            {primary.label}
          </button>
          {firstProject && (
            <button
              onClick={openTask}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-border px-4 text-muted-foreground transition-colors duration-120 hover:border-muted-foreground/40 hover:text-foreground"
            >
              <PaperPlaneTiltIcon size={16} />
              Nueva tarea
            </button>
          )}
        </div>
        <p className="mt-8 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <Keys combo={shortcutKeys('palette')} /> para buscar cualquier acción
        </p>
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  use(loading)
  const hasSessions = useStore((s) => s.sessions.length > 0)
  const sidebar = useStore((s) => s.sidebar)
  const pinnedBar = useStore((s) => s.prefs.pinTopBar)

  // Main ya pintó con el tema guardado; aquí se confirma con las preferencias y se sigue al sistema.
  useLayoutEffect(() => {
    applyTheme()
    return watchSystemTheme()
  }, [])

  // Tras el primer render: los botones de origen de Blendy ya existen.
  useEffect(() => {
    initMotion()
    return installShortcuts()
  }, [])

  return (
    <div className="relative h-full">
      <TitleBar />
      {/* Arriba, 8 px de marco para la franja de la barra escondida, o la barra entera si está fija. */}
      <div
        className={cn(
          'flex h-full transition-[padding] duration-200 ease-out-quint',
          pinnedBar ? 'pt-9' : 'pt-2'
        )}
      >
        <Sidebar />
        <main
          className={cn(
            'mr-2 mb-2 min-w-0 flex-1 overflow-hidden rounded-lg bg-background shadow-[var(--elevation-card)] transition-[margin] duration-200 ease-out-quint',
            !sidebar && 'ml-2'
          )}
        >
          {/* El panel de cambios comparte la tarjeta: el terminal cede su ancho al abrirlo. */}
          <div className="flex h-full">
            <div className="relative min-w-0 flex-1">{hasSessions ? <Views /> : <Empty />}</div>
            <ChangesPanel />
          </div>
        </main>
      </div>
      <Overlays />
    </div>
  )
}

export default App
