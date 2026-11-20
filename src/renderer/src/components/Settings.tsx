import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  BellSimpleIcon,
  CircleNotchIcon,
  CloudArrowDownIcon,
  GitDiffIcon,
  KeyboardIcon,
  MagnifyingGlassIcon,
  PaintBrushBroadIcon,
  TerminalWindowIcon,
  WrenchIcon,
  XIcon,
  type Icon
} from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'
import { reducedMotion, useReduceMotion } from '@renderer/motion'
import { closeOverlay } from '@renderer/overlays'
import {
  DEFAULT_PREFS,
  FONTS,
  fontStack,
  LIMITS,
  type CursorStyle,
  type FontWeight,
  type Prefs
} from '@renderer/prefs'
import {
  defaultKeys,
  isMac,
  keysOf,
  recordShortcuts,
  SHORTCUTS,
  type Shortcut
} from '@renderer/shortcuts'
import { comboOf } from '@renderer/keys'
import { assign, conflictOf, validCombo, type Entry } from '@renderer/shortcuts.logic'
import {
  closeSession,
  flashHint,
  getState,
  setPrefs,
  testNotification,
  useStore
} from '@renderer/store'
import { applyTheme, setTheme, THEMES } from '@renderer/theme'
import { ANSI, parseVsCodeTheme, type TerminalColors } from '@renderer/vscodeTheme'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { PALETTES, paletteOf, type PaletteTokens } from '../../../shared/palettes'
import { GlowingEffect } from './ui/glowing-effect'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Keys } from './Keys'
import { PulseDot } from './ui/motion-bits'
import { searchSettings, type Entry as Found, type SectionId } from '@renderer/settingsIndex'
import { version } from '../../../../package.json'

const SECTIONS: { id: SectionId; label: string; icon: Icon; description: string }[] = [
  {
    id: 'appearance',
    label: 'Apariencia',
    icon: PaintBrushBroadIcon,
    description: 'El tema, los grises de cada modo y el tamaño de la interfaz.'
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: TerminalWindowIcon,
    description: 'Letra, cursor, shell y cómo se ve cada sesión.'
  },
  {
    id: 'changes',
    label: 'Cambios',
    icon: GitDiffIcon,
    description: 'Cómo se leen los diffs del panel de cambios.'
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
  },
  {
    id: 'updates',
    label: 'Actualizaciones',
    icon: CloudArrowDownIcon,
    description: 'Las versiones nuevas de Slate, con un clic.'
  },
  {
    id: 'advanced',
    label: 'Avanzado',
    icon: WrenchIcon,
    description: 'Lo que corre por debajo y dónde guarda Slate sus datos.'
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
    <section className="mt-7">
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

// Una fila de ajuste. Con `reset`, si alguno de esos valores no es el de siempre, aparece un
// botón para volver a él (como en T3 Code).
function Row({
  label,
  description,
  reset,
  children
}: {
  label: string
  description?: React.ReactNode
  reset?: (keyof Prefs)[]
  children: React.ReactNode
}): React.JSX.Element {
  const changed = useStore((s) => !!reset?.some((k) => s.prefs[k] !== DEFAULT_PREFS[k]))
  return (
    <div data-setting={label} className="flex min-h-14 items-center gap-6 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p>{label}</p>
        {description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <AnimatePresence initial={false}>
        {changed && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            aria-label={`Restablecer ${label.toLowerCase()}`}
            title="Volver al valor por defecto"
            onClick={() => setPrefs(Object.fromEntries(reset!.map((k) => [k, DEFAULT_PREFS[k]])))}
            className="-mr-3 grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-120 hover:bg-accent hover:text-foreground"
          >
            <ArrowCounterClockwiseIcon size={14} />
          </motion.button>
        )}
      </AnimatePresence>
      {children}
    </div>
  )
}

// Opciones excluyentes con una pastilla que se desliza a la elegida.
function Segmented<T extends string | number>({
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

// Un deslizador con su valor al lado, en monoespaciada para que no baile.
function Range({
  value,
  limits,
  format,
  label,
  onChange
}: {
  value: number
  limits: { min: number; max: number; step: number }
  format: (v: number) => string
  label: string
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <div className="flex w-60 items-center gap-3">
      <Slider
        aria-label={label}
        value={[value]}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        onValueChange={([v]) => onChange(v)}
      />
      <output className="min-w-14 rounded-sm bg-accent/60 px-1.5 py-0.5 text-center font-mono text-[12px] tabular-nums">
        {format(value)}
      </output>
    </div>
  )
}

// Ventana en miniatura con los colores de un tema.
function ThemePreview({ t }: { t: PaletteTokens }): React.JSX.Element {
  return (
    <div className="absolute inset-0 flex gap-1.5 p-2" style={{ background: t.sidebar }}>
      <div className="flex w-1/4 flex-col gap-1.5 pt-1">
        {[1, 0.6, 0.6].map((o, i) => (
          <span
            key={i}
            className="h-1 rounded-full"
            style={{ background: i ? t.border : t.muted, opacity: o }}
          />
        ))}
      </div>
      <div
        className="flex-1 space-y-1.5 rounded-[4px] p-2"
        style={{ background: t.background, boxShadow: `0 0 0 1px ${t.border}` }}
      >
        <span className="block h-1 w-2/3 rounded-full" style={{ background: t.foreground }} />
        <span className="block h-1 w-1/2 rounded-full" style={{ background: t.muted }} />
        <span className="block h-1 w-3/4 rounded-full" style={{ background: t.border }} />
      </div>
    </div>
  )
}

// Una tarjeta elegible con su miniatura; el anillo de la elegida se desliza entre ellas.
function ThemeCard({
  selected,
  ring,
  label,
  onPick,
  children
}: {
  selected: boolean
  ring: string
  label: string
  onPick: (from: { x: number; y: number }) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      role="radio"
      aria-checked={selected}
      // El tema nuevo se revela en un círculo que nace del clic.
      onClick={(e) => onPick({ x: e.clientX, y: e.clientY })}
      className="group text-left outline-none"
    >
      <div className="relative">
        <div className="relative aspect-[16/10] overflow-hidden rounded-md ring-1 ring-border transition-transform duration-200 ease-out-quint group-hover:-translate-y-0.5 group-focus-visible:ring-foreground">
          {children}
        </div>
        {selected && (
          <motion.span
            layoutId={ring}
            transition={spring}
            className="pointer-events-none absolute -inset-[4px] rounded-xl border-[1.5px] border-foreground"
          />
        )}
      </div>
      <p
        className={cn(
          'mt-2.5 px-0.5 text-[12px] transition-colors duration-120',
          selected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
        )}
      >
        {label}
      </p>
    </button>
  )
}

function ModePicker(): React.JSX.Element {
  const { theme, darkPalette, lightPalette } = useStore((s) => ({
    theme: s.prefs.theme,
    darkPalette: s.prefs.darkPalette,
    lightPalette: s.prefs.lightPalette
  }))
  const dark = paletteOf(darkPalette, true).tokens
  const light = paletteOf(lightPalette, false).tokens
  return (
    <LayoutGroup id="mode">
      <div role="radiogroup" aria-label="Modo" className="mt-3 grid grid-cols-3 gap-4">
        {THEMES.map((t) => (
          <ThemeCard
            key={t.id}
            ring="mode-ring"
            label={t.label}
            selected={theme === t.id}
            onPick={(from) => setTheme(t.id, from)}
          >
            {t.id === 'auto' ? (
              <>
                <ThemePreview t={dark} />
                <div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]">
                  <ThemePreview t={light} />
                </div>
              </>
            ) : (
              <ThemePreview t={t.id === 'dark' ? dark : light} />
            )}
          </ThemeCard>
        ))}
      </div>
    </LayoutGroup>
  )
}

// Los grises de un modo. Elegir uno del otro modo cambia a ese modo (salvo en Automático).
function PalettePicker({ dark }: { dark: boolean }): React.JSX.Element {
  const key = dark ? 'darkPalette' : 'lightPalette'
  const current = useStore((s) => paletteOf(s.prefs[key], dark).id)
  const mode = useStore((s) => s.prefs.theme)
  return (
    <LayoutGroup id={key}>
      <div
        role="radiogroup"
        aria-label={dark ? 'Tema oscuro' : 'Tema claro'}
        className="mt-3 grid grid-cols-4 gap-4"
      >
        {PALETTES.filter((p) => p.dark === dark).map((p) => (
          <ThemeCard
            key={p.id}
            ring={`${key}-ring`}
            label={p.label}
            selected={current === p.id}
            onPick={(from) =>
              setTheme(
                { [key]: p.id, theme: mode === 'auto' ? 'auto' : dark ? 'dark' : 'light' },
                from
              )
            }
          >
            <ThemePreview t={p.tokens} />
          </ThemeCard>
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
const WEIGHTS: { id: FontWeight; label: string }[] = [
  { id: '300', label: 'Fina' },
  { id: 'normal', label: 'Normal' },
  { id: '500', label: 'Media' }
]
// xterm sube el contraste de un color que no se lee sobre el fondo hasta esta proporción.
const CONTRASTS = [
  { id: 1, label: 'Original' },
  { id: 4.5, label: 'Alto' },
  { id: 7, label: 'Máximo' }
]
const SCROLLBACK = [1000, 5000, 10000, 50000]

// Escribe en `prefs` una clave concreta: así cada control se conecta en una línea.
const setPref =
  <K extends keyof Prefs>(key: K) =>
  (value: Prefs[K]): void =>
    setPrefs({ [key]: value } as Partial<Prefs>)

// El botón con borde de las filas (Enviar aviso, Abrir carpeta…).
const outlineButton =
  'h-8 shrink-0 rounded-sm border border-border px-3 text-[12px] text-muted-foreground transition-colors duration-120 hover:border-muted-foreground/40 hover:text-foreground disabled:opacity-40'

// Vista previa de la velocidad de los paneles: una barra lateral de mentira que entra y sale con
// la duración y la curva elegidas, para ver el ajuste sin cerrar Ajustes.
function PanelPreview({ ms }: { ms: number }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    if (!ms) return
    const t = setInterval(() => document.visibilityState === 'visible' && setOpen((o) => !o), 1600)
    return () => clearInterval(t)
  }, [ms])
  return (
    <span
      aria-hidden
      className="mt-2 block h-10 w-48 overflow-hidden rounded-md border border-border bg-background"
    >
      <span
        className="block h-full w-14 border-r border-border bg-sidebar transition-transform ease-drawer"
        style={{
          transform: !ms || open ? 'none' : 'translateX(-100%)',
          transitionDuration: `${ms}ms`
        }}
      >
        <span className="m-1.5 block h-1.5 w-8 rounded-full bg-foreground/25" />
        <span className="m-1.5 block h-1.5 w-6 rounded-full bg-foreground/10" />
      </span>
    </span>
  )
}

function Appearance(): React.JSX.Element {
  const reduce = useReduceMotion()
  const { pinTopBar, uiScale, contrast, solid, reduceMotion, panelMs } = useStore((s) => ({
    pinTopBar: s.prefs.pinTopBar,
    uiScale: s.prefs.uiScale,
    contrast: s.prefs.contrast,
    solid: s.prefs.solid,
    reduceMotion: s.prefs.reduceMotion,
    panelMs: s.prefs.panelMs
  }))
  return (
    <>
      <h3 className="mt-7 px-1 text-[12px] font-medium text-muted-foreground">Modo</h3>
      <ModePicker />
      <h3 className="mt-7 px-1 text-[12px] font-medium text-muted-foreground">Tema oscuro</h3>
      <PalettePicker dark />
      <h3 className="mt-7 px-1 text-[12px] font-medium text-muted-foreground">Tema claro</h3>
      <PalettePicker dark={false} />
      <Group title="Interfaz">
        <Row
          label="Reducir movimiento"
          description="Abre los paneles al instante y pausa los efectos animados. Slate también respeta el ajuste de Windows."
          reset={['reduceMotion']}
        >
          <Switch
            aria-label="Reducir movimiento"
            checked={reduceMotion}
            onCheckedChange={setPref('reduceMotion')}
          />
        </Row>
        <Row
          label="Tamaño de la interfaz"
          description="Textos, botones y paneles. El terminal conserva su propio tamaño de letra."
          reset={['uiScale']}
        >
          <Range
            label="Tamaño de la interfaz"
            value={uiScale}
            limits={LIMITS.uiScale}
            format={(v) => `${v} %`}
            onChange={setPref('uiScale')}
          />
        </Row>
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
        <Row
          label="Contraste"
          description="Bordes y texto secundario: más marcados o más suaves que el tema."
          reset={['contrast']}
        >
          <Range
            label="Contraste"
            value={contrast}
            limits={LIMITS.contrast}
            format={(v) => `${v} %`}
            onChange={setPref('contrast')}
          />
        </Row>
        <Row
          label="Reducir transparencia"
          description="Menús, paleta y avisos con fondo sólido, sin vidrio ni desenfoque."
          reset={['solid']}
        >
          <Switch
            aria-label="Reducir transparencia"
            checked={solid}
            onCheckedChange={setPref('solid')}
          />
        </Row>
        <Row
          label="Velocidad de los paneles"
          description={
            <>
              Cuánto tardan en abrirse la barra lateral, los cambios y el tablero. 0 los abre al
              instante.
              <PanelPreview ms={reduce ? 0 : panelMs} />
            </>
          }
          reset={['panelMs']}
        >
          <Range
            label="Duración de los paneles"
            value={panelMs}
            limits={LIMITS.panelMs}
            format={(v) => (v ? `${v} ms` : 'Al instante')}
            onChange={setPref('panelMs')}
          />
        </Row>
      </Group>
    </>
  )
}

// Las monoespaciadas instaladas en el equipo, además de las de siempre. Se piden la primera vez
// que se abre el selector (el navegador exige un gesto para leerlas). Una fuente es monoespaciada
// si "iiii" y "MMMM" ocupan lo mismo.
// ponytail: se leen una vez por sesión; una fuente instalada con Slate abierto aparece al reabrir.
let installedMono: string[] | null = null
async function loadMonoFonts(): Promise<string[]> {
  if (installedMono) return installedMono
  const { queryLocalFonts } = window as { queryLocalFonts?: () => Promise<{ family: string }[]> }
  const families = ((await queryLocalFonts?.call(window).catch(() => [])) ?? []).map(
    (f) => f.family
  )
  const ctx = document.createElement('canvas').getContext('2d')!
  const width = (family: string, text: string): number => {
    ctx.font = `16px "${family}", serif`
    return ctx.measureText(text).width
  }
  const mono = [...new Set(families)]
    .filter((f) => !FONTS.includes(f) && width(f, 'iiiiii') === width(f, 'MMMMMM'))
    .sort((a, b) => a.localeCompare(b))
  installedMono = [...FONTS, ...mono]
  return installedMono
}

function FontSelect({ value }: { value: string }): React.JSX.Element {
  const [fonts, setFonts] = useState(installedMono ?? FONTS)
  return (
    <Select
      value={value}
      onValueChange={setPref('fontFamily')}
      onOpenChange={(open) => open && loadMonoFonts().then(setFonts)}
    >
      <SelectTrigger aria-label="Fuente" className="w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {(fonts.includes(value) ? fonts : [value, ...fonts]).map((f) => (
          <SelectItem key={f} value={f} style={{ fontFamily: fontStack(f) }}>
            {f}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ShellSelect({ value }: { value: string }): React.JSX.Element {
  const [shells, setShells] = useState<{ id: string; name: string }[]>([])
  useEffect(() => void window.slate.app.shells().then(setShells), [])
  return (
    <Select value={value} onValueChange={setPref('shell')}>
      <SelectTrigger aria-label="Shell" className="w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Automática</SelectItem>
        {shells.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Los colores del tema importado, de un vistazo: fondo, texto y los 16 ANSI.
function ImportedSwatches({ colors }: { colors: TerminalColors }): React.JSX.Element {
  return (
    <div aria-hidden className="flex flex-wrap items-center gap-1.5 px-4 py-3">
      {[colors.background, colors.foreground].map(
        (c, i) =>
          c && (
            <span
              key={i}
              className="size-5 rounded-sm ring-1 ring-border"
              style={{ background: c }}
            />
          )
      )}
      <span className="mx-1 h-4 w-px bg-border" />
      {ANSI.map((name) => (
        <span
          key={name}
          title={name}
          className={cn(
            'size-4 rounded-full ring-1 ring-border',
            !colors.ansi[name] && 'opacity-20'
          )}
          style={{ background: colors.ansi[name] ?? 'currentColor' }}
        />
      ))}
    </div>
  )
}

// Importar o quitar el tema de VS Code: un cuadro donde pegar el JSON, con su error si no sirve.
function ImportTheme(): React.JSX.Element {
  const has = useStore((s) => !!s.prefs.terminalTheme)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const close = (): void => {
    setOpen(false)
    setText('')
    setError(null)
  }
  return (
    <>
      {has && (
        <button onClick={() => setPrefs({ terminalTheme: null })} className={outlineButton}>
          Quitar
        </button>
      )}
      <button onClick={() => setOpen(true)} className={outlineButton}>
        {has ? 'Cambiar…' : 'Importar…'}
      </button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar un tema de VS Code</DialogTitle>
            <DialogDescription>
              Pega el JSON del tema (o el bloque workbench.colorCustomizations de tu settings.json).
              Se usan los colores del terminal; si faltan, los del editor.
            </DialogDescription>
          </DialogHeader>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            aria-label="Tema de VS Code"
            rows={10}
            spellCheck={false}
            className="block w-full resize-none rounded-md border border-border bg-background/60 p-3 font-mono text-[12px] leading-5 outline-none select-text focus:border-muted-foreground/50"
          />
          {error && <p className="text-destructive">{error}</p>}
          <DialogFooter>
            <button
              onClick={close}
              className="h-8 rounded-md px-3 text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              disabled={!text.trim()}
              onClick={() => {
                const r = parseVsCodeTheme(text)
                if (!r.ok) return setError(r.error)
                setPrefs({ terminalTheme: r.colors })
                close()
              }}
              className="h-8 rounded-md bg-foreground px-3 font-semibold text-background disabled:opacity-50"
            >
              Importar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            lineHeight: p.lineHeight,
            letterSpacing: p.letterSpacing,
            fontWeight: p.fontWeight
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
        <Row label="Fuente" reset={['fontFamily']}>
          <FontSelect value={p.fontFamily} />
        </Row>
        <Row label="Tamaño" reset={['fontSize']}>
          <Range
            label="Tamaño"
            value={p.fontSize}
            limits={LIMITS.fontSize}
            format={(v) => `${v} px`}
            onChange={setPref('fontSize')}
          />
        </Row>
        <Row label="Interlineado" reset={['lineHeight']}>
          <Range
            label="Interlineado"
            value={p.lineHeight}
            limits={LIMITS.lineHeight}
            format={(v) => v.toFixed(2)}
            onChange={setPref('lineHeight')}
          />
        </Row>
        <Row label="Espacio entre letras" reset={['letterSpacing']}>
          <Range
            label="Espacio entre letras"
            value={p.letterSpacing}
            limits={LIMITS.letterSpacing}
            format={(v) => `${v} px`}
            onChange={setPref('letterSpacing')}
          />
        </Row>
        <Row label="Grosor" reset={['fontWeight']}>
          <Segmented
            label="Grosor de la letra"
            value={p.fontWeight}
            options={WEIGHTS}
            onChange={setPref('fontWeight')}
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
      <Group title="Pantalla">
        <Row
          label="Margen interior"
          description="Aire entre el texto y el borde de cada terminal."
          reset={['terminalPadding']}
        >
          <Range
            label="Margen interior"
            value={p.terminalPadding}
            limits={LIMITS.terminalPadding}
            format={(v) => `${v} px`}
            onChange={setPref('terminalPadding')}
          />
        </Row>
        <Row
          label="Contraste mínimo"
          description="Aclara u oscurece los colores que no se leerían bien sobre el fondo."
        >
          <Segmented
            label="Contraste mínimo"
            value={p.minimumContrast}
            options={CONTRASTS}
            onChange={setPref('minimumContrast')}
          />
        </Row>
        <Row
          label="Desplazamiento suave"
          description="La rueda del ratón se desliza en vez de saltar."
        >
          <Switch
            aria-label="Desplazamiento suave"
            checked={p.smoothScroll}
            onCheckedChange={setPref('smoothScroll')}
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
      </Group>
      <Group title="Colores">
        <Row
          label="Tema de VS Code"
          description={
            p.terminalTheme
              ? 'Los colores del terminal vienen de un tema importado.'
              : 'Pega un tema de VS Code para usar su fondo, su texto y sus 16 colores.'
          }
        >
          <ImportTheme />
        </Row>
        {p.terminalTheme && <ImportedSwatches colors={p.terminalTheme} />}
      </Group>
      <Group title="Shell">
        <Row
          label="Shell de las terminales nuevas"
          description="Los agentes siempre arrancan en PowerShell, que es para lo que está escrito su arranque."
        >
          <ShellSelect value={p.shell} />
        </Row>
      </Group>
      <Group title="Agentes">
        <Row
          label="Orquestación"
          description="Claude Code recibe las herramientas de Slate para lanzar, leer y dirigir a otros agentes. Vale para las sesiones nuevas."
        >
          <Switch
            aria-label="Orquestación"
            checked={p.orchestration}
            onCheckedChange={setPref('orchestration')}
          />
        </Row>
      </Group>
    </>
  )
}

// Un diff de ejemplo con el tamaño y el ajuste elegidos: se ve el cambio antes de abrir el panel.
const SAMPLE = [
  { kind: ' ', n: 12, text: 'export function saludo(nombre: string): string {' },
  { kind: '-', n: 13, text: "  return 'Hola ' + nombre" },
  {
    kind: '+',
    n: 13,
    text: '  return `Hola, ${nombre}. Bienvenido de nuevo a Slate, que te avisa cuando un agente te necesita.`'
  },
  { kind: ' ', n: 14, text: '}' }
]

function ChangesSection(): React.JSX.Element {
  const { codeFontSize, diffWrap, diffIgnoreSpace, changesWidth } = useStore((s) => ({
    codeFontSize: s.prefs.codeFontSize,
    diffWrap: s.prefs.diffWrap,
    diffIgnoreSpace: s.prefs.diffIgnoreSpace,
    changesWidth: s.prefs.changesWidth
  }))
  return (
    <>
      <Group title="Diff">
        <div
          aria-hidden
          className={cn('bg-background py-2 font-mono', !diffWrap && 'overflow-hidden')}
          style={{ fontSize: codeFontSize, lineHeight: 1.6 }}
        >
          {SAMPLE.map((l, i) => (
            <div
              key={i}
              className={cn(
                'grid grid-cols-[3ch_1fr] gap-x-3 pr-4 pl-3',
                diffWrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre',
                l.kind === '+' && 'bg-added/10 shadow-[inset_2px_0_var(--added)]',
                l.kind === '-' && 'bg-removed/10 shadow-[inset_2px_0_var(--removed)]'
              )}
            >
              <span className="text-right text-muted-foreground/60">{l.n}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
        <Row label="Tamaño del código" reset={['codeFontSize']}>
          <Range
            label="Tamaño del código"
            value={codeFontSize}
            limits={LIMITS.codeFontSize}
            format={(v) => `${v} px`}
            onChange={setPref('codeFontSize')}
          />
        </Row>
        <Row label="Ajustar líneas largas" description="Se parten en varias en vez de desplazarse.">
          <Switch
            aria-label="Ajustar líneas largas"
            checked={diffWrap}
            onCheckedChange={setPref('diffWrap')}
          />
        </Row>
        <Row
          label="Ignorar espacios en blanco"
          description="Los cambios que solo mueven sangrías o espacios no aparecen en el diff."
        >
          <Switch
            aria-label="Ignorar espacios en blanco"
            checked={diffIgnoreSpace}
            onCheckedChange={setPref('diffIgnoreSpace')}
          />
        </Row>
      </Group>
      <Group title="Panel">
        <Row
          label="Ancho del panel"
          description="También se ajusta arrastrando su borde izquierdo."
          reset={['changesWidth']}
        >
          <Range
            label="Ancho del panel"
            value={changesWidth}
            limits={{ ...LIMITS.changesWidth, step: 20 }}
            format={(v) => `${v} px`}
            onChange={setPref('changesWidth')}
          />
        </Row>
      </Group>
    </>
  )
}

function Notifications(): React.JSX.Element {
  const { notify, sound, tray, keepAlive } = useStore((s) => s.prefs)
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
          <button onClick={testNotification} className={outlineButton}>
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
        <Row
          label="Mantener las sesiones al salir"
          description="Los agentes siguen trabajando con Slate cerrado y vuelven, tal cual, al abrirlo."
        >
          <Switch
            aria-label="Mantener las sesiones al salir"
            checked={keepAlive}
            onCheckedChange={setPref('keepAlive')}
          />
        </Row>
        <Row
          label="Detener todas las sesiones"
          description="Cierra ahora todas las terminales, también las que siguen trabajando en segundo plano."
        >
          <StopAllButton />
        </Row>
      </Group>
    </>
  )
}

// Un atajo editable: clic y pulsar la combinación nueva. Escape deja el que había, Retroceso lo
// quita, y si ya lo usa otro se ofrece reasignarlo.
function ShortcutRow({ shortcut }: { shortcut: Shortcut }): React.JSX.Element {
  const overrides = useStore((s) => s.prefs.shortcuts)
  const [listening, setListening] = useState(false)
  const [clash, setClash] = useState<{ combo: string; other: Shortcut } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const changed = shortcut.id in overrides
  const entries = (): Entry[] => SHORTCUTS.map((x) => ({ id: x.id, keys: keysOf(x) }))
  const defaults = Object.fromEntries(SHORTCUTS.map((x) => [x.id, defaultKeys(x)]))
  const apply = (combo: string, takeOver = false): void => {
    setPrefs({
      shortcuts: assign(
        getState().prefs.shortcuts,
        entries(),
        defaults,
        shortcut.id,
        combo,
        takeOver
      )
    })
    setClash(null)
    setError(null)
  }
  const stop = (): void => {
    setListening(false)
    recordShortcuts(false)
  }
  // Si Ajustes se cierra mientras se graba, los atajos de Slate vuelven a funcionar.
  useEffect(() => () => recordShortcuts(false), [])

  return (
    <Row label={shortcut.label}>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          {changed && !listening && (
            <button
              aria-label={`Restablecer ${shortcut.label.toLowerCase()}`}
              title="Volver al atajo de siempre"
              onClick={() => apply(defaultKeys(shortcut), true)}
              className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowCounterClockwiseIcon size={14} />
            </button>
          )}
          <button
            aria-label={`Cambiar el atajo de ${shortcut.label.toLowerCase()}`}
            onClick={() => {
              setClash(null)
              setError(null)
              setListening(true)
              recordShortcuts(true)
            }}
            onBlur={stop}
            onKeyDown={(e) => {
              if (!listening) return
              e.preventDefault()
              e.stopPropagation()
              if (e.key === 'Escape') return stop()
              if (e.key === 'Backspace') {
                apply('')
                return stop()
              }
              if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return // aún faltan teclas
              const combo = comboOf(e.nativeEvent)
              const valid = validCombo(combo, isMac)
              if (!valid.ok) return setError(valid.error)
              const other = conflictOf(entries(), shortcut.id, combo)
              stop()
              const owner = SHORTCUTS.find((x) => x.id === other?.id)
              if (owner) return setClash({ combo, other: owner })
              apply(combo)
            }}
            className={cn(
              'flex h-8 min-w-24 items-center justify-end rounded-sm border px-2 transition-colors duration-120',
              listening ? 'border-foreground' : 'border-transparent hover:border-border'
            )}
          >
            {listening ? (
              <span className="text-[12px] text-muted-foreground">Pulsa las teclas…</span>
            ) : (
              <Keys combo={keysOf(shortcut)} />
            )}
          </button>
        </div>
        {error && <p className="text-[12px] text-destructive">{error}</p>}
        {clash && (
          <p className="flex items-center gap-2 text-[12px] text-attention">
            Ya lo usa «{clash.other.label}».
            <button
              onClick={() => apply(clash.combo, true)}
              className="text-foreground underline underline-offset-2"
            >
              Reasignar
            </button>
            <button onClick={() => setClash(null)} className="text-muted-foreground">
              Cancelar
            </button>
          </p>
        )}
      </div>
    </Row>
  )
}

function Shortcuts(): React.JSX.Element {
  const list = SHORTCUTS.filter((s) => !s.id.startsWith('goto-'))
  return (
    <Group>
      {list.map((s) => (
        <ShortcutRow key={s.id} shortcut={s} />
      ))}
      <Row label="Ir a la sesión 1 a 9">
        <Keys combo={defaultKeys(SHORTCUTS.find((s) => s.id === 'goto-1')!).replace('1', '1…9')} />
      </Row>
    </Group>
  )
}

const RELEASES = 'https://github.com/angeldqr/slate-terminal/releases'

// Lo que se dice y lo que hace el botón en cada momento de una actualización.
function Updates(): React.JSX.Element {
  const update = useStore((s) => s.update)
  const autoUpdate = useStore((s) => s.prefs.autoUpdate)
  const open = useStore((s) => s.sessions.filter((x) => x.status !== 'exited').length)
  const { status, version: next, progress = 0, error } = update
  const busy = status === 'checking' || status === 'downloading'

  const text = {
    unsupported:
      'Las actualizaciones llegan a la versión instalada; esta es una copia de desarrollo.',
    idle: 'Mira si hay una versión nueva publicada.',
    checking: 'Buscando una versión nueva…',
    current: 'Estás al día.',
    available: `Hay una versión nueva: ${next}.`,
    downloading: `Descargando ${next}…`,
    ready: `${next} está descargada. Al reiniciar se instala y Slate vuelve a abrirse.`,
    error: error ?? 'No se pudo comprobar.'
  }[status]

  const action =
    status === 'ready'
      ? { label: 'Reiniciar y actualizar', run: window.slate.update.install }
      : status === 'available' || (status === 'error' && next)
        ? { label: `Descargar ${next}`, run: window.slate.update.download }
        : { label: 'Buscar actualizaciones', run: window.slate.update.check }

  return (
    <>
      <section className="relative mt-7 overflow-hidden rounded-lg border border-border bg-background/50 p-5">
        <GlowingEffect
          disabled={reducedMotion()}
          variant="white"
          proximity={64}
          spread={40}
          inactiveZone={0.01}
          borderWidth={1}
        />
        <div className="relative flex items-center gap-5">
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-tight">Slate</span>
              <span className="font-mono text-[12px] text-muted-foreground">{version}</span>
            </p>
            <p
              className={cn(
                'mt-1 text-[12px] leading-relaxed',
                status === 'error' ? 'text-destructive' : 'text-muted-foreground'
              )}
              aria-live="polite"
            >
              {text}
              {status === 'ready' && open > 0 && (
                <>
                  {' '}
                  {open === 1
                    ? 'Se cerrará la terminal abierta.'
                    : `Se cerrarán las ${open} terminales abiertas.`}
                </>
              )}
            </p>
          </div>
          <button
            onClick={action.run}
            disabled={status === 'unsupported' || busy}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-md px-4 font-semibold transition-colors duration-120 disabled:opacity-50',
              status === 'ready' || status === 'available'
                ? 'bg-foreground text-background hover:bg-foreground/85'
                : 'border border-border text-foreground hover:border-muted-foreground/40'
            )}
          >
            {busy && <CircleNotchIcon size={14} className="animate-spin" />}
            {status === 'downloading' ? `${progress} %` : action.label}
          </button>
        </div>
        {/* La barra de descarga: aparece solo mientras baja. */}
        <AnimatePresence>
          {status === 'downloading' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative mt-4 h-1 overflow-hidden rounded-full bg-accent"
            >
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full bg-foreground"
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
      <Group>
        <Row
          label="Buscar al abrir Slate"
          description="Te avisa si hay una versión nueva; nunca la instala sin que lo pidas."
        >
          <Switch
            aria-label="Buscar al abrir Slate"
            checked={autoUpdate}
            onCheckedChange={setPref('autoUpdate')}
          />
        </Row>
        <Row
          label="Todas las versiones"
          description="Cada cambio publicado en develop sale como una versión nueva."
        >
          <button
            onClick={() => window.open(RELEASES)}
            className={cn(outlineButton, 'flex items-center gap-1.5')}
          >
            Ver en GitHub
            <ArrowSquareOutIcon size={13} />
          </button>
        </Row>
      </Group>
    </>
  )
}

type AppInfo = Awaited<ReturnType<typeof window.slate.app.info>>

const mb = (bytes: number): string => `${Math.round(bytes / 1048576)} MB`
const secs = (s: number): string => (s < 60 ? `${s.toFixed(1)} s` : `${Math.round(s / 60)} min`)

// Memoria y CPU de cada terminal (su shell y todo lo que lanzó) y del host; se refresca solo
// mientras la sección está a la vista. Detener cierra la sesión (pide un segundo clic si trabaja).
function ProcessTable(): React.JSX.Element {
  const sessions = useStore((s) => s.sessions.filter((x) => x.status !== 'exited'))
  // undefined: leyendo todavía; null: no se pudo leer.
  const [usage, setUsage] = useState<
    Awaited<ReturnType<typeof window.slate.app.processes>> | undefined
  >(undefined)
  const [asking, setAsking] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    let reading = false // PowerShell tarda: no se empieza otra lectura hasta acabar la anterior
    const read = (): void => {
      if (reading || document.visibilityState !== 'visible') return
      reading = true
      window.slate.app
        .processes()
        .then((u) => live && setUsage(u))
        .catch(() => live && setUsage(null))
        .finally(() => (reading = false))
    }
    read()
    const timer = setInterval(read, 5000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [sessions.length])

  const cell = 'px-4 py-2 text-right tabular-nums text-muted-foreground'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 font-medium">Proceso</th>
            <th className="px-4 py-2 text-right font-medium">PID</th>
            <th className="px-4 py-2 text-right font-medium">Memoria</th>
            <th className="px-4 py-2 text-right font-medium">CPU</th>
            <th className="w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {usage?.host && (
            <tr>
              <td className="px-4 py-2">Host de sesiones</td>
              <td className={cell}>{usage.host.pid}</td>
              <td className={cell}>{mb(usage.host.memory)}</td>
              <td className={cell}>{secs(usage.host.cpu)}</td>
              <td />
            </tr>
          )}
          {sessions.map((s) => {
            const u = usage?.sessions[s.id]
            const sure = asking === s.id
            return (
              <tr key={s.id}>
                <td className="max-w-40 truncate px-4 py-2" title={s.title}>
                  {s.title}
                </td>
                <td className={cell}>{u?.pid ?? '—'}</td>
                <td className={cell}>{u ? mb(u.memory) : '—'}</td>
                <td className={cell}>{u ? secs(u.cpu) : '—'}</td>
                <td className="px-2 text-right">
                  <button
                    onClick={() => {
                      if (s.status === 'working' && !sure) return setAsking(s.id)
                      setAsking(null)
                      closeSession(s.id)
                    }}
                    onBlur={() => setAsking(null)}
                    className={cn(
                      'h-6 rounded-sm px-2 transition-colors duration-120 hover:bg-accent',
                      sure ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {sure ? '¿Detener?' : 'Detener'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {usage && !usage.host && (
        <p className="px-4 py-3 text-[12px] text-muted-foreground">
          El host que está en marcha es de una versión anterior y no informa de sus procesos: se
          renueva al salir sin mantener las sesiones.
        </p>
      )}
      {usage === undefined && (
        <p className="px-4 py-3 text-[12px] text-muted-foreground">Leyendo procesos…</p>
      )}
      {usage === null && (
        <p className="px-4 py-3 text-[12px] text-muted-foreground">
          No se pudo leer el uso de los procesos.
        </p>
      )}
      {usage && !sessions.length && (
        <p className="px-4 py-3 text-[12px] text-muted-foreground">No hay terminales abiertas.</p>
      )}
    </div>
  )
}

function Advanced(): React.JSX.Element {
  const count = useStore((s) => s.sessions.filter((x) => x.status !== 'exited').length)
  const [info, setInfo] = useState<AppInfo | null>(null)
  // Si el host se cae, sus sesiones terminan y la cuenta cambia: se vuelve a preguntar.
  useEffect(() => void window.slate.app.info().then(setInfo), [count])
  const gpu = useStore((s) => s.prefs.gpu)
  // "enabled" o "enabled_on": Chromium dibuja de verdad con la GPU.
  const onGpu =
    !!info?.gpu.on && /^enabled/.test(info.gpu.webgl) && /^enabled/.test(info.gpu.compositing)
  const gpuText = !info
    ? ''
    : !info.gpu.on
      ? 'Apagada: todo se dibuja con el procesador.'
      : onGpu
        ? 'Activa: los terminales se dibujan con WebGL y la ventana se compone en la GPU.'
        : 'Encendida, pero Chromium no la está usando (controlador no compatible).'
  return (
    <>
      <Group title="Rendimiento">
        <Row
          label="Aceleración por GPU"
          description={
            <>
              {gpuText}
              {info && gpu !== info.gpu.on && (
                <span className="mt-1 block text-foreground">
                  Se aplica al reiniciar Slate. Con «Mantener las sesiones al salir», siguen vivas.
                </span>
              )}
            </>
          }
        >
          {info && gpu !== info.gpu.on && (
            <button onClick={() => window.slate.app.relaunch()} className={outlineButton}>
              Reiniciar
            </button>
          )}
          <Switch aria-label="Aceleración por GPU" checked={gpu} onCheckedChange={setPref('gpu')} />
        </Row>
      </Group>
      <Group title="Sesiones en segundo plano">
        <Row
          label="Host de sesiones"
          description="El proceso que mantiene vivas las terminales mientras Slate está cerrado."
        >
          {info && (
            <span className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
              {info.host ? (
                <PulseDot className="bg-foreground" />
              ) : (
                <span className="size-1.5 rounded-full bg-destructive" />
              )}
              {!info.host
                ? 'Sin conexión'
                : count === 1
                  ? 'En marcha con 1 terminal'
                  : `En marcha con ${count} terminales`}
            </span>
          )}
        </Row>
      </Group>
      <Group title="Procesos">
        <ProcessTable />
      </Group>
      <Group title="Datos">
        <Row
          label="Carpeta de datos"
          description={
            <>
              Ajustes, proyectos y, si el host falló alguna vez, su registro en host.log.
              {/* Se recorta por el principio: lo que distingue la ruta es su final. */}
              <span className="mt-1 block truncate font-mono [direction:rtl]">
                <bdi>{info?.dataDir}</bdi>
              </span>
            </>
          }
        >
          <button
            onClick={() =>
              window.slate.app
                .openData()
                .then((err) => err && flashHint(`No se pudo abrir: ${err}`))
            }
            className={outlineButton}
          >
            Abrir carpeta
          </button>
        </Row>
        <Row
          label="Registros"
          description="host.log guarda lo que el host de sesiones no pudo hacer, si le pasó algo."
        >
          <button
            onClick={() =>
              window.slate.app
                .openLogs()
                .then((err) => err && flashHint(`No se pudo abrir: ${err}`))
            }
            className={outlineButton}
          >
            Abrir registros
          </button>
        </Row>
      </Group>
    </>
  )
}

const CONTENT: Record<SectionId, () => React.JSX.Element> = {
  appearance: Appearance,
  terminal: TerminalSection,
  changes: ChangesSection,
  notifications: Notifications,
  shortcuts: Shortcuts,
  updates: Updates,
  advanced: Advanced
}

// Pide un segundo clic: cierra agentes que pueden estar a medias. Se olvida a los 3 s.
function StopAllButton(): React.JSX.Element {
  const count = useStore((s) => s.sessions.length)
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => setAsking(false), 3000)
    return () => clearTimeout(t)
  }, [asking])
  return (
    <button
      disabled={!count}
      onClick={() => {
        if (!asking) return setAsking(true)
        getState().sessions.forEach((x) => closeSession(x.id))
        flashHint(count === 1 ? 'Se detuvo la sesión' : `Se detuvieron las ${count} sesiones`)
        setAsking(false)
      }}
      className={cn(
        'h-8 shrink-0 rounded-sm border px-3 text-[12px] transition-colors duration-120 disabled:opacity-40',
        asking
          ? 'border-destructive/50 text-destructive'
          : 'border-border text-muted-foreground enabled:hover:border-muted-foreground/40 enabled:hover:text-foreground'
      )}
    >
      {asking ? `¿Detener ${count}?` : 'Detener'}
    </button>
  )
}

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
function SearchResults({
  found,
  onOpen
}: {
  found: Found[]
  onOpen: (e: Found) => void
}): React.JSX.Element {
  if (!found.length) {
    return <p className="text-muted-foreground">Ningún ajuste coincide con tu búsqueda.</p>
  }
  return (
    <>
      <h2 className="text-[20px] font-semibold tracking-tight">Resultados</h2>
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
        {found.map((e) => (
          <li key={e.section + e.label}>
            <button
              onClick={() => onOpen(e)}
              className="flex h-11 w-full items-center gap-3 px-4 text-left transition-colors duration-120 hover:bg-accent/40"
            >
              <span className="flex-1">{e.label}</span>
              <span className="text-[12px] text-muted-foreground">
                {SECTIONS.find((s) => s.id === e.section)?.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export function Settings(): React.JSX.Element {
  const [section, setSection] = useState(lastSection)
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const current = SECTIONS.find((s) => s.id === section)!
  const Content = CONTENT[section]
  // Un punto junto a Actualizaciones cuando hay una versión esperando.
  const pending = useStore((s) => s.update.status === 'available' || s.update.status === 'ready')

  // El foco entra al panel: Escape lo cierra y el terminal deja de recibir teclas.
  useEffect(() => root.current?.focus(), [])

  const go = (id: SectionId): void => {
    remember(id)
    setSection(id)
    scroller.current?.scrollTo({ top: 0 }) // cada sección empieza por arriba
  }

  // Buscador: filtra todas las secciones; elegir un resultado salta a su sección y alumbra su fila.
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const found = searchSettings(query)
  const open = (e: Found): void => {
    go(e.section)
    setQuery('')
    setTarget(e.label)
  }
  useEffect(() => {
    if (!target) return
    const frame = requestAnimationFrame(() => {
      const row = scroller.current?.querySelector<HTMLElement>(
        `[data-setting="${CSS.escape(target)}"]`
      )
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      row?.setAttribute('data-flash', '')
      setTimeout(() => row?.removeAttribute('data-flash'), 1500)
      setTarget(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, section])

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
        <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar p-2">
          <p className="flex h-9 items-center px-2.5 text-[13px] font-semibold tracking-tight">
            Ajustes
          </p>
          <div className="relative mt-1 mb-2">
            <MagnifyingGlassIcon
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && found[0]) open(found[0])
                // Escape borra la búsqueda; con el campo vacío cierra Ajustes como siempre.
                if (e.key === 'Escape' && query) {
                  e.stopPropagation()
                  setQuery('')
                }
              }}
              aria-label="Buscar ajustes"
              placeholder="Buscar ajustes"
              spellCheck={false}
              className="h-8 w-full rounded-sm border border-border bg-background/50 pr-2 pl-8 text-[13px] outline-none select-text placeholder:text-muted-foreground focus:border-muted-foreground/50"
            />
          </div>
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
                  {s.id === 'updates' && pending && (
                    <span className="relative ml-auto size-1.5 rounded-full bg-foreground">
                      <span className="sr-only">Hay una versión nueva</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </LayoutGroup>
          <div className="mt-auto">
            <ResetButton />
            <p className="px-2.5 pt-1 pb-1.5 text-[12px] text-muted-foreground">Slate {version}</p>
          </div>
        </nav>

        <div ref={scroller} className="relative min-w-0 flex-1 overflow-y-auto">
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
            className="mx-auto max-w-[600px] animate-in px-8 pt-10 pb-12 duration-200 ease-out-quint fade-in-0 slide-in-from-bottom-2"
          >
            {query.trim() ? (
              <SearchResults found={found} onOpen={open} />
            ) : (
              <>
                <h2 className="text-[20px] font-semibold tracking-tight">{current.label}</h2>
                <p className="mt-1 text-muted-foreground">{current.description}</p>
                <Content />
              </>
            )}
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}
