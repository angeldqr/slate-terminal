import { execFile } from 'node:child_process'
import type { Agent } from '../shared/types'

// Agentes que Slate sabe lanzar. `hooks`: reporta su estado por hooks HTTP (solo Claude Code por ahora).
export const AGENTS: Agent[] = [
  { id: 'claude', name: 'Claude Code', cmd: 'claude', hooks: true },
  { id: 'codex', name: 'Codex', cmd: 'codex' },
  { id: 'gemini', name: 'Gemini CLI', cmd: 'gemini' },
  { id: 'opencode', name: 'OpenCode', cmd: 'opencode' },
  { id: 'cursor', name: 'Cursor Agent', cmd: 'cursor-agent' }
]

const which = (cmd: string): Promise<boolean> =>
  new Promise((resolve) =>
    execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], (err) => resolve(!err))
  )

export async function detectAgents(): Promise<Agent[]> {
  return Promise.all(AGENTS.map(async (a) => ({ ...a, installed: await which(a.cmd) })))
}
