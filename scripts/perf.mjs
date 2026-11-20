// Perfil local de Windows: shells y repositorio de prueba, sin agentes ni red.
import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const exeAt = process.argv.indexOf('--exe')
const exe = exeAt < 0 ? undefined : resolve(process.argv[exeAt + 1])
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const data = mkdtempSync(join(tmpdir(), 'slate-perf-'))
const repo = join(data, 'repo')
let app
try {
  mkdirSync(repo)
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
  git('init', '-b', 'main')
  git(
    '-c',
    'user.name=Slate',
    '-c',
    'user.email=slate@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'Base'
  )
  writeFileSync(
    join(data, 'projects.json'),
    JSON.stringify([{ path: repo, name: 'repo', open: true }])
  )
  writeFileSync(
    join(data, 'prefs.json'),
    JSON.stringify({ notify: false, autoUpdate: false, keepAlive: false, shell: 'powershell' })
  )
  app = await electron.launch({
    executablePath: exe,
    env,
    args: [...(exe ? [] : ['.']), `--user-data-dir=${data}`]
  })
  const win = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 760))
  const sizes = [1, 4, 10, 20]
  const ids = []
  const results = []
  for (const size of sizes) {
    for (let i = ids.length; i < size; i++) {
      const session = await win.evaluate(
        (cwd) => window.slate.sessions.create(cwd, 'shell', { isolate: true }),
        repo
      )
      ids.push(session.id)
      writeFileSync(
        join(session.worktree.path, 'salida.txt'),
        'Slate: línea larga de prueba.\n'.repeat(80)
      )
    }
    await win.reload()
    await win.waitForFunction((n) => document.querySelectorAll('.xterm').length === n, size)
    const load = () =>
      win.evaluate((list) => {
        for (const id of list) {
          window.slate.sessions.write(
            id,
            "1..120 | ForEach-Object { Write-Host ('Slate {0:D3} {1}' -f $_, ('-' * 96)); Start-Sleep -Milliseconds 35 }\r"
          )
        }
      }, ids)
    const sample = async (scenario, action) => {
      const frames = win.evaluate(
        () =>
          new Promise((done) => {
            const intervals = []
            const start = performance.now()
            let last = start
            const tick = (now) => {
              if (now > last) intervals.push(now - last)
              last = now
              if (now - start < 5400) requestAnimationFrame(tick)
              else done(intervals)
            }
            requestAnimationFrame(tick)
          })
      )
      await load()
      await action?.()
      await win.mouse.move(450, 450)
      await win.mouse.wheel(0, -480)
      const intervals = (await frames).sort((a, b) => a - b)
      const processes = await app.evaluate(({ app }) =>
        app.getAppMetrics().map(({ type, memory, cpu }) => ({
          tipo: type,
          memoriaMiB: Math.round(memory.workingSetSize / 1024),
          cpuPct: Number(cpu.percentCPUUsage.toFixed(2))
        }))
      )
      const result = {
        sesiones: size,
        escenario: scenario,
        cuadros: intervals.length,
        p95ms: Number(intervals[Math.floor(intervals.length * 0.95)].toFixed(1)),
        cuadrosSobre33ms: intervals.filter((ms) => ms > 33.4).length,
        fps: Number(
          ((1000 * intervals.length) / intervals.reduce((sum, ms) => sum + ms, 0)).toFixed(1)
        ),
        webgl: await win.locator('.xterm-screen canvas:not([class]):visible').count(),
        procesosElectron: processes
      }
      results.push(result)
      console.log(JSON.stringify(result))
    }
    await sample('terminal y cambios', async () => {
      for (const shortcut of ['G', 'G', 'B', 'B']) {
        await win.keyboard.press(`Control+Shift+${shortcut}`)
        await win.waitForTimeout(450)
      }
    })
    await win.keyboard.press('Control+Shift+O')
    await win.getByLabel('Tablero de sesiones').waitFor()
    await sample('tablero')
    await win.keyboard.press('Control+Shift+O')
  }
  const gpu = await win.evaluate(() => window.slate.app.info().then((info) => info.gpu))
  mkdirSync('.look', { recursive: true })
  writeFileSync('.look/perf.json', JSON.stringify({ gpu, resultados: results }, null, 2))
} finally {
  await app?.close()
  rmSync(data, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
}
