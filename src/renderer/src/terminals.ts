// Acciones de cada terminal montado, para que los atajos actúen sobre el que tiene el foco.
export type TerminalActions = {
  copy: () => void
  paste: () => void
  find: () => void
  focus: () => void
}

export const terminals = new Map<string, TerminalActions>()
