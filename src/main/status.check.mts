// Prueba de la lógica de estados: `npm run check`.
import assert from 'node:assert/strict'
import { nextStatus } from './status.ts'

const out = { type: 'output', bell: false } as const
const bell = { type: 'output', bell: true } as const
const quiet = { type: 'quiet' } as const

// Con hooks (Claude Code): mandan los hooks, la salida no.
assert.equal(nextStatus('idle', { type: 'hook', name: 'UserPromptSubmit' }, true), 'working')
assert.equal(nextStatus('working', { type: 'hook', name: 'Notification' }, true), 'attention')
assert.equal(nextStatus('attention', { type: 'hook', name: 'PreToolUse' }, true), 'working')
assert.equal(nextStatus('working', { type: 'hook', name: 'Stop' }, true), 'done')
assert.equal(nextStatus('working', { type: 'hook', name: 'StopFailure' }, true), 'error')
assert.equal(nextStatus('done', out, true), 'done')
assert.equal(nextStatus('working', quiet, true), 'working')
assert.equal(nextStatus('done', { type: 'hook', name: 'Desconocido' }, true), 'done')

// Sin hooks: heurística por salida y silencio; el BEL siempre pide atención.
assert.equal(nextStatus('idle', out, false), 'working')
assert.equal(nextStatus('working', quiet, false), 'done')
assert.equal(nextStatus('working', bell, false), 'attention')
assert.equal(nextStatus('attention', out, false), 'attention')
assert.equal(nextStatus('done', bell, true), 'attention')

// Al salir el proceso, nada lo revive.
assert.equal(nextStatus('working', { type: 'exit' }, false), 'exited')
assert.equal(nextStatus('exited', { type: 'hook', name: 'UserPromptSubmit' }, true), 'exited')

console.log('status: ok')
