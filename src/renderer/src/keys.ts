// Convierte una pulsación en su combinación escrita, p. ej. "Ctrl+Shift+T".
// Se usa `code` para letras y números: así Shift no cambia la tecla (Shift+1 sería "!")
// y la distribución del teclado (español, inglés…) no cambia el atajo.
export type KeyPress = Pick<
  KeyboardEvent,
  'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
>

export function comboOf(e: KeyPress): string {
  const key = e.code.startsWith('Key')
    ? e.code.slice(3)
    : e.code.startsWith('Digit')
      ? e.code.slice(5)
      : e.key.length === 1
        ? e.key.toUpperCase()
        : e.key
  return [e.ctrlKey && 'Ctrl', e.metaKey && 'Cmd', e.altKey && 'Alt', e.shiftKey && 'Shift', key]
    .filter(Boolean)
    .join('+')
}
