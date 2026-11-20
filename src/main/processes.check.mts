// Prueba de la suma de procesos por árbol: `npm run check`.
import assert from 'node:assert/strict'
import { sumTree, type Proc } from './processes.ts'

const p = (pid: number, ppid: number, memory: number, cpu: number): Proc => ({
  pid,
  ppid,
  memory,
  cpu
})
const all = [
  p(1, 0, 10, 1), // el host
  p(2, 1, 100, 2), // shell de una sesión
  p(3, 2, 200, 3), // agente dentro de la shell
  p(4, 3, 50, 1), // node del agente
  p(5, 1, 70, 4), // otra sesión
  p(9, 8, 999, 9) // ajeno
]
assert.deepEqual(sumTree(all, 2), { memory: 350, cpu: 6, processes: 3 })
assert.deepEqual(sumTree(all, 5), { memory: 70, cpu: 4, processes: 1 })
assert.deepEqual(sumTree(all, 1), { memory: 430, cpu: 11, processes: 5 }, 'el host suma sus hijos')
assert.deepEqual(sumTree(all, 77), { memory: 0, cpu: 0, processes: 0 }, 'un pid que ya no existe')
// Un ciclo (pid reutilizado) no cuelga.
assert.equal(sumTree([p(1, 2, 1, 1), p(2, 1, 1, 1)], 1).processes, 2)

console.log('processes: ok')
