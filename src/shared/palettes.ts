// Temas de Slate: todos en grises (el color solo marca estado). Cada uno define los tokens de la
// interfaz; el terminal toma de aquí su fondo, su texto y su selección.
export type PaletteTokens = {
  background: string // lienzo del terminal
  sidebar: string // marco y barra lateral
  popover: string
  accent: string // hover y selección
  border: string
  muted: string // texto secundario
  foreground: string
  selection: string // selección del terminal
}
export type Palette = { id: string; label: string; dark: boolean; tokens: PaletteTokens }

export const PALETTES: Palette[] = [
  {
    id: 'grafito',
    label: 'Grafito',
    dark: true,
    tokens: {
      background: '#0a0a0a',
      sidebar: '#000000',
      popover: '#111112',
      accent: '#1f2022',
      border: '#1d1e20', // ≈ blanco al 8 % sobre el lienzo
      muted: '#8a8d92',
      foreground: '#ededee',
      selection: '#34363a'
    }
  },
  {
    id: 'carbon',
    label: 'Carbón',
    dark: true,
    tokens: {
      background: '#000000',
      sidebar: '#0a0a0a',
      popover: '#121212',
      accent: '#1e1e1e',
      border: '#1f1f1f',
      muted: '#8a8a8a',
      foreground: '#f2f2f2',
      selection: '#333333'
    }
  },
  {
    id: 'pizarra',
    label: 'Pizarra',
    dark: true,
    tokens: {
      background: '#0d1117',
      sidebar: '#151b23',
      popover: '#151b23',
      accent: '#232b36',
      border: '#232b36',
      muted: '#8b949e',
      foreground: '#e6edf3',
      selection: '#2f3a48'
    }
  },
  {
    id: 'humo',
    label: 'Humo',
    dark: true,
    tokens: {
      background: '#11100f',
      sidebar: '#1a1917',
      popover: '#1a1917',
      accent: '#2a2825',
      border: '#2a2825',
      muted: '#8f8a83',
      foreground: '#eeece8',
      selection: '#3d3a36'
    }
  },
  {
    id: 'tiza',
    label: 'Tiza',
    dark: false,
    tokens: {
      background: '#fafafa',
      sidebar: '#f0f1f2',
      popover: '#ffffff',
      accent: '#dcdee0',
      border: '#dcdee0',
      muted: '#6b7076',
      foreground: '#121314',
      selection: '#d4d7db'
    }
  },
  {
    id: 'papel',
    label: 'Papel',
    dark: false,
    tokens: {
      background: '#fbfaf7',
      sidebar: '#f1eee9',
      popover: '#ffffff',
      accent: '#e2ddd5',
      border: '#e2ddd5',
      muted: '#736e66',
      foreground: '#1b1a18',
      selection: '#e0d9cd'
    }
  },
  {
    id: 'niebla',
    label: 'Niebla',
    dark: false,
    tokens: {
      background: '#f7f9fb',
      sidebar: '#ecf0f4',
      popover: '#ffffff',
      accent: '#d7dde5',
      border: '#d7dde5',
      muted: '#636d79',
      foreground: '#10151c',
      selection: '#cfd8e3'
    }
  }
]

// El tema guardado, o el de siempre si ya no existe (o no es del modo pedido).
export function paletteOf(id: unknown, dark: boolean): Palette {
  return (
    PALETTES.find((p) => p.id === id && p.dark === dark) ?? PALETTES.find((p) => p.dark === dark)!
  )
}
