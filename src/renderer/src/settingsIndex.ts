// Índice del buscador de Ajustes: una entrada por fila (o grupo), con palabras que la persona
// podría escribir. `settings.check.mts` comprueba que toda fila de Settings.tsx esté aquí.
// El patrón es el de settingsSearch de T3 Code (MIT).

export type SectionId =
  'appearance' | 'terminal' | 'changes' | 'notifications' | 'shortcuts' | 'updates' | 'advanced'

export type Entry = { section: SectionId; label: string; words: string }

export const SETTINGS_INDEX: Entry[] = [
  { section: 'appearance', label: 'Modo', words: 'claro oscuro automático sistema tema' },
  { section: 'appearance', label: 'Tema oscuro', words: 'grafito carbón pizarra humo gris paleta' },
  { section: 'appearance', label: 'Tema claro', words: 'tiza papel niebla gris paleta' },
  {
    section: 'appearance',
    label: 'Tamaño de la interfaz',
    words: 'zoom escala grande pequeño texto'
  },
  { section: 'appearance', label: 'Barra superior fija', words: 'titulo ventana esconder' },
  { section: 'appearance', label: 'Contraste', words: 'bordes texto secundario suave marcado' },
  { section: 'appearance', label: 'Reducir transparencia', words: 'vidrio desenfoque blur sólido' },
  {
    section: 'appearance',
    label: 'Reducir movimiento',
    words: 'animaciones fluidez rendimiento efectos'
  },
  {
    section: 'appearance',
    label: 'Velocidad de los paneles',
    words: 'animación duración barra lateral'
  },
  {
    section: 'terminal',
    label: 'Fuente',
    words: 'letra tipografía mono jetbrains cascadia consolas'
  },
  { section: 'terminal', label: 'Tamaño', words: 'letra fuente puntos' },
  { section: 'terminal', label: 'Interlineado', words: 'altura de línea espacio' },
  { section: 'terminal', label: 'Espacio entre letras', words: 'tracking separación' },
  { section: 'terminal', label: 'Grosor', words: 'negrita peso fino normal' },
  { section: 'terminal', label: 'Forma', words: 'cursor barra bloque subrayado' },
  { section: 'terminal', label: 'Parpadeo', words: 'cursor blink' },
  { section: 'terminal', label: 'Margen interior', words: 'padding relleno borde' },
  { section: 'terminal', label: 'Contraste mínimo', words: 'legibilidad colores texto' },
  { section: 'terminal', label: 'Desplazamiento suave', words: 'scroll animación' },
  { section: 'terminal', label: 'Historial', words: 'scrollback líneas buffer' },
  { section: 'terminal', label: 'Copiar al seleccionar', words: 'portapapeles copiar selección' },
  { section: 'terminal', label: 'Tema de VS Code', words: 'importar colores ansi vscode editor' },
  {
    section: 'terminal',
    label: 'Shell de las terminales nuevas',
    words: 'powershell cmd bash git'
  },
  { section: 'terminal', label: 'Orquestación', words: 'mcp agentes claude tareas herramientas' },
  { section: 'changes', label: 'Tamaño del código', words: 'diff letra fuente' },
  { section: 'changes', label: 'Ajustar líneas largas', words: 'diff wrap saltar línea' },
  { section: 'changes', label: 'Ignorar espacios en blanco', words: 'diff whitespace' },
  { section: 'changes', label: 'Ancho del panel', words: 'diff cambios tamaño' },
  { section: 'notifications', label: 'Avisar', words: 'notificación agente necesita' },
  { section: 'notifications', label: 'Sonido', words: 'alerta audio' },
  { section: 'notifications', label: 'Probar', words: 'ejemplo aviso' },
  { section: 'notifications', label: 'Seguir en la bandeja', words: 'tray cerrar segundo plano' },
  {
    section: 'notifications',
    label: 'Mantener las sesiones al salir',
    words: 'host persistente vivas'
  },
  { section: 'notifications', label: 'Detener todas las sesiones', words: 'cerrar matar parar' },
  {
    section: 'shortcuts',
    label: 'Atajos de teclado',
    words: 'teclas combinación cambiar reasignar'
  },
  { section: 'shortcuts', label: 'Ir a la sesión 1 a 9', words: 'ctrl número saltar posición' },
  { section: 'updates', label: 'Buscar al abrir Slate', words: 'actualizar versión automático' },
  { section: 'updates', label: 'Todas las versiones', words: 'releases descargar historial' },
  {
    section: 'advanced',
    label: 'Aceleración por GPU',
    words: 'webgl rendimiento gráficos tarjeta'
  },
  { section: 'advanced', label: 'Host de sesiones', words: 'procesos segundo plano' },
  { section: 'advanced', label: 'Procesos', words: 'memoria cpu pid detener host terminales' },
  { section: 'advanced', label: 'Carpeta de datos', words: 'archivos prefs json abrir' },
  { section: 'advanced', label: 'Registros', words: 'logs host.log errores' }
]

const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Las entradas que contienen todas las palabras escritas; las que las tienen en el título, antes.
export function searchSettings(query: string): Entry[] {
  const words = plain(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored = SETTINGS_INDEX.flatMap((e) => {
    const title = plain(e.label)
    const all = `${title} ${plain(e.words)}`
    if (!words.every((w) => all.includes(w))) return []
    return [{ e, rank: words.every((w) => title.includes(w)) ? 0 : 1 }]
  })
  return scored.sort((a, b) => a.rank - b.rank).map((x) => x.e)
}
