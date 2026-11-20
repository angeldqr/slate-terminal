import { execFile } from 'node:child_process'

// Cuánta memoria y CPU gasta cada terminal: la suma de su proceso y todo lo que cuelga de él (una
// shell que corre un agente que lanza node…). Sin imports de electron: se prueba con `npm run check`.

export type Proc = { pid: number; ppid: number; memory: number; cpu: number } // bytes y segundos
export type Usage = { memory: number; cpu: number; processes: number }

// El proceso `root` y todos sus descendientes.
export function sumTree(procs: Proc[], root: number): Usage {
  const children = new Map<number, Proc[]>()
  for (const p of procs) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p])
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  const total: Usage = { memory: 0, cpu: 0, processes: 0 }
  const seen = new Set<number>() // un pid reutilizado no debe hacer un ciclo
  const walk = (pid: number): void => {
    if (seen.has(pid)) return
    seen.add(pid)
    const p = byPid.get(pid)
    if (p) {
      total.memory += p.memory
      total.cpu += p.cpu
      total.processes++
    }
    for (const c of children.get(pid) ?? []) walk(c.pid)
  }
  walk(root)
  return total
}

const run = (cmd: string, args: string[]): Promise<string> =>
  new Promise((done, fail) =>
    execFile(cmd, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, out) =>
      err ? fail(err) : done(out)
    )
  )

// Todos los procesos del sistema con su padre, memoria (working set) y CPU acumulada.
export async function listProcesses(): Promise<Proc[]> {
  if (process.platform === 'win32') {
    const out = await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime | ConvertTo-Json -Compress'
    ])
    const rows = JSON.parse(out) as Record<string, number>[]
    return rows.map((r) => ({
      pid: Number(r.ProcessId),
      ppid: Number(r.ParentProcessId),
      memory: Number(r.WorkingSetSize) || 0,
      cpu: ((Number(r.KernelModeTime) || 0) + (Number(r.UserModeTime) || 0)) / 1e7 // 100 ns → s
    }))
  }
  const out = await run('ps', ['-A', '-o', 'pid=,ppid=,rss=,time='])
  return out
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c.length >= 4 && c.every(Boolean))
    .map(([pid, ppid, rss, time]) => {
      const [s = 0, m = 0, h = 0, d = 0] = time.replace('-', ':').split(':').reverse().map(Number)
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        memory: Number(rss) * 1024,
        cpu: s + m * 60 + h * 3600 + d * 86400
      }
    })
}
