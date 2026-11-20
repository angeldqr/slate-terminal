import { use, useEffect, useLayoutEffect } from 'react'
import { FolderSimplePlusIcon, PaperPlaneTiltIcon, TerminalWindowIcon } from '@phosphor-icons/react'
import { cn } from './lib/utils'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Views } from './components/Views'
import { Overlays } from './components/Overlays'
import { ChangesPanel } from './components/ChangesPanel'
import { Board } from './components/Board'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { Keys } from './components/Keys'
import { DottedGlowBackground } from './components/ui/dotted-glow-background'
import { Empty as EmptyState } from './components/ui/empty'
import { initMotion, useReduceMotion } from './motion'
import { openTask } from './overlays'
import { installShortcuts, shortcutKeys, useShortcutsRev } from './shortcuts'
import { addFolder, init, needsYou, newSession, useStore } from './store'
import { applyLook, applyTheme, watchSystemTheme } from './theme'
import { Toaster } from '@renderer/components/ui/sonner'

// Si algo falla al cargar, Slate abre igual con la barra lateral vacía en vez de en blanco.
const loading = init().catch((err) => console.error('Slate no pudo cargar sus datos:', err))

// Lo que se ve cuando no hay nada abierto: una pizarra que espera, con una sola acción clara.
function Empty(): React.JSX.Element {
  useShortcutsRev()
  const firstProject = useStore((s) => s.projects[0])
  const reduce = useReduceMotion()
  const primary = firstProject
    ? { label: 'Nueva shell', Icon: TerminalWindowIcon, run: () => newSession(firstProject.path) }
    : { label: 'Añadir carpeta', Icon: FolderSimplePlusIcon, run: addFolder }

  return (
    <div className="relative grid h-full place-items-center overflow-hidden">
      {!reduce && (
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
      <EmptyState
        title={firstProject ? `Todo listo en ${firstProject.name}` : 'Empieza por una carpeta'}
        text={
          firstProject
            ? 'Abre una shell o dale una tarea a uno o varios agentes. Slate te avisa cuando alguno te necesite.'
            : 'Slate agrupa tus shells y agentes por proyecto y te avisa cuando alguno te necesita.'
        }
      >
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
      </EmptyState>
    </div>
  )
}

function App(): React.JSX.Element {
  use(loading)
  const hasSessions = useStore((s) => s.sessions.length > 0)
  const sidebar = useStore((s) => s.sidebar)
  const pinnedBar = useStore((s) => s.prefs.pinTopBar)
  const uiScale = useStore((s) => s.prefs.uiScale)
  const board = useStore((s) => s.board)
  const reduce = useReduceMotion()
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-reduce-motion', reduce)
  }, [reduce])

  // Tamaño de toda la interfaz; el terminal compensa para conservar su propio tamaño de letra.
  useEffect(() => window.slate.app.setZoom(uiScale / 100), [uiScale])

  const contrast = useStore((s) => s.prefs.contrast)
  const solid = useStore((s) => s.prefs.solid)
  const panelMs = useStore((s) => s.prefs.panelMs)
  useEffect(() => applyLook({ contrast, solid, panelMs }), [contrast, solid, panelMs])

  // Con la ventana oculta los bucles de animación se detienen (styles.css).
  useEffect(() => {
    const sync = (): void =>
      void document.documentElement.toggleAttribute(
        'data-hidden',
        document.visibilityState === 'hidden'
      )
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  // Cuántas sesiones te necesitan, también en el icono de la barra de tareas.
  const waiting = useStore((s) => s.sessions.filter((x) => needsYou(x.status)).length)
  useEffect(() => {
    if (!waiting) return window.slate.app.badge(null, '')
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')
    if (!g) return
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--attention')
    g.beginPath()
    g.arc(16, 16, 15, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#000000'
    g.font = '700 20px sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(waiting > 9 ? '9+' : String(waiting), 16, 17)
    window.slate.app.badge(c.toDataURL('image/png'), `${waiting} te necesitan`)
  }, [waiting])

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
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'} skipAnimations={reduce}>
      <div className="relative h-full">
        <TitleBar />
        {/* Arriba, 8 px de marco para la franja de la barra escondida, o la barra entera si está fija. */}
        <div className={cn('flex h-full', pinnedBar ? 'pt-9' : 'pt-2')}>
          <Sidebar />
          <main
            className={cn(
              'mr-2 mb-2 min-w-0 flex-1 overflow-hidden rounded-lg bg-background shadow-[var(--elevation-card)]',
              !sidebar && 'ml-2'
            )}
          >
            <div className="relative flex h-full">
              <div className="relative min-w-0 flex-1">
                {hasSessions ? <Views /> : <Empty />}
                {/* Encima de las vistas, sin desmontarlas: los terminales siguen vivos debajo. */}
                <AnimatePresence>{board && <Board />}</AnimatePresence>
              </div>
              <ChangesPanel />
            </div>
          </main>
        </div>
        <Overlays />
        <Toaster />
      </div>
    </MotionConfig>
  )
}

export default App
