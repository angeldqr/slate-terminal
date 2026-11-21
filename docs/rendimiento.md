# Medir la fluidez de Slate en Windows

Ejecuta `npm run build` y después `npm run perf`. Para medir el binario empaquetado, usa
`npm run perf -- --exe dist/win-unpacked/slate.exe`. La prueba abre Slate con una carpeta de datos
temporal y un repositorio local aislado: no lanza agentes ni modifica la instalación habitual.

El recorrido mide 1, 4, 10 y 20 shells con salida continua, cambios de panel, scroll y el tablero
abierto con sesiones en ramas aisladas. Guarda `.look/perf.json` con el intervalo p95 entre cuadros,
los intervalos superiores a 33 ms, el estado de la GPU y una muestra de CPU y memoria de los
procesos de Electron. El uso de recursos del host de sesiones y de sus shells no se incluye en esa
muestra. Compara pasadas con la misma pantalla, escala, GPU y aplicaciones en segundo plano.

## Primera comparación (20 sesiones)

Medición local en Windows 11, con ventana de 1200 × 760, comparada con `ab405f8`:

| Escenario          | p95 entre cuadros | Intervalos >33 ms | Memoria del proceso de interfaz |
| ------------------ | ----------------- | ----------------- | ------------------------------- |
| Terminal y Cambios | 10,2 → 10,3 ms    | 5 → 5             | 468 → 404 MiB                   |
| Tablero            | 20,0 → 10,1 ms    | 3 → 0             | 485 → 413 MiB                   |

Es una pasada por versión, como referencia diagnóstica. El p95 del tablero mejoró; la terminal
bajo salida intensa todavía mostró picos. El tablero consulta las tarjetas próximas a la vista
y evita lanzar todas las consultas Git a la vez. La barra lateral cambia de ancho de una vez para
reducir los reajustes del terminal. **Ajustes › Apariencia › Reducir movimiento** permite omitir
las transiciones y los efectos animados, también si Windows los tiene habilitados.

La CI ejecuta `npm run look:exe` antes de publicar. Si falla, adjunta las capturas disponibles. Ese
recorrido comprueba la aplicación empaquetada; el ciclo de actualización desde una instalación
anterior sigue siendo una comprobación por separado.

## Segunda pasada: la salida de las sesiones

`npm run perf` ya daba unos 100 cuadros por segundo con 20 sesiones, así que el costo estaba antes
del dibujo, en el camino de la salida:

| Medida                                 | Antes   | Después |
| -------------------------------------- | ------- | ------- |
| Eco de una tecla (p50, ida y vuelta)   | 7,1 ms  | 0,9 ms  |
| Costo por trozo de salida, host y main | ~100 µs | ~7 µs   |

- El host y main guardaban los últimos 256 KB de salida cruda copiando la cadena entera en cada
  trozo. Ahora cada uno lleva una pantalla espejo (`src/main/mirror.ts`), que además es lo que se
  repinta al volver.
- El lote de salida de main esperaba siempre 6 ms. Ahora el primer trozo tras una pausa sale en el
  acto y solo se agrupan las ráfagas.
