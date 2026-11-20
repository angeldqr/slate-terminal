import { Toaster as Sonner } from 'sonner'
import { useDark } from '@renderer/theme'

// Avisos apilados en vidrio, abajo a la derecha. Sonner los pausa con la ventana oculta, así que
// no se pierde ninguno mientras miras otra cosa.
export function Toaster(): React.JSX.Element {
  return (
    <Sonner
      theme={useDark() ? 'dark' : 'light'}
      position="bottom-right"
      visibleToasts={4}
      gap={8}
      offset={{ bottom: 16, right: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'glass pointer-events-auto flex w-[320px] items-center gap-2.5 rounded-lg px-3.5 py-3 text-[13px] text-foreground',
          title: 'font-medium',
          description: 'text-[12px] text-muted-foreground',
          actionButton:
            'ml-auto h-6 shrink-0 rounded-sm bg-foreground px-2 text-[12px] font-medium text-background',
          icon: 'shrink-0'
        }
      }}
    />
  )
}
