// Interfaz local tipo agente: historial ANSI ancho y una línea de estado que se redibuja al cambiar de tamaño.
const out = process.stdout
const columns = out.columns || 100
for (let i = 1; i <= 160; i++) {
  const n = i.toString().padStart(3, '0')
  const text = `${n}  ${`Cambio ${n} · ${'abcdef '.repeat(6)}`.repeat(4)}`.slice(0, columns - 1)
  out.write(`\x1b[${i % 2 ? '37;41' : '30;42'}m${text}\x1b[0m\n`)
}
const status = () =>
  out.write(`\x1b7\x1b[${out.rows};1H\x1b[2Kslate-scroll-listo ${out.columns}\x1b8`)
status()
out.on('resize', status)
process.stdin.resume()
