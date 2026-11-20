// Diff de un archivo con @pierre/diffs (Apache-2.0): resaltado en workers, cambios por palabra,
// apilado o lado a lado, y comentarios que van directo al terminal del agente.
// Idea del panel basada en T3 Code (MIT).
import { useRef, useState } from 'react'
import { PatchDiff, WorkerPoolContextProvider } from '@pierre/diffs/react'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { PaperPlaneTiltIcon, PlusIcon } from '@phosphor-icons/react'
import { flashHint, useStore } from '@renderer/store'
import { useDark } from '@renderer/theme'
import { Skeleton } from './ui/skeleton'

// Pool de workers como el de T3: entre 2 y 6 según los núcleos, y caché de 240 archivos.
const POOL = Math.max(2, Math.min(6, Math.floor((navigator.hardwareConcurrency || 4) / 2)))

export function DiffPool({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => new DiffsWorker(),
        poolSize: POOL,
        totalASTLRUCacheSize: 240
      }}
      highlighterOptions={{ lineDiffType: 'word' }}
    >
      {children}
    </WorkerPoolContextProvider>
  )
}

// Los colores de Slate sobre los del visor: fondo transparente (lo pone la tarjeta) y añadido y
// quitado con los tintes de estado.
const CSS = `
:host {
  --diffs-bg: transparent;
  --diffs-bg-context-override: transparent;
  --diffs-addition-color-override: #8fbf7f;
  --diffs-deletion-color-override: #e5534b;
  --diffs-font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
  --diffs-line-height: 1.6;
}`

type Side = 'deletions' | 'additions'
type Draft = { side: Side; lineNumber: number }

function CommentBox({
  onSend,
  onCancel
}: {
  onSend: (text: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const send = (): void => {
    if (text.trim()) onSend(text.trim())
  }
  return (
    <div className="m-2 rounded-md border border-border bg-popover p-2 font-sans text-[12px]">
      <textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send()
        }}
        aria-label="Comentario para el agente"
        placeholder="Dile al agente qué cambiar aquí…"
        className="block w-full resize-none bg-transparent leading-5 outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <button
          onClick={onCancel}
          className="h-6 rounded-sm px-2 text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
        <button
          onClick={send}
          disabled={!text.trim()}
          className="inline-flex h-6 items-center gap-1 rounded-sm bg-foreground px-2 font-medium text-background disabled:opacity-40"
        >
          <PaperPlaneTiltIcon size={12} /> Enviar
        </button>
      </div>
    </div>
  )
}

export function DiffView({
  sessionId,
  path,
  patch
}: {
  sessionId: string
  path: string
  patch: string | null
}): React.JSX.Element {
  const dark = useDark()
  const codeFontSize = useStore((s) => s.prefs.codeFontSize)
  const diffWrap = useStore((s) => s.prefs.diffWrap)
  const diffStyle = useStore((s) => s.prefs.diffStyle)
  const [draft, setDraft] = useState<Draft | null>(null)
  const sending = useRef(false)

  if (patch === null) {
    return (
      <div className="space-y-2 px-4 py-3">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    )
  }

  const send = async (text: string): Promise<void> => {
    if (!draft || sending.current) return
    sending.current = true
    const where = draft.side === 'deletions' ? 'línea quitada' : 'línea'
    const ok = await window.slate.sessions.comment(
      sessionId,
      `Sobre ${path}, ${where} ${draft.lineNumber}: ${text}`
    )
    sending.current = false
    flashHint(ok ? 'Comentario enviado al agente' : 'Esta sesión ya terminó')
    if (ok) setDraft(null)
  }

  return (
    <PatchDiff<Draft>
      patch={patch}
      options={{
        theme: { dark: 'pierre-dark', light: 'pierre-light' },
        themeType: dark ? 'dark' : 'light',
        diffStyle,
        overflow: diffWrap ? 'wrap' : 'scroll',
        lineDiffType: 'word',
        disableFileHeader: true,
        hunkSeparators: 'line-info',
        unsafeCSS: CSS
      }}
      style={{ fontSize: codeFontSize }}
      lineAnnotations={draft ? [{ ...draft, metadata: draft }] : []}
      renderAnnotation={() => <CommentBox onSend={send} onCancel={() => setDraft(null)} />}
      renderGutterUtility={(hovered) => (
        <button
          aria-label="Comentar esta línea"
          title="Comentar esta línea"
          onClick={() => {
            const h = hovered()
            if (h) setDraft({ side: h.side, lineNumber: h.lineNumber })
          }}
          className="grid size-4 place-items-center rounded-sm bg-foreground text-background"
        >
          <PlusIcon size={11} weight="bold" />
        </button>
      )}
    />
  )
}
