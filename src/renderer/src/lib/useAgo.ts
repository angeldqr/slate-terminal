import { useEffect, useState } from 'react'
import { ago, untilChange } from './time'

// "hace 3 min" que se actualiza solo, en el instante exacto en que cambia.
export function useAgo(since: number): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // Con un `since` nuevo (cambió de estado) se parte de la hora de ahora, no de la guardada.
    const current = Date.now()
    const timer = setTimeout(() => setNow(Date.now()), untilChange(since, current))
    return () => clearTimeout(timer)
  }, [since, now])
  return ago(since, Math.max(now, since))
}
