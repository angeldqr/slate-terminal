// Abre Slate ya compilado como lo usaría una persona, guarda capturas en .look/ y prueba los hooks.
// Usa su propia carpeta de datos (.look/data) para no tocar la del usuario.
import { _electron as electron } from 'playwright'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const data = resolve('.look/data')
rmSync(data, { recursive: true, force: true })
mkdirSync(data, { recursive: true })
const repo = process.cwd()
writeFileSync(
  join(data, 'projects.json'),
  JSON.stringify([{ path: repo, name: basename(repo), open: true }])
)
// Sin avisos del sistema: los hooks de prueba llegan con la ventana sin foco.
writeFileSync(join(data, 'prefs.json'), JSON.stringify({ notify: false }))

const app = await electron.launch({ args: ['.', `--user-data-dir=${data}`] })
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
const claude = await win.evaluate(async () =>
  (await window.slate.sessions.list()).find((s) => s.kind === 'claude')
)
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
// Claude sigue quieto en su pregunta de confianza: nada de esto gasta tokens.
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

await win.getByRole('button', { name: 'Apariencia', exact: true }).click()
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
await win.keyboard.press('Enter')
await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
assert.equal(await overlayOpen(), 1, 'la paleta sigue abierta para ver el cambio')
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
  JSON.stringify({ theme: 'light', notify: false, tray: true })
)
const again = await electron.launch({ args: ['.', `--user-data-dir=${data}`] })
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
await panel.getByRole('button', { name: /hola\.txt/ }).click()
await panel.getByText('hola desde la rama').waitFor({ timeout: 8000 })
await first.waitForTimeout(400)
await shot2('cambios-diff')
// La fila de la barra lateral muestra el último conteo.
await first.locator('nav').getByText('+1', { exact: true }).waitFor({ timeout: 5000 })
console.log('· panel de cambios: archivo nuevo, diff y conteo en la barra lateral')

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
await first.keyboard.press('Enter') // claro → oscuro
await first.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
await first.keyboard.press('Escape')
await panel.getByRole('button', { name: /README\.md/ }).click()
await panel.getByText('Con una línea nueva.').waitFor({ timeout: 8000 })
await first.waitForTimeout(700)
await shot2('cambios-oscuro')
console.log('· el panel en oscuro')

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

console.log('look: ok · capturas en .look/')
