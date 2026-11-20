// Piezas de movimiento de Slate. Basadas en las de T3 Code (MIT): AnimatedHeight, bucles que van
// al compás y que se pausan fuera de pantalla.
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@renderer/lib/utils'

// Se anima a la altura de lo que lleva dentro, cuando ese contenido cambia de tamaño.
export function AnimatedHeight({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  useEffect(() => {
    const el = inner.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <motion.div
      animate={{ height }}
      initial={false}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className={cn('overflow-hidden', className)}
    >
      <div ref={inner} className="flow-root">
        {children}
      </div>
    </motion.div>
  )
}

// Pone todas las animaciones del elemento en la misma fase (startTime = 0 del reloj del
// documento): dos puntos que laten a la vez parecen uno solo en vez de dos desfasados.
export function useSyncedAnimation<T extends HTMLElement>(
  dep?: unknown
): React.RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.getAnimations().forEach((a) => {
      if (a.effect?.getComputedTiming().iterations === Infinity) a.startTime = 0
    })
  }, [dep])
  return ref
}

// El punto que late de "algo en marcha", siempre al compás de los demás.
export function PulseDot({ className }: { className?: string }): React.JSX.Element {
  const ref = useSyncedAnimation<HTMLSpanElement>()
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn('size-1.5 animate-breathe rounded-full', className)}
    />
  )
}
