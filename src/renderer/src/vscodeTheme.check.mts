// Prueba del importador de temas de VS Code: `npm run check`.
import assert from 'node:assert/strict'
import { hex, parseVsCodeTheme, stripJsonc } from './vscodeTheme.ts'

assert.equal(hex('#ABC'), '#aabbcc')
assert.equal(hex('#1e1e1e80'), '#1e1e1e80')
assert.equal(hex('red'), null)
assert.equal(hex('#12345'), null)

assert.deepEqual(JSON.parse(stripJsonc('{ // c\n "a": "x // no", /* b */ "b": [1,2,], }')), {
  a: 'x // no',
  b: [1, 2]
})

const theme = `{
  // tema de prueba
  "name": "Prueba",
  "colors": {
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4",
    "terminal.background": "#101010",
    "terminal.ansiRed": "#f00",
    "terminal.ansiBrightWhite": "#ffffff",
    "terminal.ansiGreen": "no-es-color",
    "terminalCursor.foreground": "#ffcc00",
  },
}`
const r = parseVsCodeTheme(theme)
assert.ok(r.ok)
if (r.ok) {
  assert.equal(r.colors.background, '#101010', 'el del terminal gana al del editor')
  assert.equal(r.colors.foreground, '#d4d4d4', 'sin el del terminal, usa el del editor')
  assert.equal(r.colors.cursor, '#ffcc00')
  assert.deepEqual(r.colors.ansi, { red: '#ff0000', brightWhite: '#ffffff' }, 'solo los válidos')
}

// settings.json: el bloque workbench.colorCustomizations
const s = parseVsCodeTheme('{"workbench.colorCustomizations": {"terminal.ansiBlue": "#0000ff"}}')
assert.ok(s.ok && s.colors.ansi.blue === '#0000ff')

// Una coma dentro de una cadena no se toca, y un BOM al principio no estorba.
assert.deepEqual(JSON.parse(stripJsonc('{"a": "x,}", }')), { a: 'x,}' })
assert.ok(parseVsCodeTheme('\uFEFF{"colors": {"terminal.ansiRed": "#f00"}}').ok)
assert.equal(parseVsCodeTheme('{"colors": [1]}').ok, false)

assert.equal(parseVsCodeTheme('no json').ok, false)
assert.equal(parseVsCodeTheme('{"colors": {"x": "#fff"}}').ok, false, 'sin colores útiles')

console.log('vscode: ok')
