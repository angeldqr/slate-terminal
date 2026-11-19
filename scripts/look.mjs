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

// Clic derecho en la carpeta → Claude Code, como lo haría el usuario.
await win.getByText(basename(repo), { exact: true }).click({ button: 'right' })
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

await app.close()
console.log('look: ok · capturas en .look/')
