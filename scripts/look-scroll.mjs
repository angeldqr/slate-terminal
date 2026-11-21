// Compara los píxeles reales del historial, sin usar una sesión de usuario ni gastar tokens.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

// PNG es un contenedor: se compara el bitmap decodificado. Una banda de color al inicio de cada
// fila fija su identidad. Para el texto solo cuentan diferencias grandes en más del 1 % del área;
// con la banda intacta, los bordes antialias no deben hacer fallar la publicación.
const compare = async (expected, actual) =>
  app.evaluate(
    ({ nativeImage }, [left, right]) => {
      const image = (data) => nativeImage.createFromBuffer(Buffer.from(data, 'base64'))
      const a = image(left)
      const b = image(right)
      const { width, height } = a.getSize()
      const size = b.getSize()
      if (!width || !height || width !== size.width || height !== size.height) return null
      const before = a.toBitmap()
      const after = b.toBitmap()
      const difference = (index) =>
        Math.max(
          Math.abs(before[index] - after[index]),
          Math.abs(before[index + 1] - after[index + 1]),
          Math.abs(before[index + 2] - after[index + 2])
        )
      let stripes = 0
      let pixels = 0
      for (let y = 0; y < height; y++) {
        // La captura empieza 2 px dentro de xterm; la banda ocupa las tres primeras celdas.
        if (difference((y * width + 4) * 4) > 12) stripes++
      }
      for (let index = 0; index < before.length; index += 4) {
        if (difference(index) > 32) pixels++
      }
      return { stripes, percent: (100 * pixels) / (width * height) }
    },
    [expected.toString('base64'), actual.toString('base64')]
  )

const sameHistory = async (expected, actual, step) => {
  const diff = await compare(expected, actual)
  assert.ok(diff, `${step}: las capturas deben tener el mismo tamaño`)
  assert.ok(
    diff.stripes === 0 && diff.percent <= 1,
    `${step}: ${diff.stripes} líneas de píxeles con otra marca de fila; ${diff.percent.toFixed(2)} % de píxeles distintos`
  )
}

// Los números de fila que se ven en una captura, leídos de la banda de color de cada una.
const rowNumbers = async (png) =>
  app.evaluate(({ nativeImage }, data) => {
    const img = nativeImage.createFromBuffer(Buffer.from(data, 'base64'))
    const { width, height } = img.getSize()
    const px = img.toBitmap() // BGRA
    const x = Math.min(4, width - 1)
    const runs = []
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4
      const color = [px[i + 2], px[i + 1], px[i]].join(',')
      if (runs.length && runs[runs.length - 1].color === color) runs[runs.length - 1].n++
      else runs.push({ color, n: 1 })
    }
    const decode = (v) => ((v - 32) % 24 === 0 && v >= 32 && v <= 200 ? (v - 32) / 24 : -1)
    return runs
      .filter((r) => r.n >= 5)
      .map((r) => {
        const [red, green, blue] = r.color.split(',').map(Number).map(decode)
        return red < 0 || green < 0 || blue < 0 ? null : red + green * 8 + blue * 64
      })
      .filter((n) => n !== null && n > 0)
  }, png.toString('base64'))

// El historial se ve en orden: cada fila es la siguiente de la anterior, sin repetidas ni saltos.
// `min`: al final de la pantalla puede quedar espacio vacío bajo la última fila tras ensanchar.
const inOrder = async (png, step, min = 15) => {
  const rows = await rowNumbers(png)
  assert.ok(rows.length >= min, `${step}: se leen las filas (${rows.length})`)
  rows
    .slice(1)
    .forEach((n, i) =>
      assert.equal(n, rows[i] + 1, `${step}: tras la fila ${rows[i]} viene la ${n}`)
    )
  return rows
}

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
      keepAlive: true, // al final se reabre Slate con la sesión viva
      cursorBlink: false,
      smoothScroll: false
    })
  )
  const open = async () => {
    app = await electron.launch({
      executablePath,
      env,
      args: [...(executablePath ? [] : ['.']), `--user-data-dir=${data}`]
    })
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 760))
    return page
  }
  let win = await open()
  await win.getByText('repo', { exact: true }).click({ button: 'right' })
  await win.getByRole('menuitem', { name: 'Claude Code' }).click()
  let terminal = win.locator('.xterm-screen:visible')
  await terminal.waitFor()
  const id = await win.evaluate(() => window.slate.sessions.list().then(([session]) => session.id))
  const command = `& ${quote(process.execPath)} ${quote(resolve('scripts/fixtures/terminal-scroll.mjs'))}\r`
  await win.evaluate(({ id, command }) => window.slate.sessions.write(id, command), { id, command })
  const hasOutput = async () =>
    (
      await win.evaluate(
        (id) => window.slate.sessions.buffer(id).then((shot) => shot?.data ?? ''),
        id
      )
    ).includes('slate-scroll-listo')
  for (let i = 0; i < 60 && !(await hasOutput()); i++) await win.waitForTimeout(100)
  assert.ok(await hasOutput(), 'la interfaz ANSI arrancó dentro de la sesión de Claude')
  await win.evaluate(() => document.fonts.ready.then(() => undefined))
  // Qué ConPTY hay detrás: la de node-pty corre su OpenConsole.exe; la del sistema, no.
  if (process.platform === 'win32') {
    const consoles = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process -Filter "Name=\'OpenConsole.exe\'" | ForEach-Object { $_.ExecutablePath }'
      ],
      { encoding: 'utf8' }
    )
      .split(/\r?\n/)
      .filter((path) => path && !/stepbro/i.test(path))
    // La del sistema pierde filas al cambiar el ancho: Slate tiene que usar la de node-pty
    // (ver scripts/conpty-dll.mjs y el aviso de host.log).
    assert.ok(consoles.length, 'Slate usa la ConPTY de node-pty, no la del sistema')
    console.log(`look:scroll: ConPTY de node-pty (${consoles.length} OpenConsole.exe)`)
  }

  const { x, y, width, height } = await terminal.boundingBox()
  // Solo compara la región que queda visible a la izquierda, incluso con el panel ensanchado.
  const clip = {
    x: Math.ceil(x) + 2,
    y: Math.ceil(y) + 2,
    width: Math.min(370, Math.floor(width - 520)),
    height: Math.min(520, Math.floor(height - 4))
  }
  assert.ok(clip.width >= 120 && clip.height >= 250, 'hay espacio para comparar el historial')
  const shot = (name, area = clip) =>
    win.screenshot({ clip: area, path: join(captures, `${name}.png`) })
  // El pie del terminal: ahí repintan la shell y ConPTY, y ahí se mezclaban las letras al reabrir.
  // Empieza unos píxeles a la derecha (aún dentro de la banda de color): en la primera celda
  // Chromium dibuja o no el cursor del campo de texto de xterm según el foco.
  const foot = { ...clip, x: clip.x + 8, y: Math.floor(y + height - 262), height: 260 }
  // Tras cambiar de tamaño, la shell y ConPTY tardan en repintar (más en la CI): se espera a que
  // la pantalla deje de cambiar antes de leerla.
  const stableShot = async (name, area) => {
    let last = await shot(name, area)
    for (let i = 0; i < 40; i++) {
      await win.waitForTimeout(250)
      const next = await shot(name, area)
      if (next.equals(last)) return next
      last = next
    }
    return last
  }
  const scroll = async (delta) => {
    await win.mouse.move(clip.x + clip.width / 2, clip.y + clip.height / 2)
    await win.mouse.wheel(0, delta)
    await win.waitForTimeout(250)
  }
  await scroll(-1400)
  const historyA = await shot('01-antes')
  await scroll(-600)
  const historyB = await shot('02-otro-tramo')
  assert.ok(
    (await compare(historyA, historyB))?.stripes > 20,
    'la rueda cambia las marcas de fila, no solo el color de algunos píxeles'
  )
  await scroll(600)
  await sameHistory(historyA, await shot('03-vuelta'), 'volver con Cambios cerrado')

  // Cambios le quita ancho al terminal: las líneas largas se reacomodan mientras está abierto. Al
  // cerrarlo, el historial tiene que volver exactamente igual: ni filas duplicadas ni mezcladas.
  const bottom = async () => {
    await win.mouse.move(clip.x + clip.width / 2, clip.y + clip.height / 2)
    for (let i = 0; i < 30; i++) await win.mouse.wheel(0, 2000) // una rueda enorme sola no llega al final
    await win.waitForTimeout(250)
  }
  // Las referencias se toman desde el final (las últimas filas y un tramo más arriba): así no
  // dependen de cuántas filas vacías deja la línea de estado debajo.
  await bottom()
  await inOrder(await stableShot('04-final-antes'), 'el final antes de abrir Cambios', 5)
  await scroll(-600)
  await inOrder(await stableShot('04-tramo-antes'), 'un tramo antes de abrir Cambios')
  for (let round = 1; round <= 3; round++) {
    await win.keyboard.press('Control+Shift+G')
    const panel = win.getByRole('complementary', { name: 'Cambios' })
    await panel.getByRole('button', { name: /diff\.txt/ }).waitFor()
    await win.waitForTimeout(400)
    assert.ok(
      (await terminal.boundingBox()).width < width,
      'con Cambios, el terminal es más estrecho'
    )
    await win.screenshot({ path: join(captures, `05-cambios-abierto-${round}.png`) })
    await win.keyboard.press('Control+Shift+G')
    await win.waitForTimeout(400)
    assert.equal((await terminal.boundingBox()).width, width, 'sin Cambios, recupera su ancho')
    await bottom()
    await inOrder(await stableShot(`06-final-tras-${round}`), `el final tras la vuelta ${round}`, 5)
    await scroll(-600)
    await inOrder(await stableShot(`07-tramo-tras-${round}`), `el tramo tras la vuelta ${round}`)
  }
  const renderer = (await terminal.locator('canvas:not([class])').count()) ? 'WebGL' : 'DOM'
  console.log(`look:scroll: el historial vuelve intacto tras abrir y cerrar Cambios (${renderer})`)

  // Slate se cierra con la sesión viva en el host y vuelve: la salida se imprimió a varios anchos,
  // pero el terminal tiene que repintarse tal como estaba, no con las letras mezcladas.
  await bottom()
  const before = await inOrder(await stableShot('08-final-antes-de-reabrir'), 'antes de reabrir', 5)
  const footBefore = await stableShot('08-pie-antes-de-reabrir', foot)
  await app.close()
  win = await open()
  terminal = win.locator('.xterm-screen:visible')
  await terminal.waitFor()
  await win.evaluate(() => document.fonts.ready.then(() => undefined))
  await terminal.click() // con el foco, como antes de cerrar: el cursor se dibuja igual
  await bottom()
  const after = await inOrder(await stableShot('09-final-reabierto'), 'al reabrir', 5)
  assert.deepEqual(after, before, 'al reabrir se ven las mismas filas que antes de cerrar')
  await sameHistory(footBefore, await stableShot('09-pie-reabierto', foot), 'el pie al reabrir')
  await scroll(-600)
  await inOrder(await stableShot('10-tramo-reabierto'), 'un tramo al reabrir')
  console.log('look:scroll: al reabrir Slate, la sesión vuelve igual que estaba')
} finally {
  const hostLog = join(data, 'host.log')
  if (existsSync(hostLog)) console.log(`host.log:\n${readFileSync(hostLog, 'utf8')}`)
  // La sesión siguió viva para reabrir: se cierra para que el host termine.
  await app
    ?.windows()[0]
    ?.evaluate(() =>
      window.slate.sessions
        .list()
        .then((list) => Promise.all(list.map((s) => window.slate.sessions.close(s.id))))
    )
    .catch(() => {})
  await app?.close()
  rmSync(data, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
}
