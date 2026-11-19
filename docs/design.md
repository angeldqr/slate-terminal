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
- **Blendy, solo para morphs que responden a un clic**: ⚙ → Ajustes, lupa → paleta, `+` → menú de nueva sesión.
- **Trazo de tiza**: un brillo que recorre la línea cada 1.6 s mientras trabaja y un único latido ámbar al pasar a "te necesita".
- **Barra lateral flotante**: entra en 200 ms y sale en 160 ms.
- **Con `prefers-reduced-motion`**: todo pasa a fundidos instantáneos.
