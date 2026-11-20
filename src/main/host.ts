import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Entrada del host de sesiones. Lanzado desacoplado, su salida no va a ninguna parte: un fallo
// (node-pty que no carga en el empaquetado, un error inesperado) queda en host.log, junto al
// token. El resto se carga después, para que este registro exista ya cuando node-pty se cargue.
// Los argumentos son los de host-server: la tubería y el archivo del token (en la carpeta de datos).
const log = join(dirname(process.argv[3] ?? '.'), 'host.log')
const fail = (err: unknown): void => {
  try {
    appendFileSync(log, `${new Date().toISOString()} ${(err as Error)?.stack ?? err}\n`)
  } finally {
    process.exit(1)
  }
}
process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)
import('./host-server').catch(fail)
