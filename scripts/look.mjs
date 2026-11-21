// Abre Slate ya compilado como lo usaría una persona, guarda capturas en .look/ y prueba los hooks.
// Usa su propia carpeta de datos (.look/data) para no tocar la del usuario.
import { _electron as electron } from 'playwright'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { connect } from 'node:net'
import { basename, delimiter, join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const data = resolve('.look/data')

// Con --exe <ruta> se prueba un Slate empaquetado (asar, host desde slate.exe) en vez del compilado.
const exeAt = process.argv.indexOf('--exe')
const exe = exeAt > 0 ? resolve(process.argv[exeAt + 1]) : null
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
// Los hooks y el MCP son reales; el comando es una fixture local que no abre un agente ni usa red.
const bin = join(data, 'bin')
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
env[pathKey] = `${bin}${delimiter}${env[pathKey] ?? ''}`
// Justo tras cerrar, el Slate anterior puede no haber soltado aún el candado de instancia única:
// el nuevo cede y se va sin ventana. Se reintenta.
const launchApp = async () => {
  for (let i = 0; ; i++) {
    const a = await (exe
      ? electron.launch({ executablePath: exe, env, args: [`--user-data-dir=${data}`] })
      : electron.launch({ env, args: ['.', `--user-data-dir=${data}`] }))
    try {
      await a.firstWindow()
      return a
    } catch (err) {
      await a.close().catch(() => {}) // si sigue vivo por otra causa, no se queda suelto
      if (i === 2) throw err
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

// El host de sesiones de esta carpeta de datos (ver host-protocol.ts).
const hostPipe = () => {
  const tag = createHash('sha256').update(data.toLowerCase()).digest('hex').slice(0, 16)
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\slate-host-${tag}`
    : join(data, `host-${tag}.sock`)
}
const hostUp = () =>
  new Promise((done) => {
    const sock = connect(hostPipe())
    sock.once('connect', () => (sock.destroy(), done(true)))
    sock.once('error', () => done(false))
  })

// Una ejecución anterior que falló a medias pudo dejar su host vivo con sesiones (Playwright
// mata Slate de golpe): se apaga con su token antes de empezar.
if (await hostUp()) {
  const sock = connect(hostPipe())
  await new Promise((done) => sock.once('connect', done))
  const token = readFileSync(join(data, 'host-token'), 'utf8').trim()
  sock.write(JSON.stringify({ t: 'hello', token, protocol: 2 }) + '\n')
  sock.write(JSON.stringify({ t: 'shutdown' }) + '\n')
  for (let i = 0; i < 40 && (await hostUp()); i++) await new Promise((r) => setTimeout(r, 200))
  sock.destroy()
}
rmSync(data, { recursive: true, force: true })
mkdirSync(data, { recursive: true })
mkdirSync(bin)
writeFileSync(join(bin, 'claude.cmd'), '@echo off\r\nexit /b 0\r\n')
const repo = process.cwd()
writeFileSync(
  join(data, 'projects.json'),
  JSON.stringify([{ path: repo, name: basename(repo), open: true }])
)
// Sin avisos del sistema: los hooks de prueba llegan con la ventana sin foco.
// Sin mantener sesiones al salir: cada cierre deja el equipo limpio (la persistencia se prueba al final).
writeFileSync(
  join(data, 'prefs.json'),
  JSON.stringify({ notify: false, keepAlive: false, autoUpdate: false })
)

const app = await launchApp()
const win = await app.firstWindow()
win.on('pageerror', (e) => console.error('renderer:', e.message))
const shot = (name) => win.screenshot({ path: `.look/${name}.png` })

await win.getByText(`Todo listo en ${basename(repo)}`).waitFor()
await win.waitForTimeout(600) // deja que aparezcan los puntos del fondo
await shot('vacio')
console.log('· estado vacío')

// Barra superior escondida: crece al acercar el puntero arriba y vuelve a esconderse al irse.
const barHeight = () =>
  win.evaluate(() => document.querySelector('header').getBoundingClientRect().height)
assert.equal(await barHeight(), 8, 'escondida mide 8 px')
await win.mouse.move(600, 300)
await win.mouse.move(600, 3, { steps: 4 })
await win.waitForFunction(
  () => document.querySelector('header').getBoundingClientRect().height === 36
)
await win.waitForTimeout(250)
await shot('barra-superior')
await win.mouse.move(600, 400, { steps: 4 })
await win.waitForFunction(
  () => document.querySelector('header').getBoundingClientRect().height === 8
)
console.log('· la barra superior aparece y se esconde')

await win.getByRole('button', { name: 'Nueva shell' }).click()
await win.waitForSelector('.xterm-screen')
await win.waitForTimeout(1500) // la shell tarda en pintar el prompt
await shot('shell')
console.log('· shell abierta')

const projectToggle = win
  .getByRole('navigation')
  .getByRole('button', { name: basename(repo), exact: true })
await projectToggle.focus()
await win.keyboard.press('Enter')
await projectToggle.getAttribute('aria-expanded').then((value) => assert.equal(value, 'false'))
assert.equal(
  await win.locator('nav [data-status]').count(),
  0,
  'la carpeta plegada desmonta sus filas'
)
assert.equal(await projectToggle.evaluate((el) => el === document.activeElement), true)
await win.keyboard.press('Space')
await win.locator('nav [data-status]').waitFor()

// Paneles: dividir a la derecha desde el menú y abajo desde la cabecera del panel nuevo.
const visibleTerminals = () => win.locator('.xterm-screen:visible').count()
// Marca el nodo del primer terminal: si dividir o cerrar lo recreara, la marca desaparecería.
await win.evaluate(() => (document.querySelector('.xterm').dataset.marca = 'original'))
await win.locator('[data-status]').filter({ hasText: 'Shell' }).click({ button: 'right' })
await win.getByRole('menuitem', { name: 'Dividir a la derecha' }).click()
await win.getByRole('button', { name: 'Dividir abajo' }).nth(1).click()
await win.waitForFunction(() => document.querySelectorAll('.xterm-screen').length === 3)
assert.equal(await visibleTerminals(), 3, 'tres paneles visibles')
assert.equal(
  await win.locator('nav .rounded-md.border [data-status]').count(),
  3,
  'la barra lateral agrupa las tres sesiones de la vista'
)
console.log('· dividir: derecha y abajo')

// Arrastrar el divisor vertical cambia el reparto del espacio.
const divider = win.locator('[role="separator"][aria-orientation="vertical"]')
const before = (await win.locator('.xterm-screen').first().boundingBox()).width
const box = await divider.boundingBox()
// A un cuarto de altura: en el medio se cruza con el divisor horizontal de la derecha.
await win.mouse.move(box.x, box.y + box.height / 4)
await win.mouse.down()
await win.mouse.move(box.x - 200, box.y + box.height / 4, { steps: 5 })
await win.mouse.up()
await win.waitForTimeout(200)
const after = (await win.locator('.xterm-screen').first().boundingBox()).width
assert.ok(after < before - 100, `el divisor redimensiona (${before} → ${after})`)
await win.waitForTimeout(800) // las shells nuevas pintan su prompt
await shot('split')
console.log('· divisor arrastrable')

// Con el teclado: la flecha a la derecha agranda el panel izquierdo.
const valueBefore = Number(await divider.getAttribute('aria-valuenow'))
await divider.focus()
await win.keyboard.press('ArrowRight')
assert.equal(
  Number(await divider.getAttribute('aria-valuenow')),
  valueBefore + 5,
  'el divisor se mueve con flechas'
)
console.log('· divisor con teclado')

// Cerrar desde la cabecera colapsa la división hasta volver a un solo panel.
await win.getByRole('button', { name: 'Cerrar sesión' }).last().click()
await win.getByRole('button', { name: 'Cerrar sesión' }).last().click()
await win.waitForFunction(() => document.querySelectorAll('.xterm-screen').length === 1)
assert.equal(
  await win.getByRole('button', { name: 'Cerrar sesión' }).count(),
  0,
  'un solo panel sin cabecera'
)
assert.equal(
  await win.locator('[data-marca="original"]').count(),
  1,
  'el primer terminal nunca se recreó'
)
console.log('· cerrar paneles colapsa la división')

// Paleta: Ctrl+Shift+P desde el terminal, con morph desde el botón Buscar; Enter ejecuta la acción.
const sessionCount = () => win.evaluate(async () => (await window.slate.sessions.list()).length)
// waitForFunction no espera una función async (la promesa cuenta como "verdadera"): se sondea aquí.
const waitSessions = async (n) => {
  for (let i = 0; i < 100; i++) {
    if ((await sessionCount()) === n) return
    await win.waitForTimeout(50)
  }
  assert.fail(`se esperaban ${n} sesiones y hay ${await sessionCount()}`)
}
const searchButton = win.locator('[data-blendy-from="palette"]')
await win.locator('.xterm').first().click()
await win.keyboard.press('Control+Shift+P')
await win.waitForTimeout(90)
await shot('paleta-morph')
await win.getByPlaceholder('Busca una sesión, carpeta o acción…').waitFor()
await win.waitForTimeout(450)
await shot('paleta')
await win.keyboard.type('nueva shell')
await win.keyboard.press('Enter')
await waitSessions(2)
await win.locator('[data-blendy-to]').waitFor({ state: 'detached' })
assert.equal(
  await searchButton.evaluate((el) => getComputedStyle(el).opacity),
  '1',
  'Buscar vuelve a verse'
)
console.log('· paleta: Ctrl+Shift+P, buscar y ejecutar')

// Atajos con el foco en el terminal: Ctrl+Shift no le quita teclas a la shell.
const sidebarWidth = () =>
  win.evaluate(() => document.querySelector('aside').getBoundingClientRect().width)
await win.keyboard.press('Control+Shift+B')
await win.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 0)
await win.keyboard.press('Control+Shift+B')
await win.waitForFunction(
  () => document.querySelector('aside').getBoundingClientRect().width === 240
)
assert.equal(await sidebarWidth(), 240)
console.log('· Ctrl+Shift+B pliega y despliega la barra lateral')

// Plegada, la barra sale flotando al llevar el puntero al borde izquierdo y se va al salir.
await win.keyboard.press('Control+Shift+B')
await win.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 0)
await win.mouse.move(300, 300)
await win.mouse.move(1, 300, { steps: 4 })
const floating = win.locator('aside[aria-label="Barra lateral"]')
await floating.waitFor()
await win.waitForTimeout(250)
await shot('barra-flotante')
await win.mouse.move(700, 300, { steps: 4 })
await floating.waitFor({ state: 'detached' })
await win.keyboard.press('Control+Shift+B')
await win.waitForFunction(
  () => document.querySelector('aside').getBoundingClientRect().width === 240
)
console.log('· la barra plegada sale flotando desde el borde')

// Desde la paleta, "Buscar en el terminal" deja el foco en el campo de búsqueda, no en el terminal.
await win.locator('.xterm:visible').first().click()
await win.keyboard.press('Control+Shift+P')
await win.keyboard.type('buscar en el terminal')
await win.keyboard.press('Enter')
await win.waitForFunction(
  () => document.activeElement?.getAttribute('aria-label') === 'Buscar en el terminal'
)
await win.keyboard.press('Escape')
console.log('· acción de la paleta conserva su foco')

await win.keyboard.press('Control+Shift+F')
await win.getByLabel('Buscar en el terminal').waitFor()
await shot('buscar')
await win.keyboard.press('Escape')
await win.getByLabel('Buscar en el terminal').waitFor({ state: 'detached' })
console.log('· Ctrl+Shift+F abre la búsqueda y Escape la cierra')

// Ctrl+1 salta a la primera sesión de la barra lateral.
await win.keyboard.press('Control+1')
// El primer terminal lleva la marca puesta al principio: con Ctrl+1 es el visible, con Ctrl+2 no.
const markedVisible = () =>
  win.evaluate(() => document.querySelector('[data-marca]').offsetWidth > 0)
await win.waitForFunction(() => document.querySelector('[data-marca]').offsetWidth > 0)
await win.keyboard.press('Control+2')
await win.waitForFunction(() => document.querySelector('[data-marca]').offsetWidth === 0)
assert.equal(await markedVisible(), false)
console.log('· Ctrl+1 y Ctrl+2 saltan a la sesión de esa posición')

await win.keyboard.press('Control+Shift+W')
await waitSessions(1)
console.log('· Ctrl+Shift+W cierra la sesión activa')

// Menú de nueva sesión: sale del botón del pie con morph.
await win.locator('[data-blendy-from="new-session"]').click()
await win.waitForTimeout(450)
await shot('nueva-sesion')
await win.getByRole('option', { name: 'Nueva shell' }).click()
await waitSessions(2)
await win.keyboard.press('Control+Shift+W')
await waitSessions(1)
assert.equal(await sessionCount(), 1)
console.log('· menú de nueva sesión desde el pie')

// Clic derecho en la carpeta → Claude Code, como lo haría el usuario.
await win.getByText(basename(repo), { exact: true }).click({ button: 'right' })
await win.waitForTimeout(250) // deja terminar el fundido de entrada
await shot('menu-carpeta')
await win.getByRole('menuitem', { name: 'Claude Code' }).click()
// Crearla pasa por el host de sesiones: se espera a que aparezca.
let claude
for (let i = 0; i < 80 && !claude; i++) {
  claude = (await win.evaluate(() => window.slate.sessions.list())).find((s) => s.kind === 'claude')
  if (!claude) await win.waitForTimeout(100)
}
assert.ok(claude, 'se creó la sesión de Claude Code')
console.log('· sesión de Claude Code creada')

// Imita los hooks de Claude Code y mira el trazo de tiza en la barra lateral.
const settings = JSON.parse(readFileSync(join(data, 'hooks', `${claude.id}.json`), 'utf8'))
const url = settings.hooks.Stop[0].hooks[0].url
const row = win.locator('[data-status]').filter({ hasText: 'Claude Code' })
for (const [event, expected] of [
  ['UserPromptSubmit', 'working'],
  ['Notification', 'attention'],
  ['PreToolUse', 'working'],
  ['Stop', 'done']
]) {
  await fetch(url, { method: 'POST', body: JSON.stringify({ hook_event_name: event }) })
  await row.and(win.locator(`[data-status="${expected}"]`)).waitFor({ timeout: 3000 })
  console.log(`· ${event} → ${expected}`)
  if (expected === 'attention') {
    await win.waitForTimeout(600) // deja terminar el latido
    await win.screenshot({
      path: '.look/atencion.png',
      clip: { x: 0, y: 36, width: 240, height: 100 }
    })
  }
}
const forged = await fetch(url.replace(/hooks\/\w+/, 'hooks/token-falso'), {
  method: 'POST',
  body: '{}'
})
assert.equal(forged.status, 404, 'un token falso se rechaza')

// "Terminó sin leer" (azul) no debe tapar un "te necesita" (ámbar) posterior.
const hook = (name) =>
  fetch(url, { method: 'POST', body: JSON.stringify({ hook_event_name: name }) })
await win.locator('[data-status]').filter({ hasText: 'Shell' }).click()
await hook('UserPromptSubmit')
await hook('Stop')
await row.and(win.locator('[data-unread="true"]')).waitFor({ timeout: 3000 })
await hook('Notification')
await row
  .and(win.locator('[data-status="attention"][data-unread="false"]'))
  .waitFor({ timeout: 3000 })
console.log('· el ámbar gana al azul de sin leer')

// Orquestación: el MCP que Slate le da a Claude Code, usado con el cliente oficial del SDK.
// La sesión usa el comando de prueba local; no hace falta una cuenta ni tener instalado el agente.
const mcpConfig = JSON.parse(readFileSync(join(data, 'hooks', `${claude.id}.mcp.json`), 'utf8'))
const mcpUrl = mcpConfig.mcpServers.slate.url
const mcpAs = async (id) => {
  const client = new Client({ name: 'look', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl.replace(claude.id, id))))
  return client
}
const call = async (client, name, args = {}) => {
  const res = await client.callTool({ name, arguments: args })
  return { text: res.content[0].text, error: !!res.isError }
}
const asClaude = await mcpAs(claude.id)
assert.deepEqual((await asClaude.listTools()).tools.map((t) => t.name).sort(), [
  'get_changes',
  'list_sessions',
  'new_task',
  'read_screen',
  'report',
  'send_to_session',
  'wait_for_status'
])
assert.match(
  (await call(asClaude, 'list_sessions')).text,
  /title: Claude Code[\s\S]*\(you\)|\(you\)[\s\S]*title: Claude Code/
)

// new_task abre una shell (sin rama: este es el repo de Slate) que aparece en Slate con su aviso.
const started = await call(asClaude, 'new_task', {
  prompt: 'eco',
  agents: ['shell'],
  isolate: false
})
const childId = started.text.match(/id: (\S+)/)[1]
const childTitle = started.text.match(/title: (.+)/)[1]
await win.getByText(`Claude Code abrió ${childTitle}`).waitFor({ timeout: 5000 })
await win.locator(`[data-status][title="Lanzada por Claude Code"]`).waitFor({ timeout: 5000 })

// send_to_session escribe como una persona; read_screen ve lo que salió.
assert.equal(
  (await call(asClaude, 'send_to_session', { id: childId, text: 'echo hola-mcp' })).error,
  false
)
let screen = ''
for (let i = 0; i < 40 && !/^hola-mcp$/m.test(screen); i++) {
  await win.waitForTimeout(150)
  screen = (await call(asClaude, 'read_screen', { id: childId, lines: 20 })).text
}
assert.match(screen, /^hola-mcp$/m, 'la salida del comando se lee en texto plano')

// Una sesión lanzada también puede lanzar; report le llega a quien la lanzó.
const asChild = await mcpAs(childId)
const grand = await call(asChild, 'new_task', {
  prompt: 'echo inicio',
  agents: ['shell'],
  isolate: false
})
const grandId = grand.text.match(/id: (\S+)/)[1]
const asGrand = await mcpAs(grandId)
// Más abajo ya no: la cadena de lanzamientos tiene tope.
assert.equal(
  (await call(asGrand, 'new_task', { prompt: 'echo x', agents: ['shell'], isolate: false })).error,
  true
)
assert.match((await call(asGrand, 'report', { message: 'listo' })).text, /Reported/)
screen = ''
for (let i = 0; i < 40 && !/\[Slate · .+\] listo/.test(screen); i++) {
  await win.waitForTimeout(150)
  screen = (await call(asClaude, 'read_screen', { id: childId, lines: 20 })).text
}
assert.match(screen, /\[Slate · .+\] listo/, 'el reporte llega a la sesión que la lanzó')

// wait_for_status: vuelve al agotar el tiempo, y con el estado cuando llega (una campana deja la
// shell en "te necesita"). Nadie se escribe a sí mismo; sin padre no hay reporte.
assert.match(
  (await call(asClaude, 'wait_for_status', { id: childId, until: ['done'], timeout_seconds: 1 }))
    .text,
  /^still /
)
const bell = call(asClaude, 'wait_for_status', {
  id: childId,
  until: ['attention'],
  timeout_seconds: 15
})
await call(asClaude, 'send_to_session', { id: childId, text: 'Write-Host "campana$([char]7)"' })
assert.equal((await bell).text, 'attention')
assert.equal((await call(asClaude, 'send_to_session', { id: claude.id, text: 'x' })).error, true)
assert.equal((await call(asClaude, 'report', { message: 'x' })).error, true)
assert.equal((await call(asClaude, 'get_changes', { id: childId })).error, false)
console.log('· orquestación por MCP: lanzar, escribir, leer, reportar y esperar')

// Se cierran las dos shells lanzadas: el resto del recorrido cuenta con las sesiones de antes.
const closedWait = call(asClaude, 'wait_for_status', { id: grandId, timeout_seconds: 20 })
for (const id of [grandId, childId]) {
  const title = (await win.evaluate(() => window.slate.sessions.list())).find(
    (x) => x.id === id
  ).title
  await win.locator('[data-status]').filter({ hasText: title }).first().click()
  await win.keyboard.press('Control+Shift+W')
  await win.locator('[data-status]').filter({ hasText: title }).waitFor({ state: 'detached' })
}
assert.match((await closedWait).text, /was closed/, 'cerrar durante una espera la termina')

// WebGL solo en lo que se ve: un terminal oculto no guarda un contexto de la GPU (hay unos 16).
const canvases = await win.evaluate(() =>
  [...document.querySelectorAll('.xterm')].map((x) => ({
    hidden: !!x.closest('.hidden'),
    webgl: x.querySelectorAll('canvas:not([class])').length > 0 // los del renderer WebGL
  }))
)
assert.ok(
  canvases.some((c) => c.hidden),
  'hay terminales ocultas en esta prueba'
)
assert.ok(
  canvases.filter((c) => c.hidden).every((c) => !c.webgl),
  'las ocultas no tienen contexto WebGL'
)
// Las visibles sí lo tienen, siempre que Chromium ofrezca WebGL en esta máquina.
const gpuInfo = await win.evaluate(() => window.slate.app.info().then((i) => i.gpu))
if (gpuInfo.on && /^enabled/.test(gpuInfo.webgl))
  assert.ok(
    canvases.filter((c) => !c.hidden).every((c) => c.webgl),
    'las visibles usan WebGL'
  )
console.log(
  `· GPU: WebGL solo en lo visible (${canvases.filter((c) => c.webgl).length} de ${canvases.length})`
)

// Ajustes: el engranaje se transforma en el panel y cada cambio llega al terminal en vivo.
const overlayOpen = () => win.locator('[data-blendy-to]').count()
await win.evaluate(() =>
  document.querySelectorAll('.xterm').forEach((x) => (x.dataset.marca = 'antes'))
)
await win.locator('[data-blendy-from="settings"]').click()
await win.waitForTimeout(150)
await shot('ajustes-morph')
await win.getByRole('heading', { name: 'Apariencia' }).waitFor()
await win.waitForTimeout(500)
await shot('ajustes')
await win.getByRole('radio', { name: 'Claro' }).click()
await win.waitForFunction(() => document.documentElement.dataset.theme === 'light')
await win.waitForTimeout(250)
await shot('tema-circulo') // a mitad de la revelación
await win.waitForTimeout(600)
await shot('ajustes-claro')
console.log('· ajustes: morph desde el engranaje y tema claro')

await win.getByRole('button', { name: 'Terminal', exact: true }).click()
await win.getByRole('heading', { name: 'Terminal' }).waitFor()
await win.getByRole('slider', { name: 'Tamaño' }).focus()
for (let i = 0; i < 3; i++) await win.keyboard.press('ArrowRight')
await win.getByRole('radio', { name: 'Bloque' }).click()
await win.waitForTimeout(500)
await shot('ajustes-terminal')
assert.ok(
  await win.evaluate(() => [...document.querySelectorAll('.xterm')].every((x) => x.dataset.marca)),
  'los terminales cambian sin recrearse'
)
await win.waitForTimeout(300) // se guarda cuando se calma
const saved = JSON.parse(readFileSync(join(data, 'prefs.json'), 'utf8'))
assert.equal(saved.fontSize, 16)
assert.equal(saved.cursorStyle, 'block')
assert.equal(saved.notify, false, 'conserva lo que ya había')
console.log('· ajustes: tamaño y cursor en vivo y guardados')

await win.getByRole('button', { name: 'Avanzado', exact: true }).click()
await win.getByText(/^En marcha con \d+ terminal/).waitFor()
await win.getByText(data, { exact: true }).waitFor() // la carpeta de datos
await win.waitForTimeout(300)
await shot('ajustes-avanzado')
await win.getByRole('switch', { name: 'Aceleración por GPU' }).waitFor()
await win.getByText(/^(Activa|Encendida|Apagada)/).waitFor()
console.log('· ajustes: avanzado muestra la GPU, el host en marcha y la carpeta de datos')

// Avanzado: la tabla de procesos con su botón Detener y el acceso a los registros.
await win.getByRole('columnheader', { name: 'Proceso' }).waitFor()
await win.getByRole('button', { name: 'Detener', exact: true }).first().waitFor({ timeout: 8000 })
await win
  .getByRole('cell', { name: /^\d+ MB$/ })
  .first()
  .waitFor({ timeout: 15000 }) // datos reales
await win.getByRole('button', { name: 'Abrir registros' }).waitFor()
console.log('· avanzado: procesos y registros')

// Buscador de ajustes: salta a la sección de lo que se busca.
const search = win.getByRole('textbox', { name: 'Buscar ajustes' })
await search.fill('cursor')
await win.getByRole('button', { name: /^Forma/ }).click()
await win.getByRole('radio', { name: 'Bloque' }).waitFor()
await search.fill('aceleracion')
await shot('ajustes-buscar')
await win.getByRole('button', { name: /^Aceleración por GPU/ }).click()
await win.getByRole('switch', { name: 'Aceleración por GPU' }).waitFor()
await search.fill('zzzz')
await win.getByText('Ningún ajuste coincide con tu búsqueda.').waitFor()
await search.fill('')
console.log('· ajustes: el buscador salta a la fila')

// Atajos editables: grabar uno nuevo, el aviso de conflicto con reasignar, y restablecer.
await win.getByRole('button', { name: 'Atajos', exact: true }).click()
const sidebarKey = win.getByRole('button', {
  name: 'Cambiar el atajo de mostrar u ocultar la barra lateral'
})
await sidebarKey.click()
await win.keyboard.press('Control+Shift+P') // el de la paleta
await win.getByText(/Ya lo usa «Paleta de comandos»/).waitFor()
await win.getByRole('button', { name: 'Cancelar' }).click()
await sidebarKey.click()
await win.keyboard.press('Control+Shift+Y')
await win.getByRole('button', { name: 'Restablecer mostrar u ocultar la barra lateral' }).waitFor()
await shot('ajustes-atajos')
await win.getByRole('button', { name: 'Restablecer mostrar u ocultar la barra lateral' }).click()
console.log('· ajustes: atajos editables con aviso de conflicto')

// Tema de VS Code: se pega, se importa y se puede quitar.
await win.getByRole('button', { name: 'Terminal', exact: true }).click()
await win.getByRole('button', { name: 'Importar…' }).click()
await win
  .getByRole('textbox', { name: 'Tema de VS Code' })
  .fill(
    '{ // prueba\n "colors": { "terminal.background": "#101820", "terminal.ansiRed": "#f00", }, }'
  )
await win.getByRole('button', { name: 'Importar', exact: true }).click()
await win.getByRole('button', { name: 'Quitar' }).waitFor()
await win.waitForTimeout(300)
await shot('ajustes-tema-vscode')
await win.getByRole('button', { name: 'Quitar' }).click()
await win.getByRole('button', { name: 'Importar…' }).waitFor()
console.log('· ajustes: importar y quitar un tema de VS Code')

// Un tema gris de cada modo: Pizarra tiñe el terminal y la interfaz; el botón de la fila lo
// devuelve a su valor.
await win.getByRole('button', { name: 'Apariencia', exact: true }).click()
await win.getByRole('radio', { name: 'Pizarra' }).click()
await win.waitForTimeout(700)
const tokens = () =>
  win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background'))
assert.equal((await tokens()).trim(), '#0d1117', 'el tema gris llega a la interfaz')
await shot('ajustes-pizarra')
await win.getByRole('radio', { name: 'Grafito' }).click()
await win.waitForTimeout(600)
assert.equal((await tokens()).trim(), '#0a0a0a')
// Tamaño de la interfaz: el zoom cambia y el botón de restablecer lo devuelve al 100 %.
await win.getByRole('slider', { name: 'Tamaño de la interfaz' }).focus()
await win.keyboard.press('ArrowRight')
await win.waitForTimeout(300)
assert.equal(
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()
  ),
  1.05
)
await win.getByRole('button', { name: 'Restablecer tamaño de la interfaz' }).click()
await win.waitForTimeout(300)
assert.equal(
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()
  ),
  1
)
console.log('· ajustes: temas grises y tamaño de la interfaz con restablecer')

await win.getByRole('button', { name: 'Terminal', exact: true }).click()
await win.waitForTimeout(400)
await shot('ajustes-terminal-2')
await win.getByRole('button', { name: 'Cambios', exact: true }).click()
await win.getByRole('slider', { name: 'Tamaño del código' }).waitFor()
await win.waitForTimeout(400)
await shot('ajustes-cambios')
await win.getByRole('button', { name: 'Actualizaciones', exact: true }).click()
await win.getByText(/copia de desarrollo|Mira si hay una versión nueva/).waitFor()
await win.waitForTimeout(400)
await shot('ajustes-actualizaciones')
console.log('· ajustes: terminal, cambios y actualizaciones')

await win.getByRole('button', { name: 'Apariencia', exact: true }).click()
const reduceMotion = win.getByRole('switch', { name: 'Reducir movimiento' })
await reduceMotion.click()
await win.waitForFunction(() => document.documentElement.hasAttribute('data-reduce-motion'))
await win.keyboard.press('Escape')
await win.waitForFunction(() => !document.querySelector('[data-blendy-to]'))
await win.keyboard.press('Control+,')
await reduceMotion.waitFor()
assert.equal(await reduceMotion.getAttribute('aria-checked'), 'true')
await reduceMotion.click()
await win.waitForFunction(() => !document.documentElement.hasAttribute('data-reduce-motion'))
await win.getByRole('switch', { name: 'Barra superior fija' }).click()
await win.keyboard.press('Escape')
await win.waitForFunction(() => !document.querySelector('[data-blendy-to]'))
await win.mouse.move(600, 500)
await win.waitForTimeout(800)
assert.equal(await barHeight(), 36, 'fija se queda abierta')
await shot('claro')
console.log('· Escape cierra ajustes; la barra fija se queda')

// Ctrl+, vuelve a la última sección; la paleta rota el tema.
await win.keyboard.press('Control+,')
await win.getByRole('heading', { name: 'Apariencia' }).waitFor()
await win.getByRole('switch', { name: 'Barra superior fija' }).click()
await win.keyboard.press('Escape')
await win.waitForFunction(() => !document.querySelector('[data-blendy-to]'))
await win.keyboard.press('Control+Shift+P')
await win.keyboard.type('cambiar tema')
await win.keyboard.press('Enter') // abre el submenú de temas
await win.getByRole('option', { name: /^Oscuro/ }).waitFor()
await win
  .getByRole('option', { name: /^Oscuro/ })
  .first()
  .click()
await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
assert.equal(await overlayOpen(), 1, 'la paleta sigue abierta para ver el cambio')
await win.keyboard.press('Backspace') // con el campo vacío, vuelve a la lista
await win.getByRole('option', { name: /Añadir carpeta/ }).waitFor()
assert.equal(await overlayOpen(), 1, 'Retroceso vuelve sin cerrar la paleta')
await win.keyboard.press('Escape')
await win.waitForFunction(() => !document.querySelector('[data-blendy-to]'))
await win.mouse.move(600, 500)
await win.waitForFunction(
  () => document.querySelector('header').getBoundingClientRect().height === 8
)
console.log('· Ctrl+, recuerda la sección y la paleta cambia el tema')

// Renombrar desde el menú: el campo conserva el foco, Enter guarda y Escape cancela.
const shellRow = win.locator('[data-status]').filter({ hasText: 'Shell' })
await shellRow.click({ button: 'right' })
await win.getByRole('menuitem', { name: 'Renombrar' }).click()
await win.locator('input:focus').waitFor({ timeout: 3000 }) // el campo toma el foco al cerrarse el menú
await win.keyboard.type('Servidor')
await win.keyboard.press('Enter')
await win.locator('[data-status]').filter({ hasText: 'Servidor' }).waitFor({ timeout: 3000 })
await win.locator('[data-status]').filter({ hasText: 'Servidor' }).dblclick()
await win.keyboard.type('No guardar')
await win.keyboard.press('Escape')
await win.locator('[data-status]').filter({ hasText: 'Servidor' }).waitFor({ timeout: 3000 })
console.log('· renombrar: Enter guarda, Escape cancela')

// Quitar la carpeta pide confirmar y cierra sus sesiones en vez de dejarlas invisibles.
await win.getByText(basename(repo), { exact: true }).click({ button: 'right' })
await win.getByRole('menuitem', { name: 'Quitar de la barra lateral' }).click()
await win.getByRole('menuitem', { name: /Cerrará sus 2 sesiones/ }).click()
await win.getByText('Empieza por una carpeta').waitFor({ timeout: 3000 })
assert.equal(
  (await win.evaluate(() => window.slate.sessions.list())).length,
  0,
  'sin sesiones vivas'
)
console.log('· quitar carpeta: confirma y cierra sus sesiones')

await app.close()

// Un repo de prueba para las ramas aisladas: el de Slate no se toca.
const testRepo = join(data, 'repo')
mkdirSync(testRepo)
const gitIn = (...args) => execFileSync('git', args, { cwd: testRepo, encoding: 'utf8' })
gitIn('init', '-b', 'main')
gitIn('config', 'user.name', 'Prueba')
gitIn('config', 'user.email', 'prueba@slate.local')
writeFileSync(join(testRepo, 'README.md'), '# repo de prueba\n')
gitIn('add', '.')
gitIn('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'inicio')
writeFileSync(
  join(data, 'projects.json'),
  JSON.stringify([{ path: testRepo, name: 'repo', open: true }])
)

// Al reabrir con el tema claro guardado, la página arranca ya en claro: sin destello oscuro.
writeFileSync(
  join(data, 'prefs.json'),
  JSON.stringify({
    theme: 'light',
    notify: false,
    tray: true,
    keepAlive: false,
    autoUpdate: false
  })
)
const again = await launchApp()
const first = await again.firstWindow()
await first.waitForLoadState('domcontentloaded')
assert.equal(await first.evaluate(() => document.documentElement.dataset.theme), 'light')
console.log('· reabre con el tema guardado desde el primer pintado')

// Nueva tarea: el avión de papel se transforma en el composer y la tarea abre una rama propia.
const shot2 = (name) => first.screenshot({ path: `.look/${name}.png` })
await first.getByText('Todo listo en repo').waitFor()
await first.keyboard.press('Control+Shift+A')
await first.waitForTimeout(150)
await shot2('tarea-morph')
await first.getByRole('heading', { name: '¿Qué hacemos en repo?' }).waitFor()
await first.waitForTimeout(700) // deja entrar el primer ejemplo del campo
await shot2('tarea')
// Solo la shell: los agentes reales gastarían tokens. Se desmarcan uno a uno y se comprueba.
const pressed = first.locator('[role="group"][aria-label="Agentes"] [aria-pressed="true"]')
while (await pressed.count()) await pressed.first().click()
assert.ok(
  await first.getByRole('button', { name: 'Lanzar tarea' }).isDisabled(),
  'sin agentes no se lanza'
)
await first.getByRole('button', { name: 'Shell', exact: true }).click()
assert.equal(await pressed.count(), 1, 'solo la shell queda marcada')
await first.getByRole('textbox', { name: 'Tarea', exact: true }).fill('Añadir búsqueda')
await first.keyboard.press('Enter')
await first.waitForTimeout(150)
await shot2('tarea-desvanece') // las letras se deshacen en partículas
await first.getByText('anadir-busqueda', { exact: true }).waitFor({ timeout: 10000 })
await first.waitForFunction(() => !document.querySelector('[data-blendy-to]'))
const wtPath = join(testRepo, '.slate', 'worktrees', 'anadir-busqueda')
assert.ok(existsSync(wtPath), 'el worktree existe')
assert.match(gitIn('branch', '--list', 'slate/*'), /slate\/anadir-busqueda/)
assert.equal(gitIn('status', '--porcelain').trim(), '', 'el repo principal sigue limpio')
const launched = await first.evaluate(() => window.slate.sessions.list())
assert.deepEqual(
  launched.map((x) => x.kind),
  ['shell'],
  'se lanzó solo lo elegido'
)
const isolated = launched[0]
assert.equal(resolve(isolated.cwd), resolve(wtPath), 'la shell arranca en su rama')
assert.equal(isolated.worktree.base, 'main')
await first.waitForTimeout(1200)
await shot2('tarea-lanzada')
console.log('· nueva tarea: rama propia nombrada por la tarea, bajo su carpeta')

// Dos copias de la shell: cada una en su rama, juntas en una vista dividida para comparar.
// La tarea repetida no pisa la rama anterior: llegan anadir-busqueda-2 y -3.
await first.keyboard.press('Control+Shift+A')
await first.getByRole('button', { name: 'Copias de Shell: 1' }).click()
await first.getByRole('textbox', { name: 'Tarea', exact: true }).fill('Añadir búsqueda')
await first.keyboard.press('Enter')
const folderSection = first.locator('nav section').filter({
  has: first.getByText('repo', { exact: true })
})
for (const branch of ['anadir-busqueda-2', 'anadir-busqueda-3']) {
  await folderSection.getByText(branch, { exact: true }).waitFor({ timeout: 10000 })
}
await first.waitForFunction(() => !document.querySelector('[data-blendy-to]'))
assert.equal(await first.locator('.xterm-screen:visible').count(), 2, 'las dos, lado a lado')
assert.equal(
  await folderSection.locator('.rounded-md.border [data-status]').count(),
  2,
  'juntas en el recuadro de su vista, bajo su carpeta'
)
await first.waitForTimeout(1000)
await shot2('tarea-copias')
console.log('· ×2: dos ramas, una vista dividida, bajo la carpeta del repo')

// Panel de cambios: lo que hace la shell aislada aparece con su diff, y se fusiona o descarta.
const sessionsNow = () => first.evaluate(() => window.slate.sessions.list())
const byBranch = async (name) =>
  (await sessionsNow()).find((x) => x.worktree?.branch === `slate/${name}`)
const third = await byBranch('anadir-busqueda-3')
await first.evaluate(
  ({ id }) =>
    window.slate.sessions.write(id, "Set-Content -Path hola.txt -Value 'hola desde la rama'\r"),
  { id: third.id }
)
for (let i = 0; i < 40 && !existsSync(join(third.worktree.path, 'hola.txt')); i++) {
  await first.waitForTimeout(150)
}
assert.ok(existsSync(join(third.worktree.path, 'hola.txt')), 'la shell escribió en su rama')
await first.keyboard.press('Control+Shift+G')
const panel = first.getByRole('complementary', { name: 'Cambios' })
await panel.getByRole('button', { name: /hola\.txt/ }).waitFor({ timeout: 8000 })
await first.waitForTimeout(400)
await shot2('cambios')
// Los primeros archivos llegan desplegados.
await panel.getByText('hola desde la rama').waitFor({ timeout: 8000 })
assert.equal(
  await panel.getByRole('button', { name: /hola\.txt/ }).getAttribute('aria-expanded'),
  'true'
)
await first.waitForTimeout(400)
await shot2('cambios-diff')
// La fila de la barra lateral muestra el último conteo.
await first.locator('nav').getByText('+1', { exact: true }).waitFor({ timeout: 5000 })
console.log('· panel de cambios: archivo nuevo, diff y conteo en la barra lateral')

// Cambios le quita su ancho al terminal y la shell se entera: el texto se acomoda a lo que queda
// a la vista, y al cerrarlo vuelve. La salida se conserva en los dos sentidos.
const resizeMarker = 'slate-refit-estable'
await first.evaluate(
  ({ id, marker }) => window.slate.sessions.write(id, `Write-Output '${marker}'\r`),
  { id: third.id, marker: resizeMarker }
)
const bufferedMarker = () =>
  first.evaluate(
    ({ id, marker }) => window.slate.sessions.buffer(id).then((text) => text.includes(marker)),
    { id: third.id, marker: resizeMarker }
  )
const validCanvas = () =>
  first.evaluate(() =>
    [...document.querySelectorAll('.xterm-screen')]
      .filter((screen) => screen.getClientRects().length)
      .every((screen) => {
        const canvases = [...screen.querySelectorAll('canvas:not([class])')]
        return canvases.length
          ? canvases.every((canvas) => canvas.width > 0 && canvas.height > 0)
          : !!screen.querySelector('.xterm-rows')?.getClientRects().length
      })
  )
for (let i = 0; i < 40 && !(await bufferedMarker()); i++) await first.waitForTimeout(100)
assert.equal(await bufferedMarker(), true, 'la última salida llegó al búfer antes de redimensionar')
assert.equal(await validCanvas(), true, 'el canvas del terminal tiene un tamaño válido')
const terminalWidth = () =>
  first.evaluate(
    () =>
      [...document.querySelectorAll('.xterm-screen')]
        .find((screen) => screen.getClientRects().length)
        ?.getBoundingClientRect().width ?? 0
  )
const stableWidth = await terminalWidth()
// Las columnas que cree tener la shell (PowerShell las informa con [Console]::WindowWidth).
const shellCols = async () => {
  const marker = `cols${Date.now()}`
  await first.evaluate(
    ({ id, marker }) =>
      window.slate.sessions.write(id, `Write-Output "${marker}=$([Console]::WindowWidth)"\r`),
    { id: third.id, marker }
  )
  for (let i = 0; i < 40; i++) {
    const text = await first.evaluate(({ id }) => window.slate.sessions.buffer(id), {
      id: third.id
    })
    const m = new RegExp(`${marker}=(\\d+)`).exec(text)
    if (m) return Number(m[1])
    await first.waitForTimeout(100)
  }
  return 0
}
const openCols = await shellCols()
const panelClose = panel.getByRole('button', { name: 'Cerrar cambios' })
for (let i = 0; i < 3; i++) {
  await first.keyboard.press('Control+Shift+G')
  await panelClose.waitFor({ state: 'detached' })
  await first.waitForTimeout(350)
  assert.ok((await terminalWidth()) > stableWidth, 'al cerrar, el terminal recupera el ancho')
  assert.equal(await bufferedMarker(), true, 'la salida se conserva al cerrar Cambios')
  assert.equal(await validCanvas(), true, 'el canvas conserva un tamaño válido al cerrar')
  await first.mouse.move(370, 200)
  await first.mouse.wheel(0, -160)
  await first.keyboard.press('Control+Shift+G')
  await panelClose.waitFor()
  await first.waitForTimeout(350)
  assert.equal(await panel.evaluate((el) => el.getBoundingClientRect().width), 480)
  assert.equal(await terminalWidth(), stableWidth, 'al abrir, vuelve al ancho que deja Cambios')
  assert.equal(await bufferedMarker(), true, 'la salida se conserva al abrir Cambios')
  assert.equal(await validCanvas(), true, 'el canvas conserva un tamaño válido al abrir')
}
assert.equal(await shellCols(), openCols, 'la shell tiene las mismas columnas que se ven')
await first.keyboard.press('Control+Shift+G')
await panelClose.waitFor({ state: 'detached' })
await first.waitForTimeout(350)
assert.ok((await shellCols()) > openCols, 'sin Cambios, la shell gana columnas')
await first.keyboard.press('Control+Shift+G')
await panelClose.waitFor()
await first.waitForTimeout(350)
await shot2('cambios-refit')
console.log('· Cambios le quita ancho al terminal y la shell lo sabe; la salida se conserva')

// Alcances y vista de árbol del panel.
await panel.getByRole('tab', { name: 'Toda la rama' }).focus()
await first.keyboard.press('ArrowRight')
assert.equal(
  await panel.getByRole('tab', { name: 'Sin guardar' }).getAttribute('aria-selected'),
  'true'
)
await panel.getByText('hola desde la rama').waitFor({ timeout: 8000 })
await panel.getByRole('button', { name: 'Ver como árbol' }).click()
await panel.getByRole('button', { name: /hola.txt/ }).waitFor({ timeout: 5000 })
await panel.getByRole('button', { name: 'Ver como lista' }).click()
await panel.getByRole('tab', { name: 'Toda la rama' }).click()
await panel.getByText('hola desde la rama').waitFor({ timeout: 8000 })

// Comentario al agente: llega al terminal de esa sesión. Descartar un archivo toca solo ese archivo.
assert.equal(
  await first.evaluate(({ id }) => window.slate.sessions.comment(id, 'echo comentario-del-panel'), {
    id: third.id
  }),
  true
)
await first.waitForTimeout(800)
assert.match(
  await first.evaluate(({ id }) => window.slate.sessions.buffer(id), { id: third.id }),
  /comentario-del-panel/,
  'el comentario llegó al terminal'
)
await first.evaluate(
  ({ id }) => window.slate.sessions.write(id, "Set-Content -Path otro.txt -Value 'x'\r"),
  { id: third.id }
)
for (let i = 0; i < 40 && !existsSync(join(third.worktree.path, 'otro.txt')); i++) {
  await first.waitForTimeout(150)
}
assert.equal(
  await first.evaluate(({ id }) => window.slate.git.discardFile(id, 'otro.txt'), { id: third.id }),
  true
)
assert.ok(!existsSync(join(third.worktree.path, 'otro.txt')), 'descartar quita el archivo nuevo')
assert.ok(existsSync(join(third.worktree.path, 'hola.txt')), 'y no toca el resto')
console.log('· comentario al agente y descartar un archivo')

// Lado a lado y contexto desplegable en el visor; descartar un archivo desde su fila.
await panel.getByRole('button', { name: 'Opciones del diff' }).click()
await first.getByRole('menuitemcheckbox', { name: 'Lado a lado' }).click()
await first.keyboard.press('Escape')
await panel.locator('[data-diff-type="split"]').first().waitFor({ timeout: 8000 })
await panel.getByRole('button', { name: 'Opciones del diff' }).click()
await first.getByRole('menuitemcheckbox', { name: 'Lado a lado' }).click()
await first.keyboard.press('Escape')
await panel
  .locator('[data-diff-type="split"]')
  .first()
  .waitFor({ state: 'detached', timeout: 8000 })
await panel.locator('[data-unmodified-lines]').first().waitFor({ state: 'attached', timeout: 8000 }) // el diff ofrece desplegar contexto
await first.evaluate(
  ({ id }) => window.slate.sessions.write(id, "Set-Content -Path ui.txt -Value 'x'\r"),
  { id: third.id }
)
await panel.getByRole('button', { name: /ui\.txt/ }).waitFor({ timeout: 10000 })
await panel.getByRole('button', { name: 'Descartar este archivo' }).last().click()
await panel.getByRole('button', { name: /Se pierde este cambio/ }).click()
for (let i = 0; i < 40 && existsSync(join(third.worktree.path, 'ui.txt')); i++) {
  await first.waitForTimeout(150)
}
assert.ok(
  !existsSync(join(third.worktree.path, 'ui.txt')),
  'descartar desde la fila quita el archivo'
)
console.log('· lado a lado, contexto y descartar desde la fila')

// Fusionar: un solo commit en main con el mensaje de la tarea; la rama y su carpeta se van.
await panel.getByRole('button', { name: 'Fusionar en main' }).click()
await first
  .locator('nav')
  .getByText('anadir-busqueda-3', { exact: true })
  .waitFor({ state: 'detached', timeout: 15000 })
assert.equal(gitIn('show', 'main:hola.txt').trim(), 'hola desde la rama')
assert.equal(gitIn('log', '-1', '--format=%s').trim(), 'Añadir búsqueda')
assert.ok(!existsSync(third.worktree.path), 'la carpeta de la rama se borró')
assert.doesNotMatch(gitIn('branch', '--list', 'slate/*'), /anadir-busqueda-3/)
console.log('· fusionar: commit único en main, sin la rama ni su carpeta')

// Descartar la otra copia: pide confirmación y borra rama y carpeta.
const second = await byBranch('anadir-busqueda-2')
await first.locator('nav [data-status]').filter({ hasText: 'anadir-busqueda-2' }).click()
await panel.getByText('Sin cambios todavía').waitFor({ timeout: 8000 })
await shot2('cambios-vacio')
await panel.getByRole('button', { name: 'Más acciones' }).click()
await first.getByRole('menuitem', { name: 'Descartar rama' }).click()
await first.getByRole('menuitem', { name: /Se borra todo/ }).click()
await first
  .locator('nav')
  .getByText('anadir-busqueda-2', { exact: true })
  .waitFor({ state: 'detached', timeout: 15000 })
assert.ok(!existsSync(second.worktree.path), 'la carpeta descartada se borró')
assert.doesNotMatch(gitIn('branch', '--list', 'slate/*'), /anadir-busqueda-2/)
console.log('· descartar: confirma y borra rama y carpeta')

// El mismo panel en oscuro, con la sesión que queda y un cambio en ella.
const firstBranch = await byBranch('anadir-busqueda')
writeFileSync(
  join(firstBranch.worktree.path, 'README.md'),
  '# repo de prueba\n\nCon una línea nueva.\n'
)
await first.locator('nav [data-status]').filter({ hasText: 'anadir-busqueda' }).first().click()
await first.keyboard.press('Control+Shift+P')
await first.keyboard.type('cambiar tema')
await first.keyboard.press('Enter') // abre el submenú de temas
await first
  .getByRole('option', { name: /^Oscuro/ })
  .first()
  .click() // claro → oscuro
await first.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
await first.keyboard.press('Escape') // vuelve a la lista
await first.keyboard.press('Escape') // cierra la paleta
await panel.getByText('Con una línea nueva.').waitFor({ timeout: 8000 })
await first.waitForTimeout(700)
await shot2('cambios-oscuro')
console.log('· el panel en oscuro')

// Varias tareas a la vez: Ctrl+Enter aparta una, Enter lanza todas. Cada una sale con su shell en
// su rama y el tablero se abre para verlas trabajar.
await first.keyboard.press('Control+Shift+G') // cierra el panel de cambios
const beforeTasks = (await sessionsNow()).length
await first.keyboard.press('Control+Shift+A')
// Las copias quedaron en ×2: ×2 → ×3 → ×1, una shell por tarea.
await first.getByRole('button', { name: 'Copias de Shell: 2' }).click()
await first.getByRole('button', { name: 'Copias de Shell: 3' }).click()
const taskBox = first.getByRole('textbox', { name: 'Tarea', exact: true })
await taskBox.fill('Revisar estilos')
await first.keyboard.press('Control+Enter')
await taskBox.fill('Documentar atajos')
await first.waitForTimeout(400)
await shot2('tareas-varias')
await first.keyboard.press('Enter')
const board = first.getByLabel('Tablero de sesiones')
await board.waitFor({ timeout: 8000 })
await board.getByRole('radio', { name: /^Todas/ }).press('ArrowRight')
await board.getByRole('radio', { name: /^Trabajando/, checked: true }).waitFor()
await board.getByRole('radio', { name: /^Trabajando/ }).press('ArrowLeft')
await board.getByRole('radio', { name: /^Todas/, checked: true }).waitFor()
for (const b of ['revisar-estilos', 'documentar-atajos']) {
  await board.getByText(b, { exact: true }).waitFor({ timeout: 10000 })
}
assert.equal((await sessionsNow()).length, beforeTasks + 2, 'una sesión por tarea')
assert.ok(
  existsSync(join(testRepo, '.slate', 'worktrees', 'documentar-atajos')),
  'cada tarea en su rama'
)
// Lo que imprime cada terminal llega a su tarjeta.
const docs = await byBranch('documentar-atajos')
await first.evaluate((id) => window.slate.sessions.write(id, 'echo hola-tablero\r'), docs.id)
await board.getByText('hola-tablero').first().waitFor({ timeout: 8000 })
await first.waitForTimeout(600)
await shot2('tablero')
// Filtrar: ninguna shell está trabajando.
await board
  .locator('label')
  .filter({ has: first.getByRole('radio', { name: /^Trabajando/ }) })
  .click()
await board.getByText('Ninguna sesión en este estado').waitFor()
await board
  .locator('label')
  .filter({ has: first.getByRole('radio', { name: /^Todas/ }) })
  .click()
// Elegir una tarjeta la abre y cierra el tablero.
await board.getByRole('button', { name: /Documentar atajos/ }).click()
await board.waitFor({ state: 'detached' })
await first
  .locator('nav [data-status][aria-current]')
  .filter({ hasText: 'documentar-atajos' })
  .waitFor({ timeout: 3000 })
console.log('· varias tareas: una rama por tarea y el tablero las muestra en vivo')
// Ctrl+Shift+O lo abre y Escape lo cierra.
await first.keyboard.press('Control+Shift+O')
await board.waitFor()
await first.keyboard.press('Escape')
await board.waitFor({ state: 'detached' })
console.log('· Ctrl+Shift+O abre el tablero y Escape lo cierra')

// Con la bandeja, el botón de cerrar esconde la ventana y la app sigue viva.
await first.evaluate(() => window.slate.win.close())
await first.waitForTimeout(500)
assert.equal(
  await again.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
  false,
  'la ventana se esconde en la bandeja'
)
// Salir con tres sesiones vivas espera a que terminen y no deja el proceso colgado.
const quitStart = Date.now()
await again.close()
assert.ok(Date.now() - quitStart < 8000, 'sale en pocos segundos con sesiones vivas')
console.log('· con la bandeja, cerrar solo esconde la ventana; salir con sesiones vivas no cuelga')

// Sesiones persistentes: con Slate cerrado la shell sigue viva en el host, y al reabrirlo vuelve
// con lo que imprimió y se le puede seguir escribiendo.
// waitForFunction no espera a funciones async: se sondea a mano.
const output = async (w, id, text) => {
  for (let i = 0; i < 70; i++) {
    if ((await w.evaluate((x) => window.slate.sessions.buffer(x), id)).includes(text)) return
    await w.waitForTimeout(150)
  }
  throw new Error(`no salió "${text.trim()}" en la sesión`)
}
writeFileSync(
  join(data, 'prefs.json'),
  JSON.stringify({ notify: false, keepAlive: true, autoUpdate: false })
)
writeFileSync(join(data, 'layout.json'), 'null')
const keep = await launchApp()
const kw = await keep.firstWindow()
await kw.getByText('Todo listo en repo').waitFor()
await kw.getByRole('button', { name: 'Nueva shell' }).click()
await kw.waitForSelector('.xterm-screen')
const [kept] = await kw.evaluate(() => window.slate.sessions.list())
await kw.evaluate((id) => window.slate.sessions.write(id, 'echo antes-de-cerrar\r'), kept.id)
await output(kw, kept.id, 'antes-de-cerrar\r\n')
// Una segunda shell a su derecha: la disposición dividida también debe volver.
await kw.keyboard.press('Control+Shift+D')
for (let i = 0; i < 80 && (await kw.evaluate(() => window.slate.sessions.list())).length < 2; i++) {
  await kw.waitForTimeout(100)
}
await kw.waitForTimeout(600) // la disposición se guarda cuando se calma
await keep.close()
assert.ok(await hostUp(), 'el host sigue vivo con Slate cerrado')

const back = await launchApp()
const bw = await back.firstWindow()
await bw.getByText('Volvieron las 2 sesiones que seguían abiertas').waitFor({ timeout: 8000 })
const returned = await bw.evaluate(() => window.slate.sessions.list())
assert.ok(
  returned.some((x) => x.id === kept.id),
  'es la misma sesión, no una nueva'
)
assert.equal(await bw.locator('.xterm-screen:visible').count(), 2, 'vuelven divididas como estaban')
assert.ok(
  (await bw.evaluate((id) => window.slate.sessions.buffer(id), kept.id)).includes('antes-de-cerrar')
)
await bw.evaluate((id) => window.slate.sessions.write(id, 'echo despues-de-volver\r'), kept.id)
await output(bw, kept.id, 'despues-de-volver\r\n')
await bw.waitForTimeout(600)
await bw.screenshot({ path: '.look/persistente.png' })
console.log(
  '· sesiones persistentes: siguen vivas con Slate cerrado y vuelven con lo que imprimieron'
)

// Recargar la ventana no es volver: las sesiones y la división siguen, sin repetir el aviso.
await bw.reload()
await bw.waitForSelector('.xterm-screen')
await bw.waitForTimeout(800)
assert.equal(
  await bw.locator('.xterm-screen:visible').count(),
  2,
  'la división sigue tras recargar'
)
assert.equal(await bw.getByText(/^Volvi/).count(), 0, 'recargar no repite el aviso')
console.log('· recargar la ventana conserva sesiones y disposición, sin repetir el aviso')

// Sin mantenerlas, salir detiene las sesiones y el host se va.
await bw.evaluate(() => window.slate.store.write('prefs', { notify: false, keepAlive: false }))
await back.close()
for (let i = 0; i < 30 && (await hostUp()); i++) await new Promise((r) => setTimeout(r, 200))
assert.equal(await hostUp(), false, 'sin mantener sesiones, el host se detiene al salir')
console.log('· sin mantenerlas, salir detiene el host')

console.log('look: ok · capturas en .look/')
