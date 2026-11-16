import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const page = await read('app/page.tsx')
const nav = await read('components/layout/navigation.ts')
const layout = await read('app/layout.tsx')

test('landing page shows the fan notice from navigation.ts and the official site link', () => {
  assert.match(page, /FAN_PROJECT_NOTICE/)
  assert.doesNotMatch(page, /Inoffizielles Fan-Projekt/, 'notice text is maintained only in navigation.ts')
  assert.match(nav, /Inoffizielles Fan-Projekt, nicht mit Cloud Imperium Games verbunden\./)
  assert.match(nav, /url: 'https:\/\/robertsspaceindustries\.com'/)
  assert.match(page, /OFFICIAL_SITE\.url/)
  assert.match(page, /target="_blank"/)
  assert.match(page, /rel="noopener noreferrer"/)
})

test('landing page links to the existing login route and has no stale texts', () => {
  assert.match(page, /href="\/login"/)
  assert.match(page, />\s*Anmelden\s*</)
  for (const stale of ['Wird integriert', 'PREFLIGHT', 'DEVELOP', 'Legacy', 'BALD']) {
    assert.ok(!page.includes(stale), `landing page must not contain "${stale}"`)
  }
  assert.doesNotMatch(page, /<button/)
})

test('landing page has at most three highlights', () => {
  const block = page.match(/const highlights = \[([\s\S]*?)\] as const/)[1]
  assert.ok([...block.matchAll(/^\s*\['/gm)].length <= 3)
})

test('app footer links to the official site in a new tab', () => {
  assert.match(layout, /OFFICIAL_SITE\.url/)
  assert.match(layout, /target="_blank"\s+rel="noopener noreferrer"/)
  assert.match(layout, /className="vector-footer"/)
})
