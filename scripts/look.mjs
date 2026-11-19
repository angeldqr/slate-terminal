// Abre Slate ya compilado, guarda capturas en .look/ y prueba la cadena de hooks.
import { _electron as electron } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const app = await electron.launch({ args: ['.'] })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
win.on('pageerror', (e) => console.error('renderer:', e.message))
await win.waitForSelector('.xterm-screen')
await win.waitForTimeout(1500) // la shell tarda en pintar el prompt
await win.screenshot({ path: '.look/shell.png' })

// Hooks: lanza Claude Code, imita sus eventos por HTTP y mira cómo cambia el estado.
console.log('· shell ok')
const userData = await app.evaluate(({ app }) => app.getPath('userData'))
const { id } = await win.evaluate(async () =>
  window.slate.sessions.create(await window.slate.home(), 'claude')
)
console.log('· sesión claude creada')
const settings = JSON.parse(readFileSync(join(userData, 'hooks', `${id}.json`), 'utf8'))
const url = settings.hooks.Stop[0].hooks[0].url

const statusOf = () =>
  win.evaluate(
    async (id) => (await window.slate.sessions.list()).find((s) => s.id === id)?.status,
    id
  )
for (const [event, expected] of [
  ['UserPromptSubmit', 'working'],
  ['Notification', 'attention'],
  ['PreToolUse', 'working'],
  ['Stop', 'done']
]) {
  await fetch(url, { method: 'POST', body: JSON.stringify({ hook_event_name: event }) })
  assert.equal(await statusOf(), expected, `${event} → ${expected}`)
  console.log(`· ${event} → ${expected}`)
}
const forged = await fetch(url.replace(/hooks\/\w+/, 'hooks/token-falso'), {
  method: 'POST',
  body: '{}'
})
assert.equal(forged.status, 404, 'un token falso se rechaza')

await win.evaluate((id) => window.slate.sessions.close(id), id)
console.log('· sesión cerrada')
await app.close()
console.log('hooks: ok · capturas en .look/')
