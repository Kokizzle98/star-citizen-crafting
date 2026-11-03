import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [action, form, view, page, helper] = await Promise.all([
  read('app/vector/inventory/actions.ts'),
  read('components/inventory/EditInventoryLotForm.tsx'),
  read('components/inventory/InventoryView.tsx'),
  read('app/vector/inventory/page.tsx'),
  read('lib/inventory/inventory-edit-display.ts'),
])
const transpile = source => ts.transpileModule(source.replace(/^import .*$/gm, ''), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const calls = []
const paths = []
let result = { ok: true, code: 'LOT_UPDATED' }
globalThis.__editTest = {
  update: async input => { calls.push(input); return result },
  revalidate: path => paths.push(path),
}
const actionModule = await import(`data:text/javascript;base64,${Buffer.from(`
  const updateInventoryLot = globalThis.__editTest.update;
  const revalidatePath = globalThis.__editTest.revalidate;
  ${transpile(action)}
`).toString('base64')}`)
const { inventoryEditInitialValue } = await import(`data:text/javascript;base64,${Buffer.from(transpile(helper)).toString('base64')}`)

test('update adapter forwards only allowlisted fields and revalidates only success', async () => {
  const data = new FormData()
  const expected = { inventoryId: '12', rawAmount: '2.5', inputUnit: 'cSCU', quality: '500', locationId: 'location' }
  for (const [key, value] of Object.entries({
    ...expected, user_id: 'x', userId: 'x', player_name: 'x', playerName: 'x', material: 'x',
    materialKind: 'x', amount: 'x', amountMicroScu: 'x', amount_micro_scu: 'x',
    created_at: 'x', createdAt: 'x', updated_at: 'x', updatedAt: 'x',
  })) data.set(key, value)
  assert.deepEqual(await actionModule.submitInventoryLotUpdate(data), result)
  assert.deepEqual(calls, [expected])
  assert.deepEqual(paths, ['/vector/inventory'])
  result = { ok: false, code: 'LOT_NOT_FOUND' }
  assert.deepEqual(await actionModule.submitInventoryLotUpdate(data), result)
  assert.deepEqual(paths, ['/vector/inventory'])
  data.set('inputUnit', 'bad')
  assert.deepEqual(await actionModule.submitInventoryLotUpdate(data), { ok: false, code: 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND' })
  data.delete('inputUnit')
  assert.deepEqual(await actionModule.submitInventoryLotUpdate(data), { ok: false, code: 'UNIT_REQUIRED' })
  assert.equal(calls.length, 2)
})

test('initial values are exact for all units and reject inconsistent units', () => {
  const row = { amount: '0.025', amount_micro_scu: '25000' }
  for (const [unit, rawAmount] of [['SCU', '0.025'], ['cSCU', '2.5'], ['mSCU', '25'], ['µSCU', '25000']]) {
    assert.deepEqual(inventoryEditInitialValue({ ...row, input_unit: unit }, 'volume'), { rawAmount, inputUnit: unit })
  }
  assert.deepEqual(inventoryEditInitialValue({ ...row, amount: '130', input_unit: 'COUNT' }, 'count'), { rawAmount: '130', inputUnit: 'COUNT' })
  assert.equal(inventoryEditInitialValue({ ...row, input_unit: 'COUNT' }, 'volume'), null)
  assert.equal(inventoryEditInitialValue({ ...row, input_unit: 'SCU' }, 'count'), null)
  assert.doesNotMatch(helper, /\bNumber\b|parseFloat|\s\*\s/)
})

test('inline editor is ownership gated and has immutable material and accessible controls', () => {
  assert.match(page, /auth\.getUser\(\)/)
  assert.match(page, /getActiveGroupInventory\(\)/)
  assert.match(view, /row\.owner_user_id === editing\.currentUserId/)
  assert.match(view, /editing\.editingLotId === row\.inventory_id && canEdit/)
  assert.match(form, /<p>\{row\.material\}<\/p>/)
  assert.doesNotMatch(form, /name="(?:material|materialKind|user_id|amount|updated_at)"/)
  assert.match(form, /<option value="COUNT">Stück<\/option>/)
  assert.match(form, /\['SCU', 'cSCU', 'mSCU', 'µSCU'\]/)
  assert.match(form, /onClick=\{onCancel\}/)
  assert.match(form, /event\.key === 'Escape'/)
  assert.match(form, /aria-invalid/)
  assert.match(form, /aria-describedby/)
  assert.match(form, /role="alert"/)
  assert.match(view, /INVENTORY_SUCCESS_MESSAGES\.LOT_UPDATED/)
  assert.doesNotMatch(form + view + action, /\.from\s*\(|\.update\s*\(/)
})
