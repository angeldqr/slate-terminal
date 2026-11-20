import {
  createHighlighterCore,
  type HighlighterCore,
  type ThemedToken,
  type ThemeRegistration
} from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledLanguages } from 'shiki/langs'

// Resaltado del diff con Shiki, en tiza: solo grises, peso y cursiva. En el panel de cambios el
// color queda para lo que comunica estado (verde añadido, rojo quitado), como en el resto de Slate.
// Motor de JavaScript: sin WebAssembly, que la política de seguridad de la página no permite.

const chalk = (name: string, type: 'dark' | 'light', ink: string[]): ThemeRegistration => ({
  name,
  type,
  colors: { 'editor.foreground': ink[1], 'editor.background': '#00000000' },
  tokenColors: [
    { settings: { foreground: ink[1] } },
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: ink[3], fontStyle: 'italic' }
    },
    {
      scope: ['keyword', 'storage', 'keyword.control', 'storage.type', 'storage.modifier'],
      settings: { foreground: ink[0], fontStyle: 'bold' }
    },
    {
      scope: ['string', 'string.template', 'markup.inline.raw'],
      settings: { foreground: ink[2] }
    },
    {
      scope: ['constant', 'constant.numeric', 'constant.language', 'support.constant'],
      settings: { foreground: ink[2], fontStyle: 'italic' }
    },
    {
      scope: ['entity.name.function', 'support.function', 'entity.name.type', 'entity.name.tag'],
      settings: { foreground: ink[0] }
    },
    { scope: ['punctuation', 'meta.brace'], settings: { foreground: ink[2] } },
    {
      scope: ['markup.heading', 'markup.bold'],
      settings: { foreground: ink[0], fontStyle: 'bold' }
    }
  ]
})

// De más a menos presencia: tiza, texto, ceniza clara, ceniza (styles.css).
const THEMES = {
  dark: chalk('slate-dark', 'dark', ['#edeeef', '#c9ccd0', '#9aa0a6', '#6b7076']),
  light: chalk('slate-light', 'light', ['#121314', '#2c2f33', '#5c6168', '#878c92'])
}

// Extensiones que Shiki no tiene como lenguaje ni como alias.
const EXT: Record<string, string> = { h: 'c', hpp: 'cpp', psm1: 'powershell' }

export function langOf(path: string): string {
  const name = path.split(/[\\/]/).pop()!.toLowerCase()
  if (name === 'dockerfile') return 'docker'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  const lang = EXT[ext] ?? ext
  return lang in bundledLanguages ? lang : 'text'
}

let highlighter: Promise<HighlighterCore> | undefined
const ready = (): Promise<HighlighterCore> =>
  (highlighter ??= createHighlighterCore({
    themes: [THEMES.dark, THEMES.light],
    langs: [],
    engine: createJavaScriptRegexEngine()
  }))

// Tokens por línea. Cada lenguaje se carga la primera vez que aparece.
export async function tokenize(
  code: string,
  lang: string,
  dark: boolean
): Promise<ThemedToken[][]> {
  const h = await ready()
  if (lang !== 'text' && !h.getLoadedLanguages().includes(lang)) {
    await h.loadLanguage(bundledLanguages[lang as keyof typeof bundledLanguages])
  }
  return h.codeToTokensBase(code, {
    lang,
    theme: dark ? 'slate-dark' : 'slate-light'
  })
}
