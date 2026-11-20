# Diseño de Slate

Referencia visual y de comportamiento. Lo observado en stepbro terminal 0.1.0-beta.29 sirve de punto de partida; Slate no copia su código ni su identidad.

## 1. Inventario completo de stepbro

### Ventana
- **Marco y tarjeta**: ventana sin marco del sistema. El terminal es una tarjeta oscura dentro de un marco de 8 px.
- **Barra superior escondida**: aparece al llevar el puntero al borde de arriba y crece unos 36 px. Se puede dejar fija.
  - A la izquierda: botón de barra lateral e indicador de actividad (puntos de color).
  - A la derecha: minimizar, maximizar y cerrar, con iconos propios.
- **Indicador de actividad**: al hacer clic abre una lista de las sesiones "Trabajando", cada una con su estado.

### Barra lateral (240 px, ajustable)
- **Árbol carpeta → sesiones**:
  - Carpeta: fila en negrita con icono de carpeta.
  - Sesión: fila con sangría, puntos de estado a la izquierda y, a la derecha, el icono del agente (gira mientras trabaja) o `>_` si es shell.
- **Agrupación**: las sesiones que comparten vista (split) se encierran en un recuadro común.
- **Plegado**: Ctrl+B la pliega. Plegada, sale *flotando* sobre el terminal al acercar el puntero al borde izquierdo: tarjeta esmerilada (`blur(20px) saturate(1.6)`), borde fino y esquinas iguales a las del terminal.
- **Pie**: `+`, que abre el diálogo del sistema "Añadir carpeta de proyecto". Topito en su agujero. Engranaje, que abre Ajustes.

### Menús contextuales (propios, no del sistema)
- **Carpeta**:
  - Nueva shell; Nueva sesión de agente ▸ (submenú solo con los agentes instalados); Retomar una conversación de Claude Code…
  - Abrir carpeta; Copiar ruta.
  - Contraer todos los proyectos; Quitar de la barra lateral.
- **Sesión**:
  - Renombrar; Anclar.
  - Abrir a la derecha / debajo del panel actual; Mover a su propia vista.
  - Reiniciar y retomar la conversación; Matar proceso; Archivar.
  - Abrir carpeta; Copiar ruta; Copiar id de sesión de Claude.
  - Cerrar.
- **Terminal**:
  - Copiar; Pegar; Enviar selección a ▸.
  - Dividir a la derecha (Ctrl ⇧ D); Dividir abajo (Ctrl ⇧ E).
  - Buscar… (Ctrl F); Redibujar pantalla (Ctrl ⇧ L).
  - Seleccionar todo; Quitar selección.

### Paneles y vistas
- **Cabecera de panel**: con dos o más paneles, cada uno lleva una cabecera con icono, título, chip "N archivos" (cambios git), lupa, dividir, `⋯` y cerrar. Con un solo panel, la cabecera desaparece.
- **Cambios**: el chip abre "Cambios · sesión" como otro panel. Tiene recargar y cerrar, una lista de archivos con su diff, y permite descartar cambios o borrar un archivo. Si la carpeta no es un repositorio git, lo dice.
- **Vista previa**: panel navegador con atrás, recargar, barra de dirección en monoespaciada, abrir en el navegador y cerrar.
  - Acepta `localhost:3000`, `:8080` o `ejemplo.com`.
  - Muestra un cursor con etiqueta del agente ("Claude Code") donde el agente actúa.
- **Reordenar**: se arrastra una sesión desde la barra lateral, o el título de una tarjeta, hasta el borde de otro panel.
- **Soltar archivos**: soltar archivos sobre el terminal inserta sus rutas.

### Superposiciones
- **Paleta (Ctrl K)**: anclada arriba, ~560 px.
  - Grupos: Sesiones, Acciones (nueva shell / nueva sesión de cada agente / retomar conversación), Carpetas y Acciones generales (añadir carpeta, cambiar tema, ocultar barra lateral, ajustes, novedades).
  - Cada fila lleva icono, texto y contexto a la derecha.
- **Historial de prompts (Ctrl ⇧ H)**: mismo formato que la paleta. Cada fila lleva icono del agente, prompt, carpeta y hace cuánto.
- **Notas (Ctrl ⇧ N)**: panel flotante con fondo atenuado, contador "N open" y "Nueva nota". Los agentes las guardan con su herramienta MCP `save_note`.
- **Buscar (Ctrl F)**: barra compacta arriba a la izquierda del terminal, con campo, anterior, siguiente y cerrar.
- **Novedades**: modal con fondo oscurecido. Topito habla en un globo y el modal tiene notas por versión (Nuevo / Mejorado / Arreglado) y el botón "Entendido".
- **Topito**: al hacer clic sale de su agujero con un globo ("1 agente trabajando"). Cuando un agente lo llama, asoma en la esquina inferior derecha del terminal con una tarjeta "Agente · sesión / mensaje".

### Ajustes (página completa; la barra lateral se vuelve su navegación)
- **Estructura**: Atrás, secciones con icono y la versión al pie. Contenido en una columna centrada de ~630 px: miga de pan, título, descripción y bloques con título, descripción y una tarjeta de filas.
- **Apariencia**:
  - Tarjeta de Topito con interruptor.
  - Tema: modo Automático / Claro / Oscuro; color de app (8 muestras); idioma English / Español.
  - Opacidad del marco y del terminal; logo claro u oscuro; esconder la barra superior.
  - Texto del terminal: fuente, tamaño y altura de línea.
  - Barra lateral: ancho y mostrarla desde el borde.
  - "Volver al valor por defecto".
- **Terminal**:
  - Programa de shell (`auto` = el del sistema).
  - Cursor: forma Barra / Bloque / Subrayado, y parpadeo.
  - Copiar al seleccionar; aceleración por GPU.
  - Historial de pantalla (5k líneas).
  - Reanudar sesiones al abrir; sesiones archivadas visibles por carpeta.
- **Agentes**:
  - Tabla de detectados: icono, nombre, ruta o "No instalado".
  - Sugerir los flags que saltan permisos mientras escribes.
  - Ruta del binario de Claude Code.
  - Clave y modelo de DeepSeek.
  - "Tus lanzadores": nombre + comando, que pasan a ser entradas de menú y de la paleta.
- **Espacios de trabajo**: paneles que se abren de una vez, cada uno en su carpeta y con un comando de inicio. Enlace `step://workspace/<nombre>`.
- **Notificaciones**: avisar cuando una sesión necesita respuesta o termina (solo las que no estás mirando); sonido con volumen y "Probar".
- **Atajos**: cada atajo es editable. Se hace clic y se pulsan las teclas; Esc conserva, Retroceso borra y una combinación en uso pasa al atajo nuevo.
- **Sesiones archivadas**: lista para restaurar o borrar, con estado vacío.
- **Avanzado**:
  - Versión y comprobar actualizaciones; Novedades.
  - Seguir en la bandeja.
  - Estado del host con "Reiniciar host".
  - Memoria de app, host y disco.
  - Terminales en marcha con CPU y memoria, "Abrir" y "Detener".
  - Rutas de datos y de registro.

### Color de app
El acento tiñe interruptores, segmentado activo, relleno de deslizadores, borde y fondo de la tarjeta de Topito y su gorro. El tema claro invierte la paleta: fondo gris claro y controles en grafito.

## 2. Cómo se conectan los agentes

Es la clave de la "inteligencia" del estado y se replicará en la Fase 2.

1. **Servidor local**: el host corre un servidor HTTP en `127.0.0.1` con un token secreto en la ruta.
2. **Archivos por sesión**: al lanzar Claude Code en una sesión, el host escribe:
   - `<id>.json`, con hooks de tipo `http` que apuntan a `/hooks/<token>/<id>`. Se pasa con `--settings`.
   - `<id>.mcp.json`, con un servidor MCP `http` en `/mcp/<token>/<id>`. Se pasa con `--mcp-config`.

   Así cada agente reporta sus eventos y usa herramientas (notas, vista previa, Topito, otras sesiones) sabiendo qué sesión es.
3. **Eventos escuchados**: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `Elicitation`, `ElicitationResult`, `Stop`, `StopFailure`, `PostModelSwitch` y `SessionEnd`.
4. **Estado que se deriva**:
   - Prompt o herramienta → trabajando.
   - `Notification` o `Elicitation` → te necesita.
   - `Stop` → terminado.
   - `StopFailure` → error.
5. **OpenCode**: recibe el mismo MCP más un plugin JS propio.
6. **Agentes sin hooks**: heurística con BEL, OSC 9/777 y actividad de salida.

## 3. Animaciones medidas en stepbro

| Qué | Cómo | Duración y curva |
|---|---|---|
| Spinner del agente | rotación | 1 s lineal, infinito |
| Barra lateral flotante entra | desde `-100% - 16px` en X | 200 ms `cubic-bezier(.22,1,.36,1)` |
| Barra lateral flotante sale | hacia `-100% - 16px` | 160 ms `cubic-bezier(.4,0,1,1)` |
| Menús y popovers | opacidad 0→1, `translateY(4px) scale(.985)`→nada | 160 ms ease |
| Toasts | opacidad + `translateY(8px)` | 180 ms |
| Punto de estado nuevo | escala .6 → 1.25 → 1 | 500 ms |
| Trabajando (barra de vista) | brillo que recorre la barra | 1.5 s infinito |
| Trabajando (respiración) | opacidad 1 → .55 → 1 | 1.6 s infinito |
| Nota recibida | fondo de acento al 18 % que se apaga | 1.6 s |
| Traspaso entre sesiones | contorno de acento de 1.5 px que se apaga | 1.3 s |
| Hover de filas y botones | color de fondo | 100–140 ms |
| Ancho de la barra | `width` | 280 ms `cubic-bezier(.22,1,.36,1)` |
| Topito sale | `transform` con rebote `cubic-bezier(.34,1.4,.5,1)` | 460 ms |
| Paneles se recolocan | `transform` | 480 ms `cubic-bezier(.22,1,.36,1)` |

Ajustes, la paleta y Notas aparecen sin transición de página: solo el fundido corto de 160 ms.

## 4. Lo que Slate hace mejor

| Stepbro | Slate |
|---|---|
| Barra lateral gris translúcida, se ve lavada | Pizarra sólida; el esmerilado solo al flotar |
| Las carpetas no reaccionan al pasar el cursor | Hover sutil en toda fila clicable |
| `+` abre directo el diálogo del sistema | `+` se transforma (Blendy) en un menú: nueva shell, agente, añadir carpeta |
| "Matar proceso" y "Cerrar" mezclados con acciones inocuas | Destructivas al final, en rojo, y confirmación si el agente trabaja |
| El clic derecho en el terminal puede pegar sin querer en el prompt | El clic derecho solo abre el menú; pegar es siempre explícito |
| Etiquetas de grupo en MAYÚSCULAS | Etiquetas en minúscula normal, en Ceniza |
| Ajustes, paleta y Notas aparecen con un fundido genérico | Morph desde el botón que los abre (Blendy) |
| El estado es un icono que gira | Trazo de tiza en el borde de la fila: brilla al trabajar y se vuelve ámbar cuando te necesita |
| 8 colores de acento | Monocromo de verdad: el color solo marca estado |

## 5. Tokens de Slate

### Color (oscuro por defecto)

| Nombre | Hex | Uso |
|---|---|---|
| Grafito | `#0C0D0E` | lienzo del terminal |
| Pizarra | `#151719` | barra lateral, tarjetas |
| Lasca | `#24272A` | bordes, hover, separadores |
| Ceniza | `#878C92` | texto secundario, iconos en reposo |
| Tiza | `#EDEEEF` | texto principal |
| Ámbar | `#F0B429` | te necesita |
| Azul tenue | `#7AA2D6` | terminó y no lo has visto |
| Rojo ladrillo | `#E5534B` | error, acciones destructivas |

Modo claro: lienzo `#FAFAFA`, superficie `#F0F1F2`, línea `#DCDEE0`, texto `#121314`.

### Tipografía
- **Interfaz**: Instrument Sans Variable en 12, 13, 15 y 20 px. Peso 450 para el cuerpo y 600 para los títulos.
- **Terminal**: JetBrains Mono 13 px, interlineado 1.25. Seleccionables: Geist Mono, Commit Mono y Cascadia Mono.

### Medidas
- **Barra superior y marco**: barra de 36 px, marco de 8 px.
- **Barra lateral**: 240 px de ancho (ajustable), filas de 28 px.
- **Radios**: 6 px en filas, 10 px en tarjetas y menús, 14 px en paleta y diálogos.
- **Curva base**: `cubic-bezier(.22,1,.36,1)`. Hover en 120 ms y entradas en 160–200 ms.

## 6. Wireframes

```
┌──────────────┬──────────────────────────────────────────────┐
│ ▾ github     │  ╭──────────────────────────────────────────╮│
│ ┃ claude  ✳  │  │ PS C:\…\slate-terminal>                  ││
│ │ shell   >_ │  │                                          ││
│ ▸ educat     │  ╰──────────────────────────────────────────╯│
│ +        ⚙   │                                              │
└──────────────┴──────────────────────────────────────────────┘
  ┃ trazo de tiza: brilla = trabajando, ámbar = te necesita
```

```
┌──────────────┬──────────────────────────────────────────────┐
│ ‹ Atrás      │        Ajustes / Terminal                    │
│ Apariencia   │        Terminal                              │
│ Terminal  ●  │        ┌──────────────────────────────────┐  │
│ Agentes      │        │ Forma del cursor   [Barra|Bloque]│  │
│ Atajos       │        │ Parpadeo                    (●)  │  │
│ Slate 0.1.0  │        └──────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────────────┘
```

## 7. Movimiento de Slate
- **Blendy, solo para morphs que responden a un clic**: ⚙ → Ajustes, lupa → paleta, `+` → menú de nueva sesión, avión de papel → Nueva tarea.
- **Nueva tarea**: los ejemplos del campo rotan cada 3 s; al lanzar, el texto se deshace en partículas (Aceternity) y la capa se cierra al terminar. Las sesiones que llegan juntas entran en la barra lateral con un fundido escalonado de 50 ms.
- **Trazo de tiza**: un brillo que recorre la línea cada 1.6 s mientras trabaja y un único latido ámbar al pasar a "te necesita".
- **Barra lateral flotante**: entra en 200 ms y sale en 160 ms.
- **Con `prefers-reduced-motion`**: todo pasa a fundidos instantáneos.

## 8. Referencia: T3 Code (observado el 2026-11-19)
Lo recorrí con Windows-MCP sin enviar mensajes. Solo anoto lo que se ve; no se copia código.

- **Inicio de un hilo**: composer centrado con un titular grande ("What should we build in droply?"). Es una tarjeta con placeholder "Ask anything. @ files, $ skills, / commands", chip del modelo, micrófono y botón de enviar redondo. Debajo, tres chips pequeños:
  - espacio de trabajo: *Current checkout* o *New worktree*, en un menú;
  - rama;
  - permisos.
- **Tarjeta flotante de detalles**, arriba a la derecha:
  - máquina;
  - "Open in Zed";
  - scripts del proyecto;
  - rama;
  - **botón dividido** "Create PR" con el menú Commit / Push / Create PR (las que no aplican, en gris);
  - "Changes vs origin/main" con `+67,571 −1` en verde y rojo.
- **Panel de diff**, unos 540 px a la derecha, con pestañas (Diff y un archivo abierto):
  - **Barra de herramientas**: fuente (Changes) vs base (origin/main) como selectores, total `+68k −1`, recargar, plegar o desplegar todo, apilado o lado a lado, ajuste de línea, espacios y árbol.
  - **Cada archivo**: flecha, icono de estado (más dentro de un cuadro, en verde), la ruta recortada por el principio ("…/prisma/migrations/…") y `+N −N` en monoespaciada a la derecha.
  - **Al desplegar**: líneas numeradas, una barra verde de 3 px a la izquierda y un fondo verde muy tenue. Junto al nombre hay un botón para copiar la ruta.
  - **Al pulsar el nombre**, se abre el archivo en una pestaña con un árbol de archivos (iconos por tipo; ignorados en gris).
- **Hilos**: insignia del proyecto, título y tiempo relativo ("23h", "3d"). Un grupo "Settled" plegable. Turnos de trabajo plegados como "Worked for 38s ›". Un mini-mapa de turnos en el borde.
- **Ajustes**:
  - **Diffs**: disposición apilada o lado a lado; ocultar espacios; archivos plegados por defecto; colores del diff.
  - **"Open … changes panels proactively"**: abre Cambios solo si la edición toca al menos 3 archivos o 50 líneas.
  - **Worktrees**: carpeta, "empezar desde el remoto", **nombre de rama sacado del primer mensaje** con prefijo (`t3/add-search`), y limpieza que conserva los worktrees con cambios locales.
  - **Git**: "quitar los créditos de agentes al fusionar".

### Lo que Slate toma (Fase 5), a su manera
- **Composer "Nueva tarea"**: un titular "¿Qué hacemos en <carpeta>?" y debajo una fila de chips:
  - agentes, con selección múltiple;
  - **Checkout actual o Rama aislada**, en un chip con menú;
  - la rama base.
- **Nombre de la rama a partir de la tarea**: `slate/anadir-busqueda`. Si se repite, `-2`.
- **Panel de cambios**:
  - una fila por archivo, con la ruta recortada por el principio y `+N −N` en monoespaciada;
  - al desplegar, una barra de 2 px a la izquierda, fondos al 6–8 % y números de línea;
  - archivos plegados por defecto;
  - plegar o desplegar todo, y recargar.
- **Acción principal dividida**: el botón muestra la siguiente acción útil ("Fusionar en main" o "Crear PR") y el menú tiene el resto (Commit, Push, Descartar).
- **Al fusionar se quitan las líneas de crédito de agentes** (`Co-Authored-By` de agentes), por defecto, tal como lo prefiere el usuario.
- **Se descarta**: el chat de T3 (Slate sigue siendo un terminal), el mini-mapa de turnos y el árbol de archivos (quizá más adelante).

## 9. Panel de cambios (Fase 5b)
- **Lugar**: a la derecha del terminal, dentro de la misma tarjeta, con 440 px. Entra deslizando su ancho en 200 ms, como la barra lateral. Se abre con `Ctrl+Shift+G` o con el botón de diff de la barra superior.
- **Color**: `--added` (verde apagado `#8fbf7f`, `#3f7d3a` en claro) y `--removed` (el rojo de `--destructive`) son colores de estado, igual que el ámbar. Las líneas del diff llevan una barra de 2 px de ese color y un fondo al 10 %. El código se resalta con Shiki usando un tema propio en grises de tiza (peso y cursiva, sin color).
- **Archivos**: plegados por defecto. La carpeta se recorta por el principio y el nombre queda entero. Al desplegarse crecen en altura con Motion (200 ms, la curva base).
- **Acción principal dividida**: "Fusionar en <base>" (squash, un solo commit, sin créditos de agentes). En el menú: Crear PR (con `gh` o, sin él, la página "comparar" de GitHub), Solo hacer commit y Descartar rama, que pide un segundo clic.

## 10. Orquestación por MCP (Fase 6)
- **Qué es**: cada Claude Code que abre Slate recibe, con `--mcp-config`, el MCP de Slate. Va en una ruta propia del servidor local, con el token secreto y el id de la sesión, así cada llamada sabe quién la hace. Se apaga en Ajustes › Terminal › Agentes.
- **Herramientas**:
  - `list_sessions`: ver las demás sesiones.
  - `new_task`: lanzar agentes o shells con una tarea, en ramas aisladas por defecto. Lo lanzado recuerda quién lo pidió.
  - `send_to_session`: escribir como una persona, con pegado entre corchetes (bracketed paste) para que un texto de varias líneas no se envíe a medias.
  - `read_screen`: leer la pantalla en texto plano, gracias a una copia headless de xterm por sesión.
  - `wait_for_status`: esperar a que termine o necesite algo.
  - `get_changes`: ver los archivos tocados.
  - `report`: avisar a quien la lanzó.
- **En la interfaz**: las sesiones lanzadas por un agente aparecen juntas en una vista nueva, en la misma rejilla que Nueva tarea, sin quitarte el foco. La barra superior dice quién las abrió y cada fila lleva una flecha pequeña. Al pasar el puntero se lee "Lanzada por …".
- **Límite**: solo Claude Code recibe el MCP por ahora. Codex y Gemini se configuran en sus propios archivos, que Slate no toca.

## 11. Sesiones persistentes (Fase 7)
- **Host de sesiones**: las terminales viven en un proceso aparte (`src/main/host.ts`), lanzado desacoplado con el mismo binario en modo Node. Slate se conecta a él por una tubería con nombre (un socket en Unix) con un token. Si ya hay un host, se reconecta; si no, lo lanza.
  - El host solo guarda los procesos y su salida (256 KB por sesión).
  - Estados, hooks, MCP, git y la pantalla espejo siguen en Slate. La pantalla espejo se reconstruye con la salida guardada.
- **Al salir**: con "Mantener las sesiones al salir" (Ajustes › Avisos › Al cerrar la ventana, activado por defecto), los agentes siguen trabajando. Al volver aparecen tal cual, en la misma disposición de paneles, y la barra superior avisa ("Volvieron las N sesiones…"). Sin esa opción, o con "Salir y detener las sesiones" de la bandeja, se cierran y el host se va.
- **El host se apaga solo** sin Slate conectado: a los 10 s si no le quedan sesiones; si solo le quedan terminadas, las guarda una hora para que Slate muestre cómo acabaron.
- **Un solo Slate por carpeta de datos**: abrir otro trae al frente el que ya está. Si al abrir aparece un host de otra versión (tras actualizar), Slate pregunta si detenerlo con sus sesiones. En Ajustes › Avisos hay un botón para detener todas las sesiones.
- **Hooks y MCP**: el servidor local conserva su puerto y su token entre arranques. Así un Claude Code que siguió vivo sigue avisando y usando sus herramientas.
- **Windows**: el host se lanza con `Start-Process` (ShellExecute) para que no herede los handles de quien abrió Slate. Si los heredara, ese proceso (una terminal, `npm run dev`) creería que Slate sigue abierto.
- **Registro**: el host arranca por una entrada mínima (`host.ts`) que deja en `host.log` cualquier fallo, incluso al cargar node-pty, y después carga el resto (`host-server.ts`).

## 12. Personalización, tablero y actualizaciones (Fase 9)
Referencia: los ajustes de T3 Code (MIT), leídos en su código (`apps/web/src/components/settings`) solo para entender qué ofrece. No se copia código.

- **Lo observado en T3**:
  - **Apariencia**: biblioteca de temas con miniaturas y un tema por cada mitad (claro y oscuro). Contraste, opacidad del vidrio, ancho del chat y duración de las animaciones de paneles.
  - **Tipografía**: tamaños separados para la interfaz (12–20), el prompt, el código y los diffs (10–18) y el terminal (8–20). Familias elegidas entre las fuentes instaladas, ajuste de línea por defecto y suavizado.
  - **Cada fila con un botón de restablecer** cuando su valor no es el de siempre.
  - **Diffs**: apilado o lado a lado, ajuste de línea e ignorar espacios.
  - **Actualizaciones**: electron-updater con GitHub Releases, por canales.
- **Lo que Slate toma, a su manera**:
  - **Temas grises** (`shared/palettes.ts`): Grafito, Carbón, Pizarra y Humo en oscuro; Tiza, Papel y Niebla en claro. Sigue siendo monocromo: el color solo marca estado. El modo Automático usa el elegido para cada mitad. Main pinta la ventana con el tema desde el primer frame.
  - **Tamaño de la interfaz** con el zoom de Electron (85–130 %). El terminal compensa para conservar su propio tamaño de letra.
  - **Terminal**:
    - fuente entre las monoespaciadas instaladas (Local Font Access, pedida al abrir el selector);
    - espacio entre letras, grosor y contraste mínimo;
    - margen interior y desplazamiento suave;
    - shell de las terminales nuevas (PowerShell 7, Windows PowerShell, cmd, Git Bash o WSL, según lo instalado). Los agentes siguen en PowerShell.
  - **Cambios**: tamaño del código (13 px por defecto, antes 12), ajuste de línea, ignorar espacios (`git diff -w`) y ancho del panel, que se arrastra por su borde.
  - **Restablecer por fila**, como en T3.
- **Tablero** (`Ctrl Shift O`), al estilo de Herdr:
  - todas las sesiones como tarjetas vivas, agrupadas por carpeta: estado y desde cuándo, rama, `+N −N`, la tarea y las últimas 9 líneas de su terminal (la pantalla espejo de main, cada segundo);
  - filtros Todas, Trabajando, Te necesitan y Terminadas;
  - las tarjetas de agentes trabajando llevan un trazo de tiza que recorre el borde;
  - elegir una tarjeta abre esa sesión;
  - en la cabecera de la barra lateral hay un indicador con cuántos trabajan y cuántos te necesitan, que abre el tablero.
- **Varias tareas a la vez**: en Nueva tarea, `Ctrl Enter` (o el `+`) aparta la tarea escrita y `Enter` lanza todas. Cada una sale con los agentes elegidos en su propia rama, en su vista, y el tablero se abre para verlas trabajar.
- **Actualizaciones**:
  - `.github/workflows/release.yml` publica en GitHub Releases una versión `0.2.<ejecución>` con cada push a `develop`.
  - Ajustes › Actualizaciones busca, descarga con progreso y reinicia para instalar.
  - Antes de instalar se cierran las sesiones con calma, porque el instalador reemplaza también el ejecutable del host.
  - Al abrir Slate se busca en silencio (se puede apagar). Nunca se instala sin pedirlo.
