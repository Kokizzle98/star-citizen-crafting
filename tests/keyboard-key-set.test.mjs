import assert from 'node:assert/strict'
import test from 'node:test'
import { loadLibModule, readText } from './fabricator-fixture.mjs'

// UX-5 (INVENTORY_UX_V1_1 sections 13, 13.1, 18): the global key set. The rules
// are pure functions; the wiring is checked on the source files.

const keys = await loadLibModule('lib/keyboard/key-set')
const { NAVIGATION } = await loadLibModule('components/layout/navigation')

const none = { inlineEditorActive: false, accountDrawerOpen: false, target: null }
const press = (key, extra = {}) => ({ key, ...extra })

test('letters map to the actions of section 13.1', () => {
  const expected = {
    w: 'select-prev', s: 'select-next', d: 'open', f: 'open', a: 'back',
    q: 'view-prev', e: 'view-next', t: 'focus-search', r: 'reset-filters',
  }
  for (const [key, type] of Object.entries(expected)) {
    assert.equal(keys.resolveKey(press(key), none)?.type, type, key)
    assert.equal(keys.resolveKey(press(key.toUpperCase()), none)?.type, type, `${key} with caps lock`)
  }
  assert.equal(keys.resolveKey(press('x'), none), null)
  assert.equal(keys.resolveKey(press('Enter'), none), null)
  assert.equal(keys.resolveKey(press(' '), none), null)
})

test('letter and number keys are inactive in text, number, search and select fields and textarea', () => {
  const targets = [
    { tagName: 'INPUT', type: 'text' },
    { tagName: 'INPUT', type: 'search' },
    { tagName: 'INPUT', type: 'number' },
    { tagName: 'INPUT' },
    { tagName: 'SELECT' },
    { tagName: 'TEXTAREA' },
    { tagName: 'DIV', isContentEditable: true },
  ]
  for (const target of targets) {
    for (const key of ['w', 's', 'd', 'f', 'a', 'q', 'e', 't', 'r', '1', '4']) {
      assert.equal(keys.resolveKey(press(key), { ...none, target }), null, `${target.tagName}/${target.type} ${key}`)
    }
  }
  // Buttons, links, checkboxes and the page itself do not take typed text.
  for (const target of [{ tagName: 'BUTTON' }, { tagName: 'A' }, { tagName: 'INPUT', type: 'checkbox' }, { tagName: 'BODY' }, null]) {
    assert.equal(keys.resolveKey(press('s'), { ...none, target })?.type, 'select-next')
  }
})

test('letter and number keys are inactive while an inline editor is active or the account drawer is open', () => {
  for (const key of ['w', 's', 'd', 'a', 'r', '1', '2']) {
    assert.equal(keys.resolveKey(press(key), { ...none, inlineEditorActive: true }), null, `editor ${key}`)
    assert.equal(keys.resolveKey(press(key), { ...none, accountDrawerOpen: true }), null, `drawer ${key}`)
  }
})

test('letter and number keys are inactive with Strg, Alt or Meta (browser shortcuts stay untouched)', () => {
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    for (const key of ['r', 't', 'w', 'a', '1']) {
      assert.equal(keys.resolveKey(press(key, { [modifier]: true }), none), null, `${modifier} ${key}`)
    }
  }
  assert.equal(keys.resolveKey(press('r', { isComposing: true }), none), null)
})

test('1 to 4 map to the routes of NAVIGATION; 5 and 6 (BALD) and other digits do nothing', () => {
  assert.equal(keys.routeForDigit(1, NAVIGATION), '/vector')
  assert.equal(keys.routeForDigit(2, NAVIGATION), '/vector/inventory')
  assert.equal(keys.routeForDigit(3, NAVIGATION), '/vector/blueprints')
  assert.equal(keys.routeForDigit(4, NAVIGATION), '/vector/fabricator')
  assert.equal(keys.routeForDigit(5, NAVIGATION), null)
  assert.equal(keys.routeForDigit(6, NAVIGATION), null)
  assert.equal(keys.routeForDigit(7, NAVIGATION), null)
  assert.equal(keys.routeForDigit(0, NAVIGATION), null)
  assert.equal(NAVIGATION[4].soon, true)
  assert.equal(NAVIGATION[5].soon, true)
  for (const digit of ['1', '2', '3', '4', '5', '6']) assert.deepEqual(keys.resolveKey(press(digit), none), { type: 'goto', digit: Number(digit) })
  for (const digit of ['0', '7', '8', '9']) assert.equal(keys.resolveKey(press(digit), none), null)
})

test('the number mapping follows the navigation order, not a second list', () => {
  const reordered = [NAVIGATION[1], NAVIGATION[0]]
  assert.equal(keys.routeForDigit(1, reordered), '/vector/inventory')
  assert.equal(keys.routeForDigit(2, reordered), '/vector')
})

test('Esc order: edit first, then transient element, only then "back"', () => {
  const escape = state => keys.escapeAction({ inlineEditActive: false, transientActive: false, typing: false, ...state })
  assert.equal(escape({ inlineEditActive: true, transientActive: true }), 'cancel-edit')
  assert.equal(escape({ inlineEditActive: true }), 'cancel-edit')
  assert.equal(escape({ transientActive: true }), 'close-transient')
  assert.equal(escape({}), 'back')
  assert.equal(escape({ typing: true }), 'none')
  assert.equal(escape({ typing: true, inlineEditActive: true }), 'cancel-edit')
})

test('W / S move one entry, without wrap-around', () => {
  const list = ['a', 'b', 'c']
  assert.equal(keys.moveSelection(list, 'a', 'next'), 'b')
  assert.equal(keys.moveSelection(list, 'b', 'prev'), 'a')
  assert.equal(keys.moveSelection(list, 'c', 'next'), 'c')
  assert.equal(keys.moveSelection(list, 'a', 'prev'), 'a')
  assert.equal(keys.moveSelection(list, null, 'next'), 'a')
  assert.equal(keys.moveSelection(list, null, 'prev'), 'c')
  assert.equal(keys.moveSelection(list, 'gone', 'next'), 'a')
  assert.equal(keys.moveSelection([], 'a', 'next'), null)
})

test('A and Esc go back exactly one level; D / F go down exactly one', () => {
  let path = []
  path = keys.enterLevel(path, 'material')
  path = keys.enterLevel(path, 'location')
  assert.deepEqual(path, ['material', 'location'])
  path = keys.leaveLevel(path)
  assert.deepEqual(path, ['material'])
  path = keys.leaveLevel(path)
  assert.deepEqual(path, [])
  assert.deepEqual(keys.leaveLevel(path), [])
})

test('an entered path is cut back to what still exists and is open', () => {
  const open = new Set(['m'])
  const valid = (prefix, key) => open.has(key)
  assert.deepEqual(keys.trimPath(['m', 'l'], valid), ['m'])
  assert.deepEqual(keys.trimPath(['m'], valid), ['m'])
  assert.deepEqual(keys.trimPath(['x', 'm'], valid), [])
  assert.deepEqual(keys.trimPath([], valid), [])
})

// ---- wiring (source checks) ----

test('the hook attaches one keydown listener and removes it on unmount', async () => {
  const source = await readText('components/layout/useKeySet.ts')
  assert.equal([...source.matchAll(/addEventListener\('keydown'/g)].length, 1)
  assert.match(source, /removeEventListener\('keydown'/)
  assert.match(source, /accountDrawerOpen/)
  assert.match(source, /event\.key === 'Escape'/)
})

test('the shell maps number keys through NAVIGATION and routeForDigit only', async () => {
  const shell = await readText('components/layout/VectorShell.tsx')
  assert.match(shell, /routeForDigit\(event\.action\.digit, NAVIGATION\)/)
  assert.match(shell, /useKeySet\(/)
  assert.doesNotMatch(shell, /['"]\/vector\/(inventory|blueprints|fabricator)['"]/)
})

test('Q / E switch Mein / Crew Inventory and nothing else', async () => {
  const source = await readText('components/inventory/InventorySwitch.tsx')
  assert.match(source, /view-prev/)
  assert.match(source, /view-next/)
  assert.match(source, /'\/vector\/inventory'/)
  assert.match(source, /'\/vector\/inventory\/crew'/)
  assert.doesNotMatch(source, /GLOBAL|LOCATION/)
})

test('the inline editor is marked so keys can detect it; its own Esc stays first', async () => {
  const form = await readText('components/inventory/EditInventoryLotForm.tsx')
  assert.match(form, /data-inline-editor="active"/)
  assert.match(form, /event\.key === 'Escape' && !pending\) \{ event\.stopPropagation\(\); onCancel\(\)/)
})

test('inventory keys never write: no server action, no edit start, no delete confirm', async () => {
  const hook = await readText('components/inventory/useInventoryKeys.ts')
  assert.doesNotMatch(hook, /actions['"]|submitInventory|startDelete|confirmDelete|editing\.start|setEditingLotId/)
  assert.match(hook, /escapeAction\(/)
})

test('Crew Inventory stays read-only: no edit state, no write keys', async () => {
  const crew = await readText('app/vector/inventory/crew/page.tsx')
  assert.match(crew, /currentUserId=\{null\}/)
  assert.match(crew, /locations=\{null\}/)
  const view = await readText('components/inventory/InventoryView.tsx')
  // Without a current user and locations no lot can enter edit mode (canEdit / canDelete).
  assert.match(view, /const canEdit = editing\.currentUserId !== null && row\.owner_user_id === editing\.currentUserId/)
  assert.match(view, /const canDelete = editing\.currentUserId !== null && row\.owner_user_id === editing\.currentUserId/)
  // The lot keys only select; D / F on a lot has no level below it.
  assert.match(view, /useInventoryKeys\(/)
})

test('the key set adds no positive tabindex and Esc/Enter never move focus to the header', async () => {
  for (const file of [
    'components/layout/useKeySet.ts', 'components/layout/VectorShell.tsx', 'components/inventory/useInventoryKeys.ts',
    'components/inventory/InventorySwitch.tsx', 'components/inventory/InventoryView.tsx', 'lib/keyboard/key-set.ts',
  ]) {
    const source = await readText(file)
    assert.doesNotMatch(source, /tabIndex=\{?["']?[1-9]/, `${file}: positive tabindex`)
    assert.doesNotMatch(source, /querySelector\([^)]*(header|topbar)/i, `${file}: jumps to the header`)
  }
})

test('every key function keeps its Tab/Enter/Space path (buttons and summaries stay)', async () => {
  const view = await readText('components/inventory/InventoryView.tsx')
  assert.match(view, /<summary data-key-selected/)
  assert.match(view, /onClick=\{resetFilters\}/)
  assert.match(view, />GLOBAL<\/button>/)
  assert.match(view, />LOCATION<\/button>/)
  assert.match(view, /id="inventory-search"/)
})
