// Prueba de los worktrees y del panel de cambios sobre un repo temporal: `npm run check`.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  changes,
  commitAll,
  discardFile,
  compareUrl,
  createWorktree,
  diffFrom,
  fileContents,
  fileDiff,
  git,
  mergeSquash,
  removeWorktree,
  repoRoot,
  slug,
  stripCredits,
  worktreeNames
} from './git.ts'

const NL = String.fromCharCode(10)
const lines = (...l: string[]): string => l.join(NL)

assert.equal(slug('Claude Code 2'), 'claude-code-2')
assert.equal(slug('Gemini CLI'), 'gemini-cli')
assert.equal(slug('¡¡ñandú!!'), 'nandu')
assert.equal(slug('***'), 'sesion')
assert.equal(
  slug('Añade una búsqueda difusa a la paleta de comandos de Slate'),
  'anade-una-busqueda-difusa-a-la-paleta-de'
)

const root = mkdtempSync(join(tmpdir(), 'slate-git-'))
const as = ['-c', 'user.name=t', '-c', 'user.email=t@t']
try {
  assert.equal(await repoRoot(root), null, 'una carpeta sin git no es repo')
  await git(['init', '-b', 'main'], root)
  await git(['config', 'user.name', 't'], root)
  await git(['config', 'user.email', 't@t'], root)
  await git([...as, 'commit', '--allow-empty', '-m', 'inicio'], root)
  writeFileSync(join(root, 'a.txt'), lines('hola', ''))
  writeFileSync(join(root, 'viejo.txt'), lines('adiós', ''))
  await git(['add', '.'], root)
  await git([...as, 'commit', '-m', 'a'], root)
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

  // Lo que hizo la sesión: un archivo editado, uno nuevo sin seguimiento y uno borrado.
  writeFileSync(join(wt.path, 'a.txt'), lines('hola', 'mundo', ''))
  writeFileSync(join(wt.path, 'nuevo.ts'), lines('export const x = 1', ''))
  await git(['rm', '-q', 'viejo.txt'], wt.path)
  const from = await diffFrom(wt.path, wt.base)
  assert.deepEqual(
    (await changes(wt.path, from)).map((f) => [f.path, f.status, f.add, f.del]),
    [
      ['a.txt', 'M', 1, 0],
      ['nuevo.ts', 'A', 1, 0],
      ['viejo.txt', 'D', 0, 1]
    ]
  )
  assert.match(await fileDiff(wt.path, from, 'a.txt'), /^\+mundo$/m)
  assert.equal(
    await fileDiff(wt.path, from, 'nuevo.ts'),
    lines('--- /dev/null', '+++ b/nuevo.ts', '@@ -0,0 +1,1 @@', '+export const x = 1', '')
  )

  // Descartar un archivo: el modificado vuelve a como estaba, el nuevo desaparece; el resto sigue.
  await discardFile(wt.path, from, 'nuevo.ts')
  assert.equal(existsSync(join(wt.path, 'nuevo.ts')), false, 'el nuevo se quita')
  await discardFile(wt.path, from, 'a.txt')
  assert.doesNotMatch(
    readFileSync(join(wt.path, 'a.txt'), 'utf8'),
    /mundo/,
    'el modificado se restaura'
  )
  assert.equal(existsSync(join(wt.path, 'viejo.txt')), false, 'lo demás no se toca')
  writeFileSync(join(wt.path, 'a.txt'), lines('hola', 'mundo', ''))
  writeFileSync(join(wt.path, 'nuevo.ts'), lines('export const x = 1', ''))

  // Fusionar: commit de lo pendiente y squash en main, sin los créditos del agente.
  assert.equal(await commitAll(wt.path, 'Añade saludo'), true)
  assert.equal(await commitAll(wt.path, 'nada'), false, 'sin cambios no hay commit')
  // Con main sucio no se fusiona.
  writeFileSync(join(root, 'a.txt'), lines('sucio', ''))
  await assert.rejects(mergeSquash(root, wt.branch, 'main', 'x'), /cambios sin guardar/)
  await git(['checkout', '--', 'a.txt'], root)
  // En otra rama tampoco: el mensaje dice en cuál está.
  await git(['checkout', '-q', '-b', 'otra'], root)
  await assert.rejects(mergeSquash(root, wt.branch, 'main', 'x'), /está en otra/)
  await git(['checkout', '-q', 'main'], root)
  await mergeSquash(
    root,
    wt.branch,
    'main',
    lines('Añade saludo', '', 'Co-Authored-By: Claude <noreply@anthropic.com>')
  )
  // core.autocrlf puede dejarlo con CRLF al sacarlo en Windows: se compara el contenido.
  assert.equal(
    readFileSync(join(root, 'nuevo.ts'), 'utf8').replace(/\r/g, ''),
    lines('export const x = 1', '')
  )
  assert.ok(!existsSync(join(root, 'viejo.txt')), 'el borrado también se fusiona')
  assert.equal((await git(['log', '-1', '--format=%B'], root)).trim(), 'Añade saludo')
  // Una rama sin cambios no se fusiona.
  await assert.rejects(mergeSquash(root, wt2.branch, 'main', 'x'), /no tiene cambios/)

  // Alcances y exclusiones: un commit sin d.txt, el último commit como alcance y el contenido de ambos lados.
  writeFileSync(join(wt2.path, 'c.txt'), lines('c', ''))
  writeFileSync(join(wt2.path, 'd.txt'), lines('d', ''))
  assert.equal(await commitAll(wt2.path, 'c', ['d.txt']), true)
  assert.equal(
    (await git(['show', '--name-only', '--format=', 'HEAD'], wt2.path)).trim(),
    'c.txt',
    'lo excluido no entra en el commit'
  )
  assert.deepEqual(
    (await changes(wt2.path, 'HEAD')).map((f) => f.path),
    ['d.txt'],
    'sin guardar: solo lo excluido'
  )
  assert.deepEqual(
    (await changes(wt2.path, 'HEAD~1', 'HEAD')).map((f) => f.path),
    ['c.txt'],
    'último commit: solo lo que entró'
  )
  assert.match(await fileDiff(wt2.path, 'HEAD~1', 'c.txt', false, 'HEAD'), /^\+c$/m)
  assert.deepEqual(await fileContents(wt2.path, 'HEAD~1', 'c.txt', 'HEAD'), {
    old: null,
    new: lines('c', '')
  })
  assert.equal(
    (await fileContents(wt2.path, 'HEAD', 'd.txt')).new?.replace(/\r/g, ''),
    lines('d', '')
  )
  rmSync(join(wt2.path, 'd.txt'))

  // Un repo anidado sin seguimiento no rompe la lista: sale como entrada sin vista previa.
  mkdirSync(join(wt2.path, 'otro'))
  await git(['init', '-q'], join(wt2.path, 'otro'))
  const nested = (await changes(wt2.path, await diffFrom(wt2.path, 'main'))).find((f) =>
    f.path.startsWith('otro')
  )
  assert.ok(nested?.binary, 'el repo anidado aparece, sin leerse')
  rmSync(join(wt2.path, 'otro'), { recursive: true, force: true })

  // Si el commit en main falla (aquí, un hook), main queda como estaba: sin nada preparado.
  writeFileSync(join(wt2.path, 'b.txt'), lines('b', ''))
  await commitAll(wt2.path, 'b')
  const hook = join(root, '.git', 'hooks', 'pre-commit')
  writeFileSync(hook, lines('#!/bin/sh', 'exit 1', ''))
  await assert.rejects(mergeSquash(root, wt2.branch, 'main', 'b'), /No se pudo hacer el commit/)
  assert.equal((await git(['status', '--porcelain'], root)).trim(), '', 'main queda limpio')
  assert.ok(!existsSync(join(root, '.git', 'SQUASH_MSG')), 'sin mensaje de squash a medias')
  rmSync(hook)

  await removeWorktree(root, wt)
  await removeWorktree(root, wt2)
  assert.ok(!existsSync(wt.path), 'la carpeta se borra')
  assert.deepEqual(await worktreeNames(root), [])
} finally {
  rmSync(root, { recursive: true, force: true })
}

assert.equal(
  stripCredits(
    lines(
      'Arregla',
      '',
      'Co-Authored-By: Claude Opus <noreply@anthropic.com>',
      'Co-Authored-By: Ana <ana@x.com>',
      '🤖 Generated with [Claude Code](https://claude.com)'
    )
  ),
  lines('Arregla', '', 'Co-Authored-By: Ana <ana@x.com>'),
  'quita a los agentes y conserva a las personas'
)
assert.equal(
  compareUrl('https://github.com/angeldqr/slate-terminal.git', 'main', 'slate/x'),
  'https://github.com/angeldqr/slate-terminal/compare/main...slate/x?expand=1'
)
assert.equal(
  compareUrl('git@github.com:angeldqr/slate-terminal.git', 'main', 'slate/x'),
  'https://github.com/angeldqr/slate-terminal/compare/main...slate/x?expand=1'
)
assert.equal(compareUrl('https://gitlab.com/a/b.git', 'main', 'x'), null)

console.log('git: ok')
