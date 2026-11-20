import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpIcon, PlusIcon } from '@phosphor-icons/react'
import { cn } from '@renderer/lib/utils'

// Placeholders And Vanish Input de Aceternity, adaptado a Slate:
// - un textarea que crece con el texto (Enter lanza, Shift+Enter salta de línea) y cuyo
//   desvanecido dibuja todas las líneas, con el mismo ajuste de palabras que el campo;
// - tokens de grafito y tiza en vez de la píldora blanca, e icono de Phosphor;
// - `disabled`, el valor limpio en `onSubmit` y `onVanished` al terminar de desvanecerse;
// - con prefers-reduced-motion no hay partículas: el texto se borra y listo;
// - con `onQueue`, Ctrl+Enter (o el botón +) aparta lo escrito como otra tarea y vacía el campo;
//   con tareas apartadas (`queued`), Enter lanza aunque el campo esté vacío.
type Particle = { x: number; y: number; r: number; color: string }

const PAD_X = 16 // px-4
const PAD_Y = 12 // py-3
const LINE = 24 // leading-6

export function PlaceholdersAndVanishInput({
  placeholders,
  onSubmit,
  onVanished,
  onQueue,
  queued = 0,
  disabled
}: {
  placeholders: string[]
  onSubmit: (value: string) => void
  onVanished?: () => void
  onQueue?: (value: string) => void
  queued?: number
  disabled?: boolean
}) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0)

  // Rota los ejemplos cada 3 s; se detiene con la ventana oculta.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const start = (): void => {
      clearInterval(interval)
      interval = setInterval(
        () => setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length),
        3000
      )
    }
    const onVisibility = (): void =>
      document.visibilityState === 'visible' ? start() : clearInterval(interval)
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [placeholders])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particles = useRef<Particle[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  const [value, setValue] = useState('')
  const [animating, setAnimating] = useState(false)
  useEffect(() => () => void (alive.current = false), [])

  // Pinta el texto en el canvas (a doble resolución) y lo guarda como partículas.
  const draw = useCallback(() => {
    const input = inputRef.current
    const ctx = canvasRef.current?.getContext('2d', { willReadFrequently: true })
    if (!input || !ctx) return
    const width = input.clientWidth * 2
    const height = input.scrollHeight * 2
    ctx.canvas.width = width
    ctx.canvas.height = height
    const styles = getComputedStyle(input)
    const size = parseFloat(styles.fontSize)
    ctx.font = `${size * 2}px ${styles.fontFamily}`
    ctx.fillStyle = '#FFF'
    ctx.textBaseline = 'top'

    // El mismo ajuste de palabras que el textarea, línea a línea.
    const max = width - PAD_X * 4
    const lines: string[] = []
    for (const paragraph of value.split('\n')) {
      let line = ''
      for (const word of paragraph.split(' ')) {
        const next = line ? `${line} ${word}` : word
        if (line && ctx.measureText(next).width > max) {
          lines.push(line)
          line = word
        } else line = next
      }
      lines.push(line)
    }
    lines.forEach((line, i) =>
      ctx.fillText(line, PAD_X * 2, (PAD_Y + i * LINE + (LINE - size) / 2) * 2)
    )

    const pixels = ctx.getImageData(0, 0, width, height).data
    const found: Particle[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = 4 * (y * width + x)
        if (pixels[i] && pixels[i + 1] && pixels[i + 2]) {
          found.push({
            x,
            y,
            r: 1,
            color: `rgba(${pixels[i]}, ${pixels[i + 1]}, ${pixels[i + 2]}, ${pixels[i + 3]})`
          })
        }
      }
    }
    particles.current = found
  }, [value])

  // De derecha a izquierda, cada partícula tiembla y se encoge hasta desaparecer.
  const animate = (start: number): void => {
    const frame = (pos: number): void => {
      requestAnimationFrame(() => {
        if (!alive.current) return // la capa se cerró antes de terminar
        particles.current = particles.current.filter((p) => {
          if (p.x < pos) return true
          if (p.r <= 0) return false
          p.x += Math.random() > 0.5 ? 1 : -1
          p.y += Math.random() > 0.5 ? 1 : -1
          p.r -= 0.05 * Math.random()
          return true
        })
        const ctx = canvasRef.current?.getContext('2d')
        if (ctx) {
          ctx.clearRect(pos, 0, ctx.canvas.width, ctx.canvas.height)
          for (const p of particles.current) {
            if (p.x <= pos) continue
            ctx.beginPath()
            ctx.rect(p.x, p.y, p.r, p.r)
            ctx.fillStyle = p.color
            ctx.strokeStyle = p.color
            ctx.stroke()
          }
        }
        if (particles.current.length > 0) return frame(pos - 12)
        setValue('')
        setAnimating(false)
        onVanished?.()
      })
    }
    frame(start)
  }

  const queue = (): void => {
    const text = value.trim()
    if (!text || !onQueue || animating) return
    onQueue(text)
    setValue('')
    inputRef.current?.focus()
  }

  const submit = (): void => {
    const text = value.trim()
    if ((!text && !queued) || disabled || animating) return
    onSubmit(text)
    if (!text || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue('')
      onVanished?.()
      return
    }
    setAnimating(true)
    draw()
    animate(particles.current.reduce((max, p) => Math.max(max, p.x), 0))
  }

  return (
    <MotionConfig reducedMotion="user">
      <form
        className="relative w-full"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <canvas
          ref={canvasRef}
          className={cn(
            'pointer-events-none absolute top-0 left-0 origin-top-left scale-50 invert dark:invert-0',
            animating ? 'opacity-100' : 'opacity-0'
          )}
        />
        <textarea
          ref={inputRef}
          autoFocus
          rows={1}
          value={value}
          aria-label="Tarea"
          onChange={(e) => !animating && setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (e.ctrlKey || e.metaKey) queue()
              else submit()
            }
          }}
          className={cn(
            'relative z-10 block max-h-40 min-h-12 w-full resize-none border-none bg-transparent py-3 pl-4 text-[15px] leading-6 text-foreground [field-sizing:content] focus:ring-0 focus:outline-none',
            onQueue ? 'pr-24' : 'pr-14',
            animating && 'text-transparent'
          )}
        />
        {onQueue && (
          <button
            type="button"
            onClick={queue}
            disabled={!value.trim()}
            aria-label="Añadir otra tarea"
            title="Añadir otra tarea (Ctrl+Enter)"
            className="absolute right-12 bottom-2 z-10 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <PlusIcon size={15} weight="bold" />
          </button>
        )}
        <button
          type="submit"
          disabled={(!value.trim() && !queued) || disabled}
          aria-label="Lanzar tarea"
          className="absolute right-2 bottom-2 z-10 grid size-8 place-items-center rounded-full bg-foreground text-background transition-colors duration-200 disabled:bg-accent disabled:text-muted-foreground"
        >
          <ArrowUpIcon size={15} weight="bold" />
        </button>

        <div className="pointer-events-none absolute inset-x-0 top-0">
          <AnimatePresence mode="wait">
            {!value && (
              <motion.p
                key={currentPlaceholder}
                initial={{ y: 5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -15, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'truncate py-3 pl-4 text-left text-[15px] leading-6 text-muted-foreground',
                  onQueue ? 'w-[calc(100%-6.5rem)]' : 'w-[calc(100%-4rem)]'
                )}
              >
                {placeholders[currentPlaceholder]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </form>
    </MotionConfig>
  )
}
