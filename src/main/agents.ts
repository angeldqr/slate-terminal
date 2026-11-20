import { execFile } from 'node:child_process'
import type { Agent } from '../shared/types'

// Agentes que Slate sabe lanzar. `hooks`: reporta su estado por hooks HTTP (solo Claude Code por ahora).
// `promptFlag`: cómo arrancan ya con una tarea, sin salir del modo interactivo (según su documentación).
export const AGENTS: Agent[] = [
  { id: 'claude', name: 'Claude Code', cmd: 'claude', hooks: true, promptFlag: '' },
  { id: 'codex', name: 'Codex', cmd: 'codex', promptFlag: '' },
  { id: 'gemini', name: 'Gemini CLI', cmd: 'gemini', promptFlag: '-i' },
  { id: 'opencode', name: 'OpenCode', cmd: 'opencode', promptFlag: '--prompt' },
  { id: 'cursor', name: 'Cursor Agent', cmd: 'cursor-agent', promptFlag: '' }
]

const which = (cmd: string): Promise<boolean> =>
  new Promise((resolve) =>
    execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], (err) => resolve(!err))
  )

export async function detectAgents(): Promise<Agent[]> {
  return Promise.all(AGENTS.map(async (a) => ({ ...a, installed: await which(a.cmd) })))
}
