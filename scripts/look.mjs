// Abre Slate ya compilado y guarda capturas en .look/ para revisarlas.
import { _electron as electron } from 'playwright'

const app = await electron.launch({ args: ['.'] })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.evaluate(() => document.fonts.ready)
await win.screenshot({ path: '.look/inicio.png' })
await app.close()
console.log('capturas en .look/')
