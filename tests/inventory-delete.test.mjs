import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [update, write, boundary, action, view, messages] = await Promise.all([
  read('lib/inventory/inventory-update.ts'),
  read('lib/inventory/inventory-write.ts'),
  read('lib/inventory/inventory-delete-write.ts'),
  read('app/vector/inventory/actions.ts'),
  read('components/inventory/InventoryView.tsx'),
  read('lib/inventory/inventory-error-messages.ts'),
])
const transpile = source => ts.transpileModule(source.replace(/^import .*$/gm, ''), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const canonicalize = update.match(/const MAX_INVENTORY_ID[\s\S]*?(?=export function prepareInventoryLotUpdate)/)[0]
const authorization = write.match(/export function isAuthorizationError[\s\S]*?(?=export async function addInventoryLot)/)[0]
let state
const calls = []
const paths = []
globalThis.__deleteTest = {
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
    from: table => {
      const call = { table, filters: [] }
      calls.push(call)
      return {
        delete() { call.delete = true; return this },
        eq(key, value) { call.filters.push([key, value]); return this },
        select(value) { call.select = value; return this },
        async maybeSingle() { return state.result },
      }
    },
  }),
  getCrewContext: async () => ({ activeGroupId: state.crew }),
  deleteAction: async id => { calls.push(id); return state.result },
  revalidate: path => paths.push(path),
}
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const { deleteInventoryLot } = await load(`
  const { createSupabaseServerClient, getCrewContext } = globalThis.__deleteTest;
  ${transpile(canonicalize + authorization + boundary)}
`)
const { submitInventoryLotDelete } = await load(`
  const deleteInventoryLot = globalThis.__deleteTest.deleteAction;
  const revalidatePath = globalThis.__deleteTest.revalidate;
  ${transpile(action)}
`)
function reset() {
  calls.length = 0
  paths.length = 0
  state = { user: { id: 'user-1' }, authError: null, crew: 'crew-1', result: { data: { id: '12' }, error: null } }
}
const failure = code => ({ ok: false, code })

test('authentication, crew and invalid IDs stop before database access', async () => {
  reset(); state.user = null
  assert.deepEqual(await deleteInventoryLot('12'), failure('AUTH_REQUIRED'))
  assert.equal(calls.length, 0)
  reset(); state.authError = { message: 'expired' }
  assert.deepEqual(await deleteInventoryLot('12'), failure('AUTH_REQUIRED'))
  assert.equal(calls.length, 0)
  reset(); state.crew = null
  assert.deepEqual(await deleteInventoryLot('12'), failure('ACTIVE_GROUP_REQUIRED'))
  assert.equal(calls.length, 0)
  for (const id of ['', '0', '-1', '1.2', '1e3', 'abc', '9223372036854775808']) {
    reset()
    assert.deepEqual(await deleteInventoryLot(id), failure('LOT_ID_INVALID'))
    assert.equal(calls.length, 0)
  }
})

test('direct delete canonicalizes ID, filters owner and selects id', async () => {
  reset()
  assert.deepEqual(await deleteInventoryLot('00012'), { ok: true, code: 'LOT_DELETED' })
  assert.deepEqual(calls, [{ table: 'inventory', delete: true, filters: [['id', '12'], ['user_id', 'user-1']], select: 'id' }])
})

test('missing and foreign rows produce the same result', async () => {
  for (const scenario of ['missing', 'foreign']) {
    reset(); state.result.data = null
    assert.deepEqual(await deleteInventoryLot('12'), failure('LOT_NOT_FOUND'), scenario)
    assert.equal(calls.length, 1)
  }
})

test('maps authorization and generic errors without exposing details', async () => {
  for (const [error, code] of [
    [{ code: '42501' }, 'DELETE_NOT_ALLOWED'],
    [{ message: 'row-level security violation' }, 'DELETE_NOT_ALLOWED'],
    [{ message: 'permission denied' }, 'DELETE_NOT_ALLOWED'],
    [{ code: 'other', message: 'private details' }, 'DELETE_FAILED'],
  ]) {
    reset(); state.result = { data: null, error }
    assert.deepEqual(await deleteInventoryLot('12'), failure(code))
  }
})

test('action forwards only inventoryId and revalidates only success', async () => {
  reset()
  const data = new FormData()
  data.set('inventoryId', '00012')
  data.set('user_id', 'untrusted')
  state.result = { ok: true, code: 'LOT_DELETED' }
  assert.deepEqual(await submitInventoryLotDelete(data), state.result)
  assert.deepEqual(calls, ['00012'])
  assert.deepEqual(paths, ['/vector/inventory'])
  state.result = failure('LOT_NOT_FOUND')
  assert.deepEqual(await submitInventoryLotDelete(data), state.result)
  assert.deepEqual(paths, ['/vector/inventory'])
  data.delete('inventoryId')
  await submitInventoryLotDelete(data)
  assert.equal(calls[2], '')
})

test('UI gates ownership, confirmation, mutual exclusion, announcements and pending', () => {
  assert.match(view, /const canDelete = editing\.currentUserId !== null && row\.owner_user_id === editing\.currentUserId/)
  assert.match(view, /editing\.deletingLotId === row\.inventory_id && canDelete/)
  assert.match(view, /Lot #\{row\.inventory_id\} \(\{row\.material\}\) löschen\?/)
  assert.match(view, /onClick=\{\(\) => editing\.startDelete\(row\.inventory_id\)\}/)
  assert.match(view, /onClick=\{\(\) => editing\.confirmDelete\(row\.inventory_id\)\}/)
  assert.match(view, /start: \(id\) => \{[^}]*setDeletingLotId\(null\)/)
  assert.match(view, /startDelete: \(id\) => \{[^}]*setEditingLotId\(null\)/)
  assert.match(view, /if \(pending \|\| deletePending\.current \|\| deletingLotId !== id\) return/)
  assert.match(view, /disabled=\{editing\.pending\} onClick=\{editing\.cancelDelete\}/)
  assert.match(view, /INVENTORY_ERROR_MESSAGES\[error\]/)
  assert.match(view, /INVENTORY_SUCCESS_MESSAGES\[success\]/)
  assert.match(view, /setSuccess\(result\.code\)[\s\S]*?router\.refresh\(\)/)
  assert.doesNotMatch(view, /window\.(?:confirm|alert)/)
  assert.match(messages, /LOT_DELETED: 'Lot wurde aus dem Inventory gelöscht\.'/)
})

test('delete confirmation labels controls and manages focus only on open and cancel', () => {
  assert.match(view, /role="group" aria-labelledby=\{`delete-question-\$\{row\.inventory_id\}`\}/)
  assert.match(view, /<p id=\{`delete-question-\$\{row\.inventory_id\}`\}>Lot #\{row\.inventory_id\} \(\{row\.material\}\) löschen\?<\/p>/)
  assert.match(view, /ref=\{editing\.deleteCancelRef\} aria-describedby=\{`delete-question-\$\{row\.inventory_id\}`\}/)
  assert.match(view, /<button type="button" aria-describedby=\{`delete-question-\$\{row\.inventory_id\}`\} disabled=\{editing\.pending\} onClick=\{\(\) => editing\.confirmDelete\(row\.inventory_id\)\}/)
  assert.match(view, /useEffect\(\(\) => \{\s*if \(deletingLotId !== null\) \{\s*deleteCancelRef\.current\?\.focus\(\)/)
  assert.match(view, /deleteTriggerRefs\.current\.get\(restoreDeleteFocusId\.current\)\?\.focus\(\)/)
  assert.match(view, /restoreDeleteFocusId\.current = null[\s\S]*?\}, \[deletingLotId\]\)/)
  assert.match(view, /if \(element\) editing\.deleteTriggerRefs\.current\.set\(row\.inventory_id, element\)/)
  assert.match(view, /cancelDelete: \(\) => \{ restoreDeleteFocusId\.current = deletingLotId; setDeletingLotId\(null\)/)
  const successBranch = view.match(/if \(result\.ok\) \{([\s\S]*?)\} else setError/)[1]
  assert.doesNotMatch(successBranch, /restoreDeleteFocusId|\.focus\(/)
  assert.doesNotMatch(view, /autoFocus|setTimeout|(?:window\.)?(?:confirm|alert)\s*\(/)
})
