// Tiempo relativo corto: "ahora", "3 min", "2 h", "1 d".
export function ago(since: number, now: number): string {
  const s = Math.max(0, Math.round((now - since) / 1000))
  if (s < 45) return 'ahora'
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} d`
}
