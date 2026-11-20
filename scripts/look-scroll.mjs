// Compara los píxeles reales del historial, sin usar una sesión de usuario ni gastar tokens.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const exeAt = process.argv.indexOf('--exe')
const executablePath = exeAt < 0 ? undefined : resolve(process.argv[exeAt + 1])
const data = mkdtempSync(join(tmpdir(), 'slate-scroll-'))
const repo = join(data, 'repo')
const bin = join(data, 'bin')
const captures = resolve('.look/scroll/verificado')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
env[pathKey] = `${bin}${delimiter}${env[pathKey] ?? ''}`
const quote = (value) => `'${value.replaceAll("'", "''")}'`
let app

try {
  mkdirSync(repo)
  mkdirSync(bin)
  mkdirSync(captures, { recursive: true })
  writeFileSync(join(bin, 'claude.cmd'), '@echo off\r\nexit /b 0\r\n')
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
  writeFileSync(join(repo, 'diff.txt'), 'Un archivo para el panel de Cambios.\n'.repeat(100))
  writeFileSync(
    join(data, 'projects.json'),
    JSON.stringify([{ path: repo, name: 'repo', open: true }])
  )
  writeFileSync(
    join(data, 'prefs.json'),
    JSON.stringify({
      notify: false,
      autoUpdate: false,
      keepAlive: false,
      cursorBlink: false,
      smoothScroll: false
    })
  )
  app = await electron.launch({
    executablePath,
    env,
    args: [...(executablePath ? [] : ['.']), `--user-data-dir=${data}`]
  })
  const win = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 760))
  await win.getByText('repo', { exact: true }).click({ button: 'right' })
  await win.getByRole('menuitem', { name: 'Claude Code' }).click()
  const terminal = win.locator('.xterm-screen:visible')
  await terminal.waitFor()
  const id = await win.evaluate(() => window.slate.sessions.list().then(([session]) => session.id))
  const command = `& ${quote(process.execPath)} ${quote(resolve('scripts/fixtures/terminal-scroll.mjs'))}\r`
  await win.evaluate(({ id, command }) => window.slate.sessions.write(id, command), { id, command })
  const hasOutput = async () =>
    (await win.evaluate((id) => window.slate.sessions.buffer(id), id)).includes(
      'slate-scroll-listo'
    )
  for (let i = 0; i < 60 && !(await hasOutput()); i++) await win.waitForTimeout(100)
  assert.ok(await hasOutput(), 'la interfaz ANSI arrancó dentro de la sesión de Claude')

  const { x, y, width, height } = await terminal.boundingBox()
  // Solo compara la región que queda visible a la izquierda, incluso con el panel ensanchado.
  const clip = {
    x: Math.ceil(x) + 2,
    y: Math.ceil(y) + 2,
    width: Math.min(370, Math.floor(width - 520)),
    height: Math.min(520, Math.floor(height - 4))
  }
  assert.ok(clip.width >= 120 && clip.height >= 250, 'hay espacio para comparar el historial')
  const shot = (name) => win.screenshot({ clip, path: join(captures, `${name}.png`) })
  const scroll = async (delta) => {
    await win.mouse.move(clip.x + clip.width / 2, clip.y + clip.height / 2)
    await win.mouse.wheel(0, delta)
    await win.waitForTimeout(250)
  }
  await scroll(-1400)
  const historyA = await shot('01-antes')
  await scroll(-600)
  const historyB = await shot('02-otro-tramo')
  assert.ok(!historyA.equals(historyB), 'la rueda muestra dos tramos distintos del historial')
  await scroll(600)
  assert.ok(
    historyA.equals(await shot('03-vuelta')),
    'el scroll con Cambios cerrado conserva el dibujo'
  )

  await win.keyboard.press('Control+Shift+G')
  const panel = win.getByRole('complementary', { name: 'Cambios' })
  await panel.getByRole('button', { name: /diff\.txt/ }).waitFor()
  await win.waitForTimeout(350)
  const opened = await shot('04-cambios-abierto')
  const openedWidth = (await terminal.boundingBox()).width
  await scroll(-600)
  const scrolled = await shot('05-scroll-con-cambios')
  await win.keyboard.press('Control+Shift+G')
  await win.waitForTimeout(350)
  const closed = await shot('06-cambios-cerrado')
  await scroll(600)
  const returned = await shot('07-historial-final')
  assert.equal(openedWidth, width, 'Cambios no debe renegociar las columnas con el agente')
  assert.ok(historyA.equals(opened), 'abrir Cambios mantiene los píxeles del historial visible')
  assert.ok(
    historyB.equals(scrolled),
    'hacer scroll con Cambios abierto muestra el mismo historial'
  )
  assert.ok(historyB.equals(closed), 'cerrar Cambios conserva el tramo al que se hizo scroll')
  assert.ok(historyA.equals(returned), 'las filas ANSI siguen intactas al regresar')
  await win.keyboard.press('Control+Shift+G')
  const handle = panel.getByRole('separator', { name: 'Ancho del panel de cambios' })
  const originalPanel = (await panel.boundingBox()).width
  await handle.press('ArrowLeft')
  assert.ok((await panel.boundingBox()).width > originalPanel, 'el divisor ensancha solo el panel')
  assert.equal((await terminal.boundingBox()).width, width)
  await win.waitForTimeout(350)
  assert.ok(
    historyA.equals(await shot('08-panel-mas-ancho')),
    'ensanchar el panel conserva la vista'
  )
  await win.screenshot({ path: join(captures, '09-panel-y-terminal.png') })
  const renderer = (await terminal.locator('canvas:not([class])').count()) ? 'WebGL' : 'DOM'
  console.log(`look:scroll: historial ANSI idéntico con renderer ${renderer}`)
} finally {
  await app?.close()
  rmSync(data, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
}
