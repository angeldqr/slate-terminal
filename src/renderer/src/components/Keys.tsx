import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'

// "Ctrl+Shift+P" → una tecla por chip.
export function Keys({ combo }: { combo: string }): React.JSX.Element {
  if (!combo) return <span className="text-[12px] text-muted-foreground">Sin atajo</span>
  return (
    <KbdGroup>
      {combo.split('+').map((key) => (
        <Kbd key={key} className="text-[12px]">
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  )
}
