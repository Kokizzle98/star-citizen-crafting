import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function files(dir) {
  const out = []
  for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const rel = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await files(rel)))
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}

test('UI never reads or shows the signed-in user email', async () => {
  const all = [...(await files('app')), ...(await files('components')), ...(await files('lib'))]
  for (const f of all) {
    const src = await readFile(new URL(f, root), 'utf8')
    assert.doesNotMatch(src, /\buser\??\.email\b/, `${f} reads user.email`)
    assert.doesNotMatch(src, /user_metadata/, `${f} reads user_metadata`)
  }
})

test('account name falls back to a neutral label, not an address', async () => {
  const bar = await readFile(new URL('components/layout/VectorTopbar.tsx', root), 'utf8')
  assert.match(bar, /profile\?\.nickname\s*\?\?\s*'VECTOR Account'/)
  const menu = await readFile(new URL('components/layout/HeaderAccountMenu.tsx', root), 'utf8')
  assert.match(menu, /profile\?\.nickname \?\? 'Account'/)
})
