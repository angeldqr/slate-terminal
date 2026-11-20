import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { SESSION_KINDS, STATUSES, type SessionInfo } from '../shared/types'
import { sessionChanges } from './changes'
import {
  createSession,
  emit,
  listSessions,
  readScreen,
  sendText,
  sessionInfo,
  waitFor,
  whenSettled
} from './sessions'

// El MCP de Slate: herramientas para que un agente dirija a otros (orquestación).
// Cada sesión de Claude Code lo recibe con su propia ruta, así cada llamada sabe quién la hace.
// Sin estado: un servidor por petición, como recomienda el SDK para HTTP.
// Las descripciones van en inglés: es lo que los modelos usan con más fiabilidad para elegir
// herramienta; las respuestas son texto plano corto.

const MAX_TASK = 4 // como en Nueva tarea: más sesiones lado a lado ya no se leen
// Un agente lanza trabajadores y estos, como mucho, uno más cada uno: sin tope, cada nivel podría
// abrir cuatro ramas más y la cadena no acabaría nunca.
const MAX_DEPTH = 2
const depth = (s: SessionInfo | undefined): number =>
  s?.parent ? 1 + depth(sessionInfo(s.parent)) : 0

// ponytail: el token del servidor es uno para todas las sesiones. Un agente que lea los archivos
// de configuración de otras podría hacerse pasar por ellas; eso ya lo puede hacer cualquier
// programa del usuario. Un token por sesión, si Slate llega a ejecutar código de terceros.

const text = (t: string): { content: { type: 'text'; text: string }[] } => ({
  content: [{ type: 'text', text: t }]
})
const fail = (t: string): { content: { type: 'text'; text: string }[]; isError: true } => ({
  ...text(t),
  isError: true
})

const folderOf = (s: SessionInfo): string => s.worktree?.project ?? s.cwd
const describe = (s: SessionInfo, me: string): string =>
  [
    `id: ${s.id}${s.id === me ? ' (you)' : ''}`,
    `title: ${s.title}`,
    `agent: ${s.kind}`,
    `status: ${s.status}`,
    `folder: ${folderOf(s)}`,
    s.worktree && `branch: ${s.worktree.branch} (from ${s.worktree.base})`,
    s.parent && `launched by: ${s.parent}${s.parent === me ? ' (you)' : ''}`
  ]
    .filter(Boolean)
    .join('\n')

function tools(me: string): McpServer {
  const server = new McpServer({ name: 'slate', version: '0.1.0' })
  const other = (id: string): SessionInfo | string => {
    if (id === me) return 'That is your own session.'
    return sessionInfo(id) ?? `No session with id ${id}. Call list_sessions to see the ids.`
  }

  server.registerTool(
    'list_sessions',
    {
      description:
        'List every terminal session open in Slate: agents and shells, with their status ' +
        '(working, attention = waiting for the user, done, idle, error, exited), folder and git branch.'
    },
    async () =>
      text(
        listSessions()
          .map((s) => describe(s, me))
          .join('\n\n')
      )
  )

  server.registerTool(
    'new_task',
    {
      description:
        'Start one or more sessions on a task, in your own project folder. Each agent starts with ' +
        'the prompt already submitted; for `shell`, the prompt is typed as a command. With isolate (default), every session works in its own git ' +
        'worktree and branch, so they never overwrite each other or you. Repeat an agent in ' +
        '`agents` to run several copies. They open side by side in Slate, and they can call ' +
        '`report` to message you when they finish.',
      inputSchema: {
        prompt: z.string().min(1).describe('The task, as you would type it to the agent.'),
        agents: z.array(z.enum(SESSION_KINDS)).min(1).max(MAX_TASK),
        isolate: z.boolean().default(true)
      }
    },
    async ({ prompt, agents, isolate }) => {
      const caller = sessionInfo(me)
      if (!caller) return fail('Your session is no longer open.')
      if (depth(caller) >= MAX_DEPTH) {
        return fail(
          'Sessions this deep cannot start more: report to the session that launched you.'
        )
      }
      const created: SessionInfo[] = []
      let failure = ''
      try {
        for (const kind of agents) {
          created.push(
            await createSession(folderOf(caller), kind, {
              isolate,
              prompt,
              parent: me
            })
          )
        }
      } catch (err) {
        failure = (err as Error).message
        if (!created.length) return fail(failure)
      } finally {
        if (created.length) emit('sessions:adopted', created, me)
      }
      // Una shell no es un agente: la tarea se le escribe como comando.
      // (cuando ya arrancó: lo tecleado antes de que la shell esté lista se pierde).
      for (const s of created) {
        if (s.kind === 'shell') whenSettled(s.id).then(() => sendText(s.id, prompt, true))
      }
      return text(
        `Started ${created.length} of ${agents.length}` +
          (failure ? ` (the rest failed: ${failure})` : '') +
          ':\n\n' +
          created.map((s) => describe(s, me)).join('\n\n') +
          '\n\nUse wait_for_status to wait until they finish, read_screen to see them and get_changes to review their work.'
      )
    }
  )

  server.registerTool(
    'send_to_session',
    {
      description:
        'Type text into another session, as if the user typed it, and press Enter (submit: false ' +
        'leaves it unsent). Use it to give an agent more instructions or answer its question.',
      inputSchema: {
        id: z.string(),
        text: z.string().min(1),
        submit: z.boolean().default(true)
      }
    },
    async ({ id, text: message, submit }) => {
      const target = other(id)
      if (typeof target === 'string') return fail(target)
      return sendText(id, message, submit)
        ? text(`Sent to ${target.title}.`)
        : fail(`${target.title} has exited.`)
    }
  )

  server.registerTool(
    'read_screen',
    {
      description: "Read what is on another session's terminal right now, as plain text.",
      inputSchema: { id: z.string(), lines: z.number().int().min(5).max(400).default(60) }
    },
    async ({ id, lines }) => {
      const target = other(id)
      if (typeof target === 'string') return fail(target)
      return text(readScreen(id, lines) || '(the screen is empty)')
    }
  )

  server.registerTool(
    'wait_for_status',
    {
      description:
        'Wait until a session reaches one of the given statuses (by default: done, attention, ' +
        'error or exited) and return its status. Returns early with "still <status>" on timeout.',
      inputSchema: {
        id: z.string(),
        until: z.array(z.enum(STATUSES)).default(['done', 'attention', 'error', 'exited']),
        timeout_seconds: z.number().int().min(1).max(540).default(300)
      }
    },
    async ({ id, until, timeout_seconds }, extra) => {
      const target = other(id)
      if (typeof target === 'string') return fail(target)
      const status = await waitFor(id, until, timeout_seconds * 1000, extra.signal)
      if (status === null) return text(`${target.title} was closed.`)
      return text(until.includes(status) ? status : `still ${status}`)
    }
  )

  server.registerTool(
    'get_changes',
    {
      description:
        'List the files a session changed (added, modified, deleted, with +/- line counts). For ' +
        'an isolated session, compared with the branch it started from.',
      inputSchema: { id: z.string() }
    },
    async ({ id }) => {
      const changes = await sessionChanges(id)
      if (!changes) return fail('That session is not in a git repository.')
      if (!changes.files.length) return text(`No changes yet on ${changes.branch}.`)
      return text(
        `${changes.branch} vs ${changes.base}:\n` +
          changes.files.map((f) => `${f.status} ${f.path} +${f.add} -${f.del}`).join('\n')
      )
    }
  )

  server.registerTool(
    'report',
    {
      description:
        'Send a message to the session that launched you (with new_task): say when you finish, ' +
        'what you did, or what you need. It arrives in their conversation as a new message.',
      inputSchema: { message: z.string().min(1) }
    },
    async ({ message }) => {
      const self = sessionInfo(me)
      const parent = self?.parent && sessionInfo(self.parent)
      if (!self || !parent) return fail('No session launched you, so there is nobody to report to.')
      // Si el padre espera una respuesta del usuario (un permiso, una pregunta), Enter la
      // contestaría por él: el mensaje queda escrito sin enviar.
      const waiting = parent.status === 'attention'
      if (!sendText(parent.id, `[Slate · ${self.title}] ${message}`, !waiting)) {
        return fail(`${parent.title} has exited.`)
      }
      return text(
        waiting
          ? `Typed into ${parent.title} without sending: it is waiting for the user.`
          : `Reported to ${parent.title}.`
      )
    }
  )

  return server
}

export async function handleMcp(
  sessionId: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!sessionInfo(sessionId)) {
    res.writeHead(404).end()
    return
  }
  // Sin estado no hay flujo que abrir con GET ni sesión que borrar con DELETE.
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' }).end()
    return
  }
  // Solo a 127.0.0.1 o localhost: una página que resuelva su dominio a esta máquina (DNS
  // rebinding) llega con otro Host y se rechaza.
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? '')) {
    res.writeHead(403).end()
    return
  }
  const server = tools(sessionId)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } catch {
    if (!res.headersSent) res.writeHead(500).end()
  }
}
