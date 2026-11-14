import assert from 'node:assert/strict'
import test from 'node:test'
import { readText } from './fabricator-fixture.mjs'

// UX-6b: dashboard polish. Display only: the page has no data query and no number.

const [page, css] = await Promise.all([readText('app/vector/page.tsx'), readText('app/globals.css')])

test('all three module cards are links with one footer pattern; no internal package label', () => {
  for (const href of ['/vector/inventory', '/vector/fabricator', '/vector/blueprints']) {
    assert.match(page, new RegExp(`<Link\\s+href="${href.replaceAll('/', '\\/')}"\\s+className="vector-module-card vector-module-card--link"`), href)
  }
  assert.doesNotMatch(page, /<article/)
  assert.doesNotMatch(page, /WP3/)
  assert.equal([...page.matchAll(/Öffnen <span aria-hidden="true">→<\/span>/g)].length, 3)
})

test('status of a module: glyph plus text (colour only supports it), same on every card', () => {
  assert.equal([...page.matchAll(/<span aria-hidden="true">✓<\/span> VERFÜGBAR/g)].length, 3)
  assert.match(css, /\.vector-module-card__status \{[^}]*color: var\(--success\);/)
})

test('card footer text and card focus: readable colour, border change on keyboard focus', () => {
  assert.doesNotMatch(css.match(/\.vector-module-card__footer \{[^}]*\}/)[0], /#55727d/)
  assert.match(css, /\.vector-module-card--link:hover,\s*\.vector-module-card--link:focus-visible \{\s*border-color: var\(--cyan\);/)
})

test('project status block is labelled and uses German labels', () => {
  assert.match(page, /<section className="vector-dashboard__status" aria-label="Projektstand">/)
  assert.match(page, /AKTUELLER STAND/)
  assert.match(page, /NÄCHSTER MEILENSTEIN/)
  assert.doesNotMatch(page, /CURRENT STATE|NEXT PRODUCT MILESTONE/)
  assert.match(css, /\.vector-dashboard__status strong \{[^}]*overflow-wrap: anywhere;/)
})

test('new user: one clear sentence with a next step as a link', () => {
  assert.match(page, /Neu hier\? Wähle oben deine Crew und lege in\{' '\}\s*<Link href="\/vector\/inventory">Mein Inventory<\/Link> dein erstes Lot an\./)
  assert.match(css, /\.vector-dashboard__hint a \{\s*color: var\(--cyan\);/)
})

test('the dashboard stays presentation only: no data access, no numbers', () => {
  assert.doesNotMatch(page, /supabase|fetch\(|@\/lib\/(?!auth\/authorization)|useState/i)
  assert.match(page, /await requireUser\(\)/)
})
