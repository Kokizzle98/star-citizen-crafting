import assert from 'node:assert/strict'
import test from 'node:test'
import { loadLibModule, readText } from './fabricator-fixture.mjs'

// UX-5b: key help (display only). The table is compared with the real key logic
// so help and logic cannot drift apart.

const help = await loadLibModule('lib/keyboard/key-help')
const keys = await loadLibModule('lib/keyboard/key-set')
const { NAVIGATION } = await loadLibModule('components/layout/navigation')

const ids = (state) => help.hintEntries(state).map((entry) => entry.id)
const base = { page: 'own', inlineEditorActive: false, deleteConfirmOpen: false }

test('hint bar, normal state: all list keys, no number keys', () => {
  assert.deepEqual(ids(base), ['select', 'open', 'back', 'view', 'search', 'reset'])
})

test('hint bar, Crew page: same keys as normal, never editor or delete hints', () => {
  assert.deepEqual(ids({ ...base, page: 'crew' }), ids(base))
  assert.deepEqual(ids({ page: 'crew', inlineEditorActive: true, deleteConfirmOpen: true }), ids(base))
})

test('hint bar, inline editor open: only "Esc abbrechen"', () => {
  const entries = help.hintEntries({ ...base, inlineEditorActive: true })
  assert.deepEqual(entries.map((e) => [e.label, e.short]), [['Esc', 'abbrechen']])
})

test('hint bar, delete question open: only "Esc schließen"', () => {
  const entries = help.hintEntries({ ...base, deleteConfirmOpen: true })
  assert.deepEqual(entries.map((e) => [e.label, e.short]), [['Esc', 'schließen']])
})

test('every real key of the help table exists in keyAction / escapeAction', () => {
  for (const entry of help.KEY_HELP) {
    if (entry.action === 'escape') {
      assert.deepEqual(entry.keys, ['Escape'], entry.id)
      continue
    }
    for (const key of entry.keys) {
      const action = keys.keyAction(key)
      assert.ok(action, `${entry.id}: key ${key} has no action`)
      if (entry.id === 'select') assert.equal(action.type, key === 'w' ? 'select-prev' : 'select-next')
      else if (entry.id === 'view') assert.equal(action.type, key === 'q' ? 'view-prev' : 'view-next')
      else assert.equal(action.type, entry.action, `${entry.id}: key ${key}`)
    }
  }
})

test('every key that keyAction knows is explained in the help table (no hidden keys)', () => {
  const helped = new Set(help.KEY_HELP.flatMap((entry) => entry.keys))
  for (const key of 'abcdefghijklmnopqrstuvwxyz0123456789') {
    if (keys.keyAction(key)) assert.ok(helped.has(key), `key ${key} is not in the help`)
  }
})

test('Esc texts match escapeAction order', () => {
  assert.equal(keys.escapeAction({ inlineEditActive: true, transientActive: false, typing: false }), 'cancel-edit')
  assert.equal(keys.escapeAction({ inlineEditActive: false, transientActive: true, typing: false }), 'close-transient')
  assert.equal(keys.escapeAction({ inlineEditActive: false, transientActive: false, typing: false }), 'back')
  const byContext = Object.fromEntries(help.KEY_HELP.filter((e) => e.action === 'escape').map((e) => [e.context, e]))
  assert.match(byContext['inline-editor'].text, /abbrechen/)
  assert.match(byContext['delete-confirm'].text, /schließen/)
  assert.match(byContext.inventory.text, /zurück/)
})

test('number keys in the help agree with the navigation (1-4 built, 5-6 BALD)', () => {
  for (const entry of help.KEY_HELP.filter((e) => e.action === 'goto')) {
    for (const key of entry.keys) {
      const route = keys.routeForDigit(Number(key), NAVIGATION)
      assert.equal(route === null, entry.soon === true, `${key}`)
    }
  }
})

test('overview contains ALL keys, grouped by known contexts, with both footnotes', () => {
  const shown = help.KEY_HELP_CONTEXT_ORDER.flatMap((context) => help.entriesForContext(context))
  assert.equal(shown.length, help.KEY_HELP.length)
  for (const context of help.KEY_HELP_CONTEXT_ORDER) assert.ok(help.KEY_HELP_CONTEXT_TITLES[context])
  assert.ok(help.KEY_HELP_FOOTNOTES.includes('Alles geht auch mit Tab, Enter und Leertaste.'))
})

test('wiring: bar has aria-label, button has visible text and no key, dialog handles focus and Esc', async () => {
  const bar = await readText('components/inventory/KeyHintBar.tsx')
  assert.match(bar, /aria-label="Tastenhilfe"/)
  const dialog = await readText('components/inventory/KeyHelpDialog.tsx')
  assert.match(dialog, />Tastenhilfe<\/button>/)
  assert.match(dialog, /showModal\(\)/)
  assert.match(dialog, /buttonRef\.current\?\.focus\(\)/)
  assert.match(dialog, />Schließen<\/button>/)
  assert.doesNotMatch(dialog, /accessKey|addEventListener/)
  const view = await readText('components/inventory/InventoryView.tsx')
  assert.match(view, /<KeyHelpDialog \/>/)
  assert.match(view, /<KeyHintBar /)
  // No new key: the key logic files are untouched by this package.
  const keySet = await readText('lib/keyboard/key-set.ts')
  assert.doesNotMatch(keySet, /key-help/)
})
