import { useEffect, useState } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { CaretDownIcon, CheckIcon, FolderSimpleIcon, GitBranchIcon } from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import { reducedMotion } from '@renderer/motion'
import { closeOverlay } from '@renderer/overlays'
import { baseName, currentFolder, launchTask, setPrefs, useStore } from '@renderer/store'
import type { SessionKind } from '../../../shared/types'
import { SessionIcon } from './SessionIcon'
import { GlowingEffect } from './ui/glowing-effect'
import { PlaceholdersAndVanishInput } from './ui/placeholders-and-vanish-input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

// Ejemplos que rotan en el campo: tareas reales de un proyecto, para sugerir el tamaño adecuado.
const EXAMPLES = [
  'Añade pruebas para el lector de atajos',
  'Arregla el error al cerrar la última sesión',
  'Busca código muerto y bórralo',
  'Reescribe el README con capturas nuevas',
  'Revisa los mensajes de error y hazlos más claros'
]

// Más de cuatro sesiones lado a lado ya no se leen: es el tope de una tarea.
const MAX = 4

// Dónde trabaja cada agente: en la carpeta tal cual o en una rama propia para cada uno.
const PLACES = [
  { isolate: false, label: 'Checkout actual', Icon: FolderSimpleIcon },
  { isolate: true, label: 'Rama aislada', Icon: GitBranchIcon }
]

// Nueva tarea: una tarea para uno o varios agentes. Con varios, cada uno trabaja en su rama
// y se abren juntos en una vista dividida para comparar lo que hace cada uno.
export function TaskComposer(): React.JSX.Element {
  const folder = useStore(currentFolder)
  // Los agentes instalados y, al final, una shell: una rama aislada para trabajar a mano.
  const options = useStore((s) => [
    ...s.agents.filter((a) => a.installed).map((a) => ({ id: a.id as SessionKind, name: a.name })),
    { id: 'shell' as SessionKind, name: 'Shell' }
  ])
  const noAgents = options.length === 1
  const saved = useStore((s) => s.prefs.taskAgents)
  const isolatePref = useStore((s) => s.prefs.taskIsolate)
  const [branch, setBranch] = useState<string | null | undefined>(undefined) // undefined: mirando

  useEffect(() => {
    if (!folder) return
    let current = true // la respuesta de una carpeta anterior no pisa la de la actual
    window.slate.git
      .branch(folder)
      .catch(() => null)
      .then((b) => current && setBranch(b))
    return () => void (current = false)
  }, [folder])

  // Lo elegido la última vez, si sigue instalado. Un agente puede ir repetido (varias copias,
  // cada una en su rama). Puede quedar vacío: entonces no se lanza nada.
  const selected = saved.filter((id) => options.some((o) => o.id === id)).slice(0, MAX)
  const copies = (id: SessionKind): number => selected.filter((x) => x === id).length
  const full = selected.length >= MAX
  // Mientras main responde (undefined) cuenta como repo: solo un "no es repo" confirmado
  // desactiva el aislamiento, así una tarea lanzada al instante no sale sin su rama.
  const isRepo = branch !== null
  // Varios agentes en la misma carpeta se pisarían: con dos o más, cada uno va a su rama.
  const forced = isRepo && selected.length > 1
  const isolate = isRepo && (forced || isolatePref)

  // Guarda la selección en el orden de los chips, con `n` copias de `id`.
  const choose = (id: SessionKind, n: number): void =>
    setPrefs({
      taskAgents: [...selected.filter((x) => x !== id), ...Array(n).fill(id)].sort(
        (a, b) => options.findIndex((x) => x.id === a) - options.findIndex((x) => x.id === b)
      )
    })
  const toggle = (id: SessionKind): void => {
    if (copies(id)) choose(id, 0)
    else if (!full) choose(id, 1)
  }
  // ×1 → ×2 → ×3 → ×1, sin pasar del tope de la tarea.
  const more = (id: SessionKind): void => {
    const n = copies(id)
    choose(id, n < 3 && !full ? n + 1 : 1)
  }

  if (!folder) {
    return (
      <p className="p-6 text-muted-foreground">
        Añade una carpeta para darle tareas a tus agentes.
      </p>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        onKeyDown={(e) =>
          e.key === 'Escape' && e.currentTarget.contains(e.target as Node) && closeOverlay()
        }
        className="p-6"
      >
        <h2 className="text-[20px] font-semibold tracking-tight">
          ¿Qué hacemos en {baseName(folder)}?
        </h2>
        <p className="mt-1 text-muted-foreground">
          {selected.length > 1
            ? 'Cada agente la hace en su propia rama; luego comparas y te quedas con la mejor.'
            : selected.length === 1
              ? 'Elige uno o varios agentes, o varias copias del mismo. Cada uno trabaja en su rama.'
              : 'Elige al menos un agente para lanzar la tarea.'}
        </p>

        <div className="relative mt-5 rounded-lg border border-border bg-background/60">
          <GlowingEffect
            disabled={reducedMotion()}
            variant="white"
            proximity={64}
            spread={40}
            inactiveZone={0.01}
            borderWidth={1}
          />
          <div className="relative">
            <PlaceholdersAndVanishInput
              placeholders={EXAMPLES}
              disabled={!selected.length}
              onSubmit={(prompt) => launchTask(folder, prompt, selected, isolate)}
              onVanished={() => closeOverlay()}
            />
            <div
              role="group"
              aria-label="Agentes"
              className="flex flex-wrap gap-1.5 border-t border-border px-2 py-2"
            >
              {noAgents && (
                <p className="px-2 py-1 text-[12px] text-muted-foreground">
                  No encontré agentes instalados (Claude Code, Codex, Gemini CLI…).
                </p>
              )}
              {options.map((a) => {
                const n = copies(a.id)
                return (
                  <div
                    key={a.id}
                    className={cn(
                      'flex items-center rounded-sm transition-colors duration-120',
                      n > 0 && 'bg-accent ring-1 ring-muted-foreground/30'
                    )}
                  >
                    <motion.button
                      type="button"
                      aria-pressed={n > 0}
                      disabled={!n && full}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggle(a.id)}
                      className={cn(
                        'flex h-7 items-center gap-1.5 rounded-sm px-2 text-[12px] transition-colors duration-120 disabled:opacity-40',
                        n > 0
                          ? 'text-foreground'
                          : 'text-muted-foreground enabled:hover:bg-accent/50 enabled:hover:text-foreground'
                      )}
                    >
                      <SessionIcon kind={a.id} size={14} />
                      {a.name}
                    </motion.button>
                    {/* Cuántas copias lanzar: cada una en su rama, para quedarse con la mejor. */}
                    {n > 0 && (
                      <button
                        type="button"
                        onClick={() => more(a.id)}
                        aria-label={`Copias de ${a.name}: ${n}`}
                        title="Cuántas veces lanzarlo; cada copia trabaja en su rama"
                        className="h-7 rounded-sm pr-2 pl-0.5 font-mono text-[12px] text-muted-foreground tabular-nums transition-colors duration-120 hover:text-foreground"
                      >
                        ×{n}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={!isRepo || forced}
              className="flex h-7 items-center gap-1.5 rounded-sm px-2 transition-colors duration-120 hover:bg-accent/50 hover:text-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              {(() => {
                const place = PLACES[Number(isolate)]
                return (
                  <>
                    <place.Icon size={14} />
                    {place.label}
                    {isRepo && !forced && <CaretDownIcon size={12} />}
                  </>
                )
              })()}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {PLACES.map((p) => (
                <DropdownMenuItem
                  key={p.label}
                  onSelect={() => setPrefs({ taskIsolate: p.isolate })}
                >
                  <p.Icon /> {p.label}
                  {p.isolate === isolate && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex items-center gap-1.5 px-2">
            {branch === undefined ? null : isRepo ? (
              <>
                <GitBranchIcon size={14} />
                {isolate ? `desde ${branch}` : branch}
              </>
            ) : (
              'Sin git: los agentes comparten la carpeta'
            )}
          </span>
        </div>
      </div>
    </MotionConfig>
  )
}
