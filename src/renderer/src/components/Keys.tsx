import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'

// "Ctrl+Shift+P" → una tecla por chip.
export function Keys({ combo }: { combo: string }): React.JSX.Element {
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
