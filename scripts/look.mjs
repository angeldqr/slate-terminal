// Abre Slate ya compilado como lo usaría una persona, guarda capturas en .look/ y prueba los hooks.
// Usa su propia carpeta de datos (.look/data) para no tocar la del usuario.
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const data = resolve('.look/data')
rmSync(data, { recursive: true, force: true })
mkdirSync(data, { recursive: true })
const repo = process.cwd()
writeFileSync(
  join(data, 'projects.json'),
  JSON.stringify([{ path: repo, name: basename(repo), open: true }])
)

const app = await electron.launch({ args: ['.', `--user-data-dir=${data}`] })
const win = await app.firstWindow()
win.on('pageerror', (e) => console.error('renderer:', e.message))
const shot = (name) => win.screenshot({ path: `.look/${name}.png` })

await win.getByText('No hay ninguna sesión abierta').waitFor()
await shot('vacio')
console.log('· estado vacío')

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
console.log('look: ok · capturas en .look/')
