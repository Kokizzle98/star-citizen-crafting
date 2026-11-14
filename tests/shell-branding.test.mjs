import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const nav = await read('components/layout/navigation.ts')
const sidebar = await read('components/layout/VectorSidebar.tsx')
const layout = await read('app/layout.tsx')

const entries = [...nav.matchAll(/\{ number: '(\d\d)', label: '([^']+)', icon: '[^']+', href: ([^,]+), soon: (true|false) \}/g)]
  .map(([, number, label, href, soon]) => ({ number, label, href, soon: soon === 'true' }))

test('navigation order is configured in one file (INVENTORY_UX_V1_1 13.1)', () => {
  assert.deepEqual(entries.map(e => `${e.number} ${e.label}`), [
    '01 Dashboard', '02 Inventory', '03 Blueprints', '04 Fabricator', '05 Fleet', '06 Trading',
  ])
})

test('Fleet and Trading are BALD entries without a route; others have a route', () => {
  for (const e of entries) {
    if (e.label === 'Fleet' || e.label === 'Trading') {
      assert.equal(e.soon, true)
      assert.equal(e.href, 'null')
    } else {
      assert.equal(e.soon, false)
      assert.match(e.href, /^'\/vector/)
    }
  }
})

test('sidebar renders from the configuration; BALD entries are not links and not focusable', () => {
  assert.match(sidebar, /NAVIGATION\.map/)
  assert.doesNotMatch(sidebar, /href="\/vector\//, 'no hard-coded routes in the sidebar')
  assert.match(sidebar, /aria-disabled="true"/)
  assert.match(sidebar, />BALD</)
  assert.doesNotMatch(sidebar, /tabIndex/)
  assert.doesNotMatch(sidebar, /onKeyDown|onKeyUp|keydown/, 'no key handlers before UX-5')
})

test('no positive tabindex anywhere in the shell', async () => {
  for (const f of ['app/layout.tsx', 'components/layout/VectorShell.tsx', 'components/layout/VectorSidebar.tsx', 'components/layout/VectorTopbar.tsx']) {
    assert.doesNotMatch(await read(f), /tabIndex=\{?["']?[1-9]/, f)
  }
})

test('layout keeps the skip link and shows the fan-project notice', async () => {
  assert.match(layout, /className="skip-link"/)
  assert.match(layout, /FAN_PROJECT_NOTICE/)
  assert.match(layout, /className="vector-footer"/)
  assert.match(nav, /Inoffizielles Fan-Projekt, nicht mit Cloud Imperium Games verbunden\./)
})

test('brand text and self-hosted fonts', () => {
  assert.match(nav, /name: 'VECTOR'/)
  assert.match(nav, /tagline: 'Group Terminal by Kokizzle98'/)
  assert.match(layout, /from 'next\/font\/google'/)
  assert.match(layout, /Chakra_Petch/)
  assert.match(layout, /IBM_Plex_Mono/)
  assert.doesNotMatch(layout, /fonts\.googleapis\.com/)
})

test('navigation entries are at least 44px high and focus ring is cyan', async () => {
  const css = await read('app/globals.css')
  assert.match(css, /\.vector-sidebar__future\s*\{[^}]*min-height:\s*44px/)
  assert.match(css, /\.vector-shell a:focus-visible[\s\S]*?outline:\s*2px solid var\(--focus\)/)
})
