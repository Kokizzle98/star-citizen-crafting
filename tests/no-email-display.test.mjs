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

// Ways to read the signed-in user's email. A plain form field named "email"
// (login / registration input) is intentionally NOT matched.
const USER = String.raw`(?:\b\w*[Uu]ser|\bsession\??\.user)`
const FORBIDDEN = [
  // user.email, user?.email, session.user.email, session?.user?.email
  new RegExp(String.raw`${USER}\??\.email\b`),
  // user['email'], user?.['email'], session.user["email"]
  new RegExp(String.raw`${USER}\??\.?\[\s*['"\x60]email['"\x60]\s*\]`),
  // const { email } = user / session.user
  new RegExp(String.raw`\{[^{}]*\bemail\b[^{}]*\}\s*=\s*${USER}\b`),
  // const { user: { email } } = session
  /\buser\s*:\s*\{[^{}]*\bemail\b/,
  // user_metadata may carry the email as well
  /user_metadata/,
]
const isForbidden = src => FORBIDDEN.some(re => re.test(src))

test('detector flags every way to read the user email', () => {
  for (const bad of [
    'user.email',
    'user?.email',
    'session.user.email',
    'session?.user?.email',
    "user['email']",
    'user["email"]',
    "session.user?.['email']",
    'const { email } = user',
    'const { id, email } = session.user',
    'const { user: { email } } = session',
    'user.user_metadata.email',
    'authUser.email ?? x',
  ]) {
    assert.ok(isForbidden(bad), `should be forbidden: ${bad}`)
  }
})

test('detector allows login-form email fields', () => {
  for (const ok of [
    "const [email, setEmail] = useState('')",
    'email: email.trim(),',
    '<input type="email" name="email" autoComplete="email" />',
    "normalized.includes('email not confirmed')",
    'const { data: { user } } = await supabase.auth.getUser()',
    'if (!user) redirect("/login")',
    'const { email } = formData',
  ]) {
    assert.ok(!isForbidden(ok), `should be allowed: ${ok}`)
  }
})

test('UI never reads or shows the signed-in user email', async () => {
  const all = [...(await files('app')), ...(await files('components')), ...(await files('lib'))]
  for (const f of all) {
    const src = await readFile(new URL(f, root), 'utf8')
    for (const re of FORBIDDEN) {
      assert.doesNotMatch(src, re, `${f} matches ${re}`)
    }
  }
})

test('account name falls back to a neutral label, not an address', async () => {
  const bar = await readFile(new URL('components/layout/VectorTopbar.tsx', root), 'utf8')
  assert.match(bar, /profile\?\.nickname\s*\?\?\s*'VECTOR Account'/)
  const menu = await readFile(new URL('components/layout/HeaderAccountMenu.tsx', root), 'utf8')
  assert.match(menu, /profile\?\.nickname \?\? 'Account'/)
})
