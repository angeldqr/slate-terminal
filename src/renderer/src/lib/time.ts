import { useEffect, useState } from 'react'

// Tiempo relativo corto: "ahora", "3 min", "2 h", "1 d".
export function ago(since: number, now: number): string {
  const s = Math.max(0, (now - since) / 1000)
  if (s < 45) return 'ahora'
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} d`
}

// Cuántos ms faltan para que `ago` cambie de texto: se avisa justo entonces, no cada tanto.
// (El patrón es el de useRelativeTimeState de T3 Code, MIT.)
export function untilChange(since: number, now: number): number {
  const s = Math.max(0, (now - since) / 1000)
  if (s < 45) return Math.ceil((45 - s) * 1000)
  const [unit, limit] = s < 3600 ? [60, 3600] : s < 86400 ? [3600, 86400] : [86400, Infinity]
  const n = Math.floor(s / unit)
  let next = (n + 0.5) * unit // donde el redondeo sube al siguiente número
  if (next <= s) next = (n + 1.5) * unit
  return Math.ceil((Math.min(next, limit) - s) * 1000) + 1
}

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
