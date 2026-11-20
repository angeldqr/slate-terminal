import { cn } from '@renderer/lib/utils'

// Marcador de lo que está cargando: un pulso por pasos (más barato que uno continuo).
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn('animate-skeleton rounded-md bg-accent/60', className)}
      aria-hidden
      {...props}
    />
  )
}
