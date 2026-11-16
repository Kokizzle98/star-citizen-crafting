import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const nav = await read('components/layout/navigation.ts')
const sidebar = await read('components/layout/VectorSidebar.tsx')
const shellServer = await read('components/layout/VectorShell.tsx')
const shellClient = await read('components/layout/VectorShellClient.tsx')
const topbar = await read('components/layout/VectorTopbar.tsx')
const layout = await read('app/layout.tsx')
const layoutUser = await read('components/layout/layout-user.ts')

test('visitor navigation has exactly Start and Anmelden, no area and no BALD entry', () => {
  const block = nav.slice(nav.indexOf('export const VISITOR_NAVIGATION'), nav.indexOf('export const BRAND'))
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map(m => m[1])
  assert.deepEqual(labels, ['Start', 'Anmelden'])
  assert.match(block, /href: '\/'/)
  assert.match(block, /href: '\/login'/)
  assert.doesNotMatch(block, /\/vector|soon|BALD/)
})

test('signed-in navigation stays as it was (six entries, order, BALD for Fleet and Trading)', () => {
  const entries = [...nav.matchAll(/\{ number: '(\d\d)', label: '([^']+)', icon: '[^']+', href: ([^,]+), soon: (true|false) \}/g)]
  assert.deepEqual(entries.map(e => `${e[1]} ${e[2]}`), ['01 Dashboard', '02 Inventory', '03 Blueprints', '04 Fabricator', '05 Fleet', '06 Trading'])
  assert.match(sidebar, /\{!visitor && NAVIGATION\.map/)
  assert.match(sidebar, />BALD</)
})

test('the sidebar switches on the visitor flag only; the shell gets it from the server', () => {
  assert.match(sidebar, /\{visitor && VISITOR_NAVIGATION\.map/)
  assert.match(shellServer, /getLayoutUser\(\)/)
  assert.match(shellServer, /<VectorShellClient signedIn=\{user !== null\}>/)
  assert.match(shellClient, /visitor=\{!signedIn\}/)
  assert.match(shellClient, /!publicSurface && signedIn\)/, 'number keys 1 to 6 only act when signed in')
  assert.match(layout, /<VectorShell>/, 'layout unchanged: same shell entry point')
})

test('the layout user is read once per request and is display only', () => {
  assert.match(layoutUser, /cache\(async/)
  assert.match(topbar, /getLayoutUser\(\)/)
})

test('Inventory (Mein and Crew) sends visitors to the login instead of showing an error', async () => {
  for (const file of ['app/vector/inventory/page.tsx', 'app/vector/inventory/crew/page.tsx']) {
    const page = await read(file)
    assert.match(page, /import \{ requireUser \} from '@\/lib\/auth\/authorization'/, file)
    assert.match(page, /if \(result\.status !== 'success'\) await requireUser\(\)/, file)
    assert.ok(page.indexOf('requireUser()') < page.indexOf("result.status === 'read_error'"), `${file}: redirect comes before the error text`)
  }
})

test('auth logic is untouched: requireUser and safeRelativePath keep their shape', async () => {
  assert.match(await read('lib/auth/authorization.ts'), /if \(!user\) redirect\('\/login'\)/)
  assert.match(await read('lib/auth/redirect.ts'), /export function safeRelativePath/)
})
