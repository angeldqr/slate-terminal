import { cn } from '@renderer/lib/utils'

// Un estado vacío: tres tarjetas en abanico (lo que Slate pone en pantalla cuando hay trabajo),
// un título que dice qué falta y una frase que dice cómo seguir. Las acciones van de hijos.
export function Empty({
  title,
  text,
  compact,
  children
}: {
  title: string
  text: string
  compact?: boolean
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="relative max-w-sm px-6 text-center">
      <div
        aria-hidden
        className={cn('relative mx-auto h-20 w-40', compact ? 'mb-5 scale-75' : 'mb-8')}
      >
        {[-9, 0, 9].map((deg, i) => (
          <div
            key={deg}
            style={{ rotate: `${deg}deg`, translate: `${deg * 3.2}px ${Math.abs(deg) * 0.7}px` }}
            className={cn(
              'glass absolute inset-x-6 top-0 h-16 rounded-lg p-2.5',
              i === 1 && 'z-10'
            )}
          >
            <div className="h-1.5 w-1/2 rounded-full bg-foreground/25" />
            <div className="mt-2 h-1.5 w-3/4 rounded-full bg-foreground/10" />
            <div className="mt-1.5 h-1.5 w-2/5 rounded-full bg-foreground/10" />
          </div>
        ))}
      </div>
      <h1 className={cn('font-semibold tracking-tight', compact ? 'text-[15px]' : 'text-[20px]')}>
        {title}
      </h1>
      <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
      {children}
    </div>
  )
}
