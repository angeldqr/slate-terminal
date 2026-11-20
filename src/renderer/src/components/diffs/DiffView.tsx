// Diff de un archivo con @pierre/diffs (Apache-2.0): resaltado en workers, cambios por palabra,
// apilado o lado a lado, y comentarios que van directo al terminal del agente.
// Basado en el visor de diffs de T3 Code (MIT); ver THIRD_PARTY_NOTICES.md.
import { useRef, useState } from 'react'
import { PatchDiff, WorkerPoolContextProvider } from '@pierre/diffs/react'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { PaperPlaneTiltIcon, PlusIcon } from '@phosphor-icons/react'
import { patchLine } from '@renderer/changes.logic'
import { flashHint, useStore } from '@renderer/store'
import type { DiffScope } from '../../../../shared/types'
import { useDark } from '@renderer/theme'
import { Skeleton } from '../ui/skeleton'

// ponytail: el backend 'highlights' del plan no pinta el diff en este Electron; queda el de shiki.
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
  /* Añadido y quitado con los colores de estado de Slate (siguen al tema claro u oscuro). */
  --diffs-addition-color-override: var(--added);
  --diffs-deletion-color-override: var(--removed);
  --diffs-bg-addition-override: color-mix(in srgb, var(--added) 13%, transparent);
  --diffs-bg-deletion-override: color-mix(in srgb, var(--removed) 13%, transparent);
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--added) 30%, transparent);
  --diffs-bg-deletion-emphasis-override: color-mix(in srgb, var(--removed) 30%, transparent);
  --diffs-bg-separator-override: color-mix(in srgb, var(--foreground) 5%, transparent);
  --diffs-font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
  --diffs-line-height: 1.6;
}`

type Side = 'deletions' | 'additions'
type Draft = { side: Side; lineNumber: number; snippet: string }

// El comentario a medias de cada archivo sobrevive a plegar la fila o cambiar de panel.
const drafts = new Map<string, { draft: Draft; text: string }>()

function CommentBox({
  text,
  setText,
  snippet,
  onSend,
  onCancel
}: {
  text: string
  setText: (text: string) => void
  snippet: string
  onSend: (text: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const send = (): void => {
    if (text.trim()) onSend(text.trim())
  }
  return (
    <div className="m-2 rounded-md border border-border bg-popover p-2 font-sans text-[12px]">
      {snippet && (
        <p className="mb-1.5 truncate font-mono text-muted-foreground" title={snippet}>
          {snippet.trim()}
        </p>
      )}
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
  patch,
  scope
}: {
  sessionId: string
  path: string
  patch: string | null
  scope: DiffScope
}): React.JSX.Element {
  const dark = useDark()
  const codeFontSize = useStore((s) => s.prefs.codeFontSize)
  const diffWrap = useStore((s) => s.prefs.diffWrap)
  const diffStyle = useStore((s) => s.prefs.diffStyle)
  const key = `${sessionId}:${scope}:${path}`
  const [saved, setSaved] = useState(() => drafts.get(key) ?? null)
  const draft = saved?.draft ?? null
  const update = (next: { draft: Draft; text: string } | null): void => {
    if (next) drafts.set(key, next)
    else drafts.delete(key)
    setSaved(next)
  }
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
    try {
      await deliver(text)
    } finally {
      sending.current = false
    }
  }
  const deliver = async (text: string): Promise<void> => {
    if (!draft) return
    const where = draft.side === 'deletions' ? 'línea quitada' : 'línea'
    // La cita va con el comentario: aunque el archivo cambie, el agente sabe a qué se refiere.
    const quote = draft.snippet.trim() ? ` («${draft.snippet.trim().slice(0, 120)}»)` : ''
    const ok = await window.slate.sessions.comment(
      sessionId,
      `Sobre ${path}, ${where} ${draft.lineNumber}${quote}: ${text}`
    )
    flashHint(ok ? 'Comentario enviado al agente' : 'Esta sesión ya terminó')
    if (ok) update(null)
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
        unsafeCSS: CSS,
        // "Desplegar contexto" de los separadores: trae el archivo entero de los dos lados.
        loadDiffFiles: async () => {
          const both = await window.slate.git.fileContents(sessionId, path, scope)
          // Sin ninguno de los dos lados (muy grande o ilegible) no hay contexto que inventar.
          if (!both || (both.old === null && both.new === null)) throw new Error('sin contenido')
          return {
            oldFile: { name: path, contents: both?.old ?? '' },
            newFile: { name: path, contents: both?.new ?? '' }
          }
        }
      }}
      style={{ fontSize: codeFontSize }}
      lineAnnotations={
        draft ? [{ side: draft.side, lineNumber: draft.lineNumber, metadata: draft }] : []
      }
      renderAnnotation={() => (
        <CommentBox
          text={saved?.text ?? ''}
          setText={(text) => draft && update({ draft, text })}
          snippet={draft?.snippet ?? ''}
          onSend={send}
          onCancel={() => update(null)}
        />
      )}
      renderGutterUtility={(hovered) => (
        <button
          aria-label="Comentar esta línea"
          title="Comentar esta línea"
          onClick={() => {
            const h = hovered()
            if (h) {
              update({
                draft: {
                  side: h.side,
                  lineNumber: h.lineNumber,
                  snippet: patchLine(patch, h.side, h.lineNumber)
                },
                text: ''
              })
            }
          }}
          className="grid size-4 place-items-center rounded-sm bg-foreground text-background"
        >
          <PlusIcon size={11} weight="bold" />
        </button>
      )}
    />
  )
}
