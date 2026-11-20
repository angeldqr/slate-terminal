// Prueba de los worktrees sobre un repo temporal: `npm run check`.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorktree, git, removeWorktree, repoRoot, slug, worktreeNames } from './git.ts'

assert.equal(slug('Claude Code 2'), 'claude-code-2')
assert.equal(slug('Gemini CLI'), 'gemini-cli')
assert.equal(slug('¡¡ñandú!!'), 'nandu')
assert.equal(slug('***'), 'sesion')
assert.equal(
  slug('Añade una búsqueda difusa a la paleta de comandos de Slate'),
  'anade-una-busqueda-difusa-a-la-paleta-de'
)

const root = mkdtempSync(join(tmpdir(), 'slate-git-'))
try {
  assert.equal(await repoRoot(root), null, 'una carpeta sin git no es repo')
  await git(['init', '-b', 'main'], root)
  await git(
    ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', 'inicio'],
    root
  )
  writeFileSync(join(root, 'a.txt'), 'hola\n')
  await git(['add', '.'], root)
  await git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'a'], root)
  assert.ok(await repoRoot(root))

  const wt = await createWorktree(root, 'claude-1')
  assert.equal(wt.branch, 'slate/claude-1')
  assert.equal(wt.base, 'main')
  assert.ok(existsSync(join(wt.path, 'a.txt')), 'el worktree trae los archivos')
  assert.deepEqual(await worktreeNames(root), ['claude-1'])
  // .slate/ queda fuera de git sin tocar el .gitignore del repo.
  assert.match(readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8'), /^\.slate\/$/m)
  assert.equal((await git(['status', '--porcelain'], root)).trim(), '', 'el repo sigue limpio')
  // Un segundo worktree no duplica la línea de exclusión.
  const wt2 = await createWorktree(root, 'gemini-1')
  assert.equal(
    readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8').match(/\.slate\//g)?.length,
    1
  )

  await removeWorktree(root, wt)
  await removeWorktree(root, wt2)
  assert.ok(!existsSync(wt.path), 'la carpeta se borra')
  assert.deepEqual(await worktreeNames(root), [])
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('git: ok')
