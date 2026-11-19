// Prueba de cómo se leen los atajos: `npm run check`.
import assert from 'node:assert/strict'
import { comboOf, type KeyPress } from './keys.ts'

const press = (code: string, key: string, mods: Partial<KeyPress> = {}): string =>
  comboOf({ code, key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

// Letras: Shift no cambia la tecla ni importa si llega en mayúscula.
assert.equal(press('KeyT', 'T', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+T')
assert.equal(press('KeyP', 'p', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+P')
// Números: Shift+1 no se vuelve "!".
assert.equal(press('Digit1', '!', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+1')
assert.equal(press('Digit3', '3', { metaKey: true }), 'Cmd+3')
// Teclas con nombre.
assert.equal(press('Tab', 'Tab', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Tab')
// Signos: la coma de Ajustes.
assert.equal(press('Comma', ',', { ctrlKey: true }), 'Ctrl+,')
// AltGr en teclado español llega como Ctrl+Alt: nunca coincide con un atajo de Slate.
assert.equal(press('Digit2', '@', { ctrlKey: true, altKey: true }), 'Ctrl+Alt+2')
// Sin modificadores: una letra sola.
assert.equal(press('KeyA', 'a'), 'A')

console.log('keys: ok')
