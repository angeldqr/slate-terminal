import { useEffect, useId, useRef, useState } from 'react'
import { LayoutGroup, MotionConfig, motion } from 'motion/react'
import {
  ArrowCounterClockwiseIcon,
  BellSimpleIcon,
  KeyboardIcon,
  PaintBrushBroadIcon,
  TerminalWindowIcon,
  XIcon,
  type Icon
} from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import { reducedMotion } from '@renderer/motion'
import { closeOverlay } from '@renderer/overlays'
import { DEFAULT_PREFS, FONTS, fontStack, type CursorStyle, type Prefs } from '@renderer/prefs'
import { keysOf, SHORTCUTS } from '@renderer/shortcuts'
import { setPrefs, testNotification, useStore } from '@renderer/store'
import { applyTheme, setTheme, THEMES } from '@renderer/theme'
import { GlowingEffect } from './ui/glowing-effect'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Keys } from './Keys'

type SectionId = 'appearance' | 'terminal' | 'notifications' | 'shortcuts'
const SECTIONS: { id: SectionId; label: string; icon: Icon; description: string }[] = [
  {
    id: 'appearance',
    label: 'Apariencia',
    icon: PaintBrushBroadIcon,
    description: 'El tema y la barra superior.'
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: TerminalWindowIcon,
    description: 'Texto, cursor y lo que guarda cada sesión.'
  },
  {
    id: 'notifications',
    label: 'Avisos',
    icon: BellSimpleIcon,
    description: 'Cómo te enteras de un agente mientras haces otra cosa.'
  },
  {
    id: 'shortcuts',
    label: 'Atajos',
    icon: KeyboardIcon,
    description: 'Todo lo que se hace con el teclado.'
  }
]

// Al volver a abrir Ajustes se sigue donde se dejó.
let lastSection: SectionId = 'appearance'
const remember = (id: SectionId): void => void (lastSection = id)
const spring = { type: 'spring', bounce: 0.15, duration: 0.35 } as const

// Tarjeta de filas. El borde se ilumina en tiza hacia donde está el puntero (Aceternity).
function Group({
  title,
  children
}: {
  title?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mt-6">
      {title && (
        <h3 className="mb-2 px-1 text-[12px] font-medium text-muted-foreground">{title}</h3>
      )}
      <div className="relative rounded-lg border border-border bg-background/50">
        <GlowingEffect
          disabled={reducedMotion()}
          variant="white"
          proximity={64}
          spread={40}
          inactiveZone={0.01}
          borderWidth={1}
        />
        <div className="relative divide-y divide-border">{children}</div>
      </div>
    </section>
  )
}

function Row({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-13 items-center gap-6 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p>{label}</p>
        {description && <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// Opciones excluyentes con una pastilla que se desliza a la elegida.
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
}): React.JSX.Element {
  const group = useId() // cada grupo desliza su propia pastilla
  return (
    <LayoutGroup id={group}>
      <div role="radiogroup" aria-label={label} className="flex rounded-md bg-accent/60 p-0.5">
        {options.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'relative h-7 rounded-sm px-3 text-[12px] transition-colors duration-120',
              value === o.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {value === o.id && (
              <motion.span
                layoutId="pill"
                transition={spring}
                className="absolute inset-0 rounded-sm bg-background shadow-sm ring-1 ring-border"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

function Range({
  value,
  min,
  max,
  step,
  format,
  label,
  onChange
}: {
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  label: string
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <div className="flex w-56 items-center gap-3">
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
      <span className="w-12 text-right font-mono text-[12px] text-muted-foreground tabular-nums">
        {format(value)}
      </span>
    </div>
  )
}

// Ventana en miniatura con los colores de cada tema (copia de los tokens de styles.css).
function ThemePreview({ dark }: { dark: boolean }): React.JSX.Element {
  const c = dark
    ? { frame: '#151719', card: '#0c0d0e', line: '#24272a', ink: '#edeeef' }
    : { frame: '#f0f1f2', card: '#fafafa', line: '#dcdee0', ink: '#121314' }
  return (
    <div className="absolute inset-0 flex gap-1.5 p-2" style={{ background: c.frame }}>
      <div className="flex w-1/4 flex-col gap-1.5 pt-1">
        {[1, 0.6, 0.6].map((o, i) => (
          <span key={i} className="h-1 rounded-full" style={{ background: c.line, opacity: o }} />
        ))}
      </div>
      <div
        className="flex-1 space-y-1.5 rounded-[4px] p-2"
        style={{ background: c.card, boxShadow: `0 0 0 1px ${c.line}` }}
      >
        <span className="block h-1 w-2/3 rounded-full" style={{ background: c.ink }} />
        <span className="block h-1 w-1/2 rounded-full" style={{ background: c.line }} />
        <span className="block h-1 w-3/4 rounded-full" style={{ background: c.line }} />
      </div>
    </div>
  )
}

function ThemePicker(): React.JSX.Element {
  const theme = useStore((s) => s.prefs.theme)
  return (
    <LayoutGroup id="theme">
      <div role="radiogroup" aria-label="Tema" className="mt-3 grid grid-cols-3 gap-4">
        {THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={theme === t.id}
            // El tema nuevo se revela en un círculo que nace del clic.
            onClick={(e) => setTheme(t.id, { x: e.clientX, y: e.clientY })}
            className="group text-left outline-none"
          >
            <div className="relative">
              <div className="relative aspect-[16/10] overflow-hidden rounded-md ring-1 ring-border transition-transform duration-200 ease-out-quint group-hover:-translate-y-0.5">
                {t.id === 'auto' ? (
                  <>
                    <ThemePreview dark />
                    <div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]">
                      <ThemePreview dark={false} />
                    </div>
                  </>
                ) : (
                  <ThemePreview dark={t.id === 'dark'} />
                )}
              </div>
              {theme === t.id && (
                <motion.span
                  layoutId="ring"
                  transition={spring}
                  className="pointer-events-none absolute -inset-[4px] rounded-xl border-[1.5px] border-foreground"
                />
              )}
            </div>
            <p
              className={cn(
                'mt-2.5 px-0.5 text-[12px] transition-colors duration-120',
                theme === t.id
                  ? 'text-foreground'
                  : 'text-muted-foreground group-hover:text-foreground'
              )}
            >
              {t.label}
            </p>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

const CURSORS: { id: CursorStyle; label: string }[] = [
  { id: 'bar', label: 'Barra' },
  { id: 'block', label: 'Bloque' },
  { id: 'underline', label: 'Subrayado' }
]
const SCROLLBACK = [1000, 5000, 10000, 50000]

// Escribe en `prefs` una clave concreta: así cada control se conecta en una línea.
const setPref =
  <K extends keyof Prefs>(key: K) =>
  (value: Prefs[K]): void =>
    setPrefs({ [key]: value } as Partial<Prefs>)

function Appearance(): React.JSX.Element {
  const pinTopBar = useStore((s) => s.prefs.pinTopBar)
  return (
    <>
      <h3 className="mt-6 px-1 text-[12px] font-medium text-muted-foreground">Tema</h3>
      <ThemePicker />
      <Group title="Ventana">
        <Row
          label="Barra superior fija"
          description="Siempre a la vista, en vez de aparecer al acercar el puntero."
        >
          <Switch
            aria-label="Barra superior fija"
            checked={pinTopBar}
            onCheckedChange={setPref('pinTopBar')}
          />
        </Row>
      </Group>
    </>
  )
}

function TerminalSection(): React.JSX.Element {
  const p = useStore((s) => s.prefs)
  return (
    <>
      <Group title="Texto">
        {/* Vista previa con la fuente, el tamaño y el interlineado elegidos. */}
        <div
          aria-hidden
          className="bg-background px-4 py-3 text-foreground"
          style={{
            fontFamily: fontStack(p.fontFamily),
            fontSize: p.fontSize,
            lineHeight: p.lineHeight
          }}
        >
          <p>
            <span className="text-muted-foreground">~/slate</span> claude
          </p>
          <p>
            <span className="text-muted-foreground">✳</span> Revisando 3 archivos…
            <span
              className={cn(
                'ml-0.5 inline-block translate-y-[0.15em] bg-foreground align-baseline',
                p.cursorStyle === 'bar' && 'h-[1em] w-[2px]',
                p.cursorStyle === 'block' && 'h-[1em] w-[0.6em]',
                p.cursorStyle === 'underline' && 'h-[2px] w-[0.6em]',
                p.cursorBlink && 'animate-pulse'
              )}
            />
          </p>
        </div>
        <Row label="Fuente">
          <Select value={p.fontFamily} onValueChange={setPref('fontFamily')}>
            <SelectTrigger aria-label="Fuente" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONTS.map((f) => (
                <SelectItem key={f} value={f} style={{ fontFamily: fontStack(f) }}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Tamaño">
          <Range
            label="Tamaño"
            value={p.fontSize}
            min={10}
            max={20}
            step={1}
            format={(v) => `${v} px`}
            onChange={setPref('fontSize')}
          />
        </Row>
        <Row label="Interlineado">
          <Range
            label="Interlineado"
            value={p.lineHeight}
            min={1}
            max={1.6}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={setPref('lineHeight')}
          />
        </Row>
      </Group>
      <Group title="Cursor">
        <Row label="Forma">
          <Segmented
            label="Forma del cursor"
            value={p.cursorStyle}
            options={CURSORS}
            onChange={setPref('cursorStyle')}
          />
        </Row>
        <Row label="Parpadeo">
          <Switch
            aria-label="Parpadeo"
            checked={p.cursorBlink}
            onCheckedChange={setPref('cursorBlink')}
          />
        </Row>
      </Group>
      <Group title="Sesiones">
        <Row
          label="Copiar al seleccionar"
          description="Lo que marcas con el ratón pasa al portapapeles."
        >
          <Switch
            aria-label="Copiar al seleccionar"
            checked={p.copyOnSelect}
            onCheckedChange={setPref('copyOnSelect')}
          />
        </Row>
        <Row label="Historial" description="Líneas que guarda cada terminal para volver atrás.">
          <Select
            value={String(p.scrollback)}
            onValueChange={(v) => setPrefs({ scrollback: Number(v) })}
          >
            <SelectTrigger aria-label="Historial" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCROLLBACK.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n.toLocaleString('es')} líneas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Group>
    </>
  )
}

function Notifications(): React.JSX.Element {
  const { notify, sound, tray } = useStore((s) => s.prefs)
  return (
    <>
      <Group title="Avisos del sistema">
        <Row
          label="Avisar"
          description="Cuando un agente te necesita o termina y Slate no está en primer plano."
        >
          <Switch aria-label="Avisar" checked={notify} onCheckedChange={setPref('notify')} />
        </Row>
        <Row label="Sonido" description="El sonido de aviso del sistema.">
          <Switch
            aria-label="Sonido"
            checked={sound}
            disabled={!notify}
            onCheckedChange={setPref('sound')}
          />
        </Row>
        <Row label="Probar" description="Muestra un aviso de ejemplo ahora.">
          <button
            onClick={testNotification}
            className="h-8 rounded-sm border border-border px-3 text-[12px] text-muted-foreground transition-colors duration-120 hover:border-muted-foreground/40 hover:text-foreground"
          >
            Enviar aviso
          </button>
        </Row>
      </Group>
      <Group title="Al cerrar la ventana">
        <Row
          label="Seguir en la bandeja"
          description="La ventana se esconde junto al reloj y los agentes siguen trabajando."
        >
          <Switch
            aria-label="Seguir en la bandeja"
            checked={tray}
            onCheckedChange={setPref('tray')}
          />
        </Row>
      </Group>
    </>
  )
}

function Shortcuts(): React.JSX.Element {
  const list = SHORTCUTS.filter((s) => !s.id.startsWith('goto-'))
  return (
    <Group>
      {list.map((s) => (
        <Row key={s.id} label={s.label}>
          <Keys combo={keysOf(s)} />
        </Row>
      ))}
      <Row label="Ir a la sesión 1 a 9">
        <Keys combo={keysOf(SHORTCUTS.find((s) => s.id === 'goto-1')!).replace('1', '1…9')} />
      </Row>
    </Group>
  )
}

const CONTENT: Record<SectionId, () => React.JSX.Element> = {
  appearance: Appearance,
  terminal: TerminalSection,
  notifications: Notifications,
  shortcuts: Shortcuts
}

// Restablecer pide un segundo clic; se olvida a los 3 s.
function ResetButton(): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAsking(false), 3000)
    return () => clearTimeout(t)
  }, [asking])
  return (
    <button
      onClick={() => {
        if (!asking) return setAsking(true)
        setPrefs(DEFAULT_PREFS)
        applyTheme()
        setAsking(false)
      }}
      className={cn(
        'flex h-8 items-center gap-2 rounded-sm px-2.5 text-[12px] transition-colors duration-120 hover:bg-accent/60',
        asking ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <ArrowCounterClockwiseIcon size={14} />
      {asking ? '¿Restablecer todo?' : 'Valores por defecto'}
    </button>
  )
}

// Ajustes: navegación a la izquierda y la sección elegida en una columna centrada.
export function Settings(): React.JSX.Element {
  const [section, setSection] = useState(lastSection)
  const root = useRef<HTMLDivElement>(null)
  const current = SECTIONS.find((s) => s.id === section)!
  const Content = CONTENT[section]

  // El foco entra al panel: Escape lo cierra y el terminal deja de recibir teclas.
  useEffect(() => root.current?.focus(), [])

  const go = (id: SectionId): void => {
    remember(id)
    setSection(id)
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={root}
        tabIndex={-1}
        // Escape dentro de un selector abierto lo cierra a él, no a Ajustes (vive en un portal).
        onKeyDown={(e) =>
          e.key === 'Escape' && e.currentTarget.contains(e.target as Node) && closeOverlay()
        }
        className="flex h-full outline-none"
      >
        <nav className="flex w-52 shrink-0 flex-col border-r border-border bg-sidebar p-2">
          <p className="flex h-9 items-center px-2.5 text-[13px] font-semibold tracking-tight">
            Ajustes
          </p>
          <LayoutGroup id="settings-nav">
            <div className="mt-1 space-y-0.5">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => go(s.id)}
                  aria-current={section === s.id ? 'page' : undefined}
                  className={cn(
                    'relative flex h-8 w-full items-center gap-2.5 rounded-sm px-2.5 text-left transition-colors duration-120',
                    section === s.id
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  )}
                >
                  {section === s.id && (
                    <motion.span
                      layoutId="nav"
                      transition={spring}
                      className="absolute inset-0 rounded-sm bg-accent"
                    />
                  )}
                  <s.icon size={16} className="relative" />
                  <span className="relative">{s.label}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          <div className="mt-auto">
            <ResetButton />
          </div>
        </nav>

        <div className="relative min-w-0 flex-1 overflow-y-auto">
          <button
            onClick={() => closeOverlay()}
            aria-label="Cerrar ajustes"
            title="Cerrar (Esc)"
            className="absolute top-3 right-3 z-10 grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground"
          >
            <XIcon size={16} />
          </button>
          {/* Al cambiar de sección el contenido entra subiendo un poco. */}
          <div
            key={section}
            className="mx-auto max-w-[560px] animate-in px-8 pt-10 pb-10 duration-200 ease-out-quint fade-in-0 slide-in-from-bottom-2"
          >
            <h2 className="text-[20px] font-semibold tracking-tight">{current.label}</h2>
            <p className="mt-1 text-muted-foreground">{current.description}</p>
            <Content />
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}
