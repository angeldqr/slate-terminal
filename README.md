# Slate

Una terminal para trabajar con agentes de IA (Claude Code, Codex, Gemini CLI, OpenCode…). Cada
carpeta agrupa sus sesiones, y Slate te avisa cuando un agente te necesita o termina.

![Nueva tarea: la misma tarea a uno o varios agentes, cada uno en su rama](docs/screenshots/tarea.png)

## Qué hace

- **Sesiones por carpeta.** Shells y agentes ordenados bajo su proyecto, con un trazo en el
  borde de cada fila: brilla mientras el agente trabaja y se vuelve ámbar cuando te necesita.
  Claude Code informa por hooks; los demás agentes, por su salida.
- **Divisiones.** Varias terminales en una misma vista, a la derecha o debajo.
- **Tareas en paralelo.** Lanza una tarea a uno o varios agentes (o varias copias del mismo).
  Cada uno trabaja en su propia rama, en un worktree aparte, sin pisar a los demás.
- **Panel de cambios.** Lo que tocó cada sesión, con su diff resaltado. Desde ahí lo fusionas en
  tu rama (un solo commit, sin créditos de agente), abres un PR o lo descartas.
- **Orquestación.** Claude Code recibe herramientas de Slate por MCP para lanzar tareas, leer la
  pantalla de otra sesión, escribirle, esperar a que termine y avisar a quien le encargó algo.
- **Sesiones que sobreviven.** Al cerrar Slate, las terminales siguen trabajando en segundo
  plano. Al abrirlo vuelven con lo que imprimieron y en la misma disposición.
- **Tema claro y oscuro**, avisos del sistema y seguir en la bandeja.

![Panel de cambios de una sesión en su rama](docs/screenshots/cambios.png)

## Instalar

Descarga `slate-<versión>-setup.exe` y ábrelo. Se instala para tu usuario, sin pedir permisos
de administrador, y crea los accesos en el escritorio y en el menú Inicio.

El instalador no está firmado. Por eso Windows SmartScreen puede decir _"Windows protegió su
PC"_: pulsa **Más información** y luego **Ejecutar de todas formas**.

## Atajos

| Acción                           | Windows y Linux                 | macOS                   |
| -------------------------------- | ------------------------------- | ----------------------- |
| Paleta de comandos               | `Ctrl Shift P`                  | `Cmd K`                 |
| Nueva shell                      | `Ctrl Shift T`                  | `Cmd T`                 |
| Nueva tarea                      | `Ctrl Shift A`                  | `Cmd Shift A`           |
| Dividir a la derecha / abajo     | `Ctrl Shift D` / `Ctrl Shift E` | `Cmd D` / `Cmd Shift D` |
| Mostrar los cambios              | `Ctrl Shift G`                  | `Cmd Shift G`           |
| Siguiente sesión que te necesita | `Ctrl Shift J`                  | `Cmd J`                 |
| Buscar en el terminal            | `Ctrl Shift F`                  | `Cmd F`                 |

La lista completa está en Ajustes › Atajos.

![Tres terminales en una vista dividida](docs/screenshots/divisiones.png)

## Desarrollo

```bash
npm install
npm run dev          # app con recarga en caliente
npm run check        # pruebas de la lógica (estados, disposición, atajos, git)
npm run look         # recorrido completo de la app con Playwright; capturas en .look/
npm run build:win    # instalador de Windows en dist/
npm run look:exe     # el mismo recorrido sobre dist/win-unpacked (tras npm run build:unpack)
```

Las pruebas nunca lanzan agentes con una tarea: usan shells e imitan sus hooks.

Si el host de sesiones falla al arrancar, su error queda en `host.log`, dentro de la carpeta de
datos (Ajustes › Avanzado › Abrir carpeta).

Hecho con Electron, React, xterm.js y node-pty.
