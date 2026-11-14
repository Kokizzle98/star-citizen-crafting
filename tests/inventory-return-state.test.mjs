import assert from 'node:assert/strict'
import test from 'node:test'
import { loadLibModule, readText } from './fabricator-fixture.mjs'

// UX-5d (INVENTORY_UX_V1_2 sections 3.1, 13.2, 18 no. 14, 22, 23, 24): Crew edit symbol, jump and return.

const ret = await loadLibModule('lib/inventory/inventory-return-state')
const help = await loadLibModule('lib/keyboard/key-help')

const NOW = 1_700_000_000_000
const state = (extra = {}) => ret.buildReturnState({
  view: 'LOCATION', open: ['L:m:Iron', 'L:l:Iron|7'], path: ['L:m:Iron'], selected: 'lot:12', scrollY: 640, ...extra,
}, NOW)
function memoryStorage() {
  const map = new Map()
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v) }, removeItem: (k) => { map.delete(k) } }
}
const throwing = () => ({ getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') }, removeItem() { throw new Error('blocked') } })

test('markers: the jump marker counts only with from=crew AND a lot anchor; the URL carries no personal data', () => {
  assert.equal(ret.editLinkHref('12'), '/vector/inventory?from=crew#lot-12')
  assert.equal(ret.parseEditMarker('?from=crew', '#lot-12'), '12')
  assert.equal(ret.parseEditMarker('', '#lot-12'), null, 'manual navigation: no marker')
  assert.equal(ret.parseEditMarker('?from=other', '#lot-12'), null)
  assert.equal(ret.parseEditMarker('?from=crew', ''), null)
  assert.equal(ret.parseEditMarker('?from=crew', '#lot-0'), null)
  assert.equal(ret.parseEditMarker('?from=crew', '#lot-1x'), null)
  assert.equal(ret.returnHref('12'), '/vector/inventory/crew?return=12')
  assert.equal(ret.parseReturnMarker('?return=12'), '12')
  assert.equal(ret.parseReturnMarker(''), null)
  assert.equal(ret.parseReturnMarker('?return=abc'), null)
  assert.equal(ret.parseReturnMarker('?return=0'), null)
})

test('return state: serialize and parse round trip', () => {
  const saved = state()
  assert.deepEqual(ret.parseReturnState(ret.serializeReturnState(saved), NOW + 1000), saved)
})

test('return state: broken, wrong, old or future data gives null', () => {
  const ok = JSON.parse(ret.serializeReturnState(state()))
  const text = (patch) => JSON.stringify({ ...ok, ...patch })
  assert.equal(ret.parseReturnState(null, NOW), null)
  assert.equal(ret.parseReturnState('', NOW), null)
  assert.equal(ret.parseReturnState('{not json', NOW), null)
  assert.equal(ret.parseReturnState('[]', NOW), null)
  assert.equal(ret.parseReturnState('null', NOW), null)
  assert.equal(ret.parseReturnState(text({ v: 2 }), NOW), null)
  assert.equal(ret.parseReturnState(text({ view: 'ELSE' }), NOW), null)
  assert.equal(ret.parseReturnState(text({ open: 'x' }), NOW), null)
  assert.equal(ret.parseReturnState(text({ open: [1] }), NOW), null)
  assert.equal(ret.parseReturnState(text({ path: [null] }), NOW), null)
  assert.equal(ret.parseReturnState(text({ selected: 5 }), NOW), null)
  assert.equal(ret.parseReturnState(text({ scrollY: -1 }), NOW), null)
  assert.equal(ret.parseReturnState(text({ scrollY: 'x' }), NOW), null)
  assert.equal(ret.parseReturnState(text({ savedAt: 'x' }), NOW), null)
  assert.equal(ret.parseReturnState(ret.serializeReturnState(state()), NOW + ret.RETURN_STATE_TTL_MS + 1), null, 'expired')
  assert.equal(ret.parseReturnState(ret.serializeReturnState(state()), NOW - 10 * 60_000), null, 'from the future')
  assert.ok(ret.parseReturnState(text({ selected: null }), NOW))
})

test('storage: one key per lot, read once, then forgotten', () => {
  const storage = memoryStorage()
  assert.equal(ret.saveReturnState(storage, '12', state()), true)
  assert.equal(ret.saveReturnState(storage, '13', state({ scrollY: 5 })), true)
  assert.notEqual(ret.returnStorageKey('12'), ret.returnStorageKey('13'))
  assert.deepEqual(ret.takeReturnState(storage, '12', NOW), state())
  assert.equal(ret.takeReturnState(storage, '12', NOW), null, 'valid for one round trip only')
  assert.equal(ret.takeReturnState(storage, '13', NOW)?.scrollY, 5, 'other lot untouched until used')
  ret.saveReturnState(storage, '14', state())
  ret.discardReturnState(storage, '14')
  assert.equal(ret.takeReturnState(storage, '14', NOW), null)
})

test('storage: expired state is dropped and deleted', () => {
  const storage = memoryStorage()
  ret.saveReturnState(storage, '12', state())
  assert.equal(ret.takeReturnState(storage, '12', NOW + ret.RETURN_STATE_TTL_MS + 1), null)
  assert.equal(storage.map.size, 0)
})

test('storage: missing, empty or throwing storage never throws and means "top of Crew Inventory"', () => {
  assert.equal(ret.saveReturnState(null, '12', state()), false)
  assert.equal(ret.takeReturnState(null, '12', NOW), null)
  assert.equal(ret.takeReturnState(memoryStorage(), '12', NOW), null, 'empty')
  const blocked = throwing()
  assert.equal(ret.saveReturnState(blocked, '12', state()), false)
  assert.equal(ret.takeReturnState(blocked, '12', NOW), null)
  assert.doesNotThrow(() => ret.discardReturnState(blocked, '12'))
  assert.equal(ret.saveReturnState(memoryStorage(), '../x', state()), false, 'no odd lot ids')
  const corrupt = memoryStorage()
  corrupt.setItem(ret.returnStorageKey('12'), '{broken')
  assert.equal(ret.takeReturnState(corrupt, '12', NOW), null)
})

test('hint bar: "öffnen, dann B bearbeiten" for a material or location row on Mein Inventory only', () => {
  const own = { page: 'own', inlineEditorActive: false, deleteConfirmOpen: false }
  const open = (extra) => help.hintEntries({ ...own, ...extra }).find((e) => e.id === 'open')?.short
  assert.equal(open({}), 'öffnen')
  assert.equal(open({ groupSelected: true }), 'öffnen, dann B bearbeiten')
  assert.equal(help.OPEN_THEN_EDIT_HINT, 'öffnen, dann B bearbeiten')
  // an own lot is selected: "B bearbeiten" as before, D / F plain
  const lot = help.hintEntries({ ...own, groupSelected: true, ownLotSelected: true })
  assert.equal(lot.find((e) => e.id === 'open').short, 'öffnen')
  assert.ok(lot.some((e) => e.id === 'edit'))
  // never on Crew, never in editor or delete state
  assert.equal(open({ page: 'crew', groupSelected: true }), 'öffnen')
  assert.ok(!help.hintEntries({ ...own, page: 'crew', groupSelected: true, ownLotSelected: true }).some((e) => e.id === 'edit'))
  assert.deepEqual(help.hintEntries({ ...own, inlineEditorActive: true, groupSelected: true }).map((e) => e.id), ['esc-edit'])
  assert.deepEqual(help.hintEntries({ ...own, deleteConfirmOpen: true, groupSelected: true }).map((e) => e.id), ['esc-delete'])
  // the table itself is not changed by the hint
  assert.equal(help.KEY_HELP.find((e) => e.id === 'open').short, 'öffnen')
})

test('wiring: symbol only for own lots on Crew, navigation only; Crew gets no editor or write control', async () => {
  const view = await readText('components/inventory/InventoryView.tsx')
  assert.match(view, /row\.owner_user_id === editing\.crewViewerUserId\s*\n?\s*\? <Link className="inventory-edit-link" href=\{editLinkHref\(row\.inventory_id\)\} aria-label="In Mein Inventory bearbeiten"/)
  assert.match(view, /: <span>Nur ansehen<\/span>/)
  assert.match(view, /onClick=\{\(\) => editing\.rememberPosition\(row\.inventory_id\)\}/)
  // Crew page is unchanged: no user, no locations, so no editor and no write control can render.
  const crew = await readText('app/vector/inventory/crew/page.tsx')
  assert.match(crew, /currentUserId=\{null\}/)
  assert.match(crew, /locations=\{null\}/)
  assert.match(view, /const canEdit = editing\.currentUserId !== null && row\.owner_user_id === editing\.currentUserId/)
})

test('wiring: jump and return rules', async () => {
  const view = await readText('components/inventory/InventoryView.tsx')
  // the button and the B key start without the return flag, so they have no way back
  assert.match(view, /onClick=\{\(\) => editing\.start\(row\.inventory_id\)\}/)
  assert.match(view, /start: \(id\) => \{[^}]*setReturnLotId\(null\)/)
  assert.match(view, /startFromCrew: \(id\) => \{ editing\.start\(id\); setReturnLotId\(id\) \}/)
  assert.match(view, /startDelete: \(id\) => \{[^}]*setReturnLotId\(null\)/)
  // the marker is evaluated only once, only for Mein Inventory, and only an own editable lot opens
  assert.equal([...view.matchAll(/parseEditMarker\(/g)].length, 1)
  assert.match(view, /if \(currentUserId !== null\) \{[\s\S]*parseEditMarker\([\s\S]*editableLotId\(lotKey\(row\)\) !== null[\s\S]*editing\.startFromCrew\(lotId\)/)
  assert.match(view, /if \(mounted\.current\) return/)
  // way back: only when the edit of that very lot ends (cancel or success), then forgotten
  assert.match(view, /previous !== null && editingLotId === null && returnLotId === previous\) \{\s*setReturnLotId\(null\)\s*router\.replace\(returnHref\(previous\)\)/)
  assert.equal([...view.matchAll(/router\.replace\(returnHref/g)].length, 1)
  // the saved position is read once and removed
  assert.match(view, /takeReturnState\(sessionStore\(\)/)
  assert.match(view, /try \{ return window\.sessionStorage \} catch \{ return null \}/)
  // the hook only gained a setter for the selection; it still writes nothing
  const hook = await readText('components/inventory/useInventoryKeys.ts')
  assert.match(hook, /reveal: \(path: string\[\], selected: string \| null\) => void/)
  assert.doesNotMatch(hook, /startDelete|confirmDelete|setEditingLotId|submitInventory|editing\.start/)
})
