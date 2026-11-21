// node-pty compilado desde su código (lo hace `electron-builder install-app-deps` donde hay
// herramientas de compilación, como en la CI) busca conpty.dll y OpenConsole.exe en la carpeta
// `conpty` junto a su conpty.node, pero solo los precompilados la traen. Sin ellos, Slate cae a
// la ConPTY del sistema, que al cambiar el ancho del terminal pierde filas del historial.
// Este paso copia la ConPTY que trae node-pty junto a cualquier conpty.node compilado.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

if (process.platform !== 'win32') process.exit(0)
const pty = join('node_modules', 'node-pty')
const versions = join(pty, 'third_party', 'conpty')
if (!existsSync(versions)) process.exit(0)
const version = readdirSync(versions).sort().pop()
for (const arch of ['x64', 'arm64']) {
  const from = join(versions, version, `win10-${arch}`)
  if (!existsSync(from)) continue
  for (const dir of ['build/Release', 'build/Debug']) {
    if (arch !== process.arch || !existsSync(join(pty, dir, 'conpty.node'))) continue
    const to = join(pty, dir, 'conpty')
    mkdirSync(to, { recursive: true })
    for (const file of ['conpty.dll', 'OpenConsole.exe'])
      copyFileSync(join(from, file), join(to, file))
    console.log(`conpty: ConPTY ${version} copiada a ${to}`)
  }
}
