import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const load = async path => {
  const src = await readFile(new URL(path, root), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}
const { safeRelativePath } = await load('lib/auth/redirect.ts')

const FALLBACK = '/vector'

test('dot segments that resolve to a protocol-relative URL fall back', () => {
  assert.equal(safeRelativePath('/x/..//example.org', FALLBACK), FALLBACK)
  assert.equal(safeRelativePath('/.//example.org', FALLBACK), FALLBACK)
  assert.equal(safeRelativePath('/a/b/../..//example.org/path?x=1', FALLBACK), FALLBACK)
})

test('protocol-relative, backslash and absolute inputs fall back', () => {
  for (const raw of ['//example.org', '/\\example.org', '\\\\example.org', 'https://example.org', 'javascript:alert(1)', 'example.org', '/\\/example.org']) {
    assert.equal(safeRelativePath(raw, FALLBACK), FALLBACK, raw)
  }
})

test('control characters fall back', () => {
  for (const raw of ['/\t/example.org', '/\n/example.org', '/a\u0000b', '/a\u007fb']) {
    assert.equal(safeRelativePath(raw, FALLBACK), FALLBACK, JSON.stringify(raw))
  }
})

test('an encoded double slash stays a harmless same-origin path', () => {
  const result = safeRelativePath('/%2F%2Fexample.org', FALLBACK)
  assert.equal(result, '/%2F%2Fexample.org')
  assert.ok(!result.startsWith('//'))
})

test('non-string and empty input falls back instead of throwing', () => {
  for (const raw of [['/vector', '/vector/inventory'], ['a', 'b'], [], undefined, null, 42, {}, '']) {
    assert.equal(safeRelativePath(raw, FALLBACK), FALLBACK, JSON.stringify(raw))
  }
})

test('the default fallback is the site root', () => {
  assert.equal(safeRelativePath(undefined), '/')
  assert.equal(safeRelativePath('//example.org'), '/')
})

test('valid relative paths keep path, query and hash', () => {
  assert.equal(safeRelativePath('/vector', FALLBACK), '/vector')
  assert.equal(safeRelativePath('/vector/fabricator?item=x', FALLBACK), '/vector/fabricator?item=x')
  assert.equal(safeRelativePath('/vector/inventory?a=1&b=2#lot-5', FALLBACK), '/vector/inventory?a=1&b=2#lot-5')
  assert.equal(safeRelativePath('/vector/../vector/blueprints', FALLBACK), '/vector/blueprints')
  assert.equal(safeRelativePath('/', FALLBACK), '/')
})

test('the login page hands the raw query value to the guard', async () => {
  const page = await readFile(new URL('app/login/page.tsx', root), 'utf8')
  assert.match(page, /safeRelativePath\(searchParams\?\.next, '\/vector'\)/)
  assert.match(page, /next\?: string \| string\[\]/)
})
