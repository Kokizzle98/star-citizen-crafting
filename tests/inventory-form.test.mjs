import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [action, form, page, options] = await Promise.all([
  read('app/vector/inventory/actions.ts'),
  read('components/inventory/AddInventoryLotForm.tsx'),
  read('app/vector/inventory/page.tsx'),
  read('lib/inventory/inventory-form-options.ts'),
])

const calls = []
const revalidated = []
let writeResult = { ok: true, code: 'LOT_CREATED' }
const javascript = ts.transpileModule(action.replace(/^import .*$/gm, ''), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleSource = `
  const addInventoryLot = globalThis.__inventoryFormTest.add;
  const revalidatePath = globalThis.__inventoryFormTest.revalidate;
  ${javascript}
`
globalThis.__inventoryFormTest = {
  add: async (input) => { calls.push(input); return writeResult },
  revalidate: (path) => revalidated.push(path),
}
const { submitInventoryLot } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
)

test('adapter sends only allowed raw fields to the write boundary and revalidates', async () => {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    material: 'Test', rawAmount: '1,25', inputUnit: 'cSCU', quality: '500',
    locationId: 'location', user_id: 'forged', player_name: 'forged',
    materialKind: 'count', amount_micro_scu: '999',
  })) data.set(key, value)
  assert.deepEqual(await submitInventoryLot(data), { ok: true, code: 'LOT_CREATED' })
  assert.deepEqual(calls, [{
    material: 'Test', rawAmount: '1,25', inputUnit: 'cSCU', quality: '500', locationId: 'location',
  }])
  assert.deepEqual(revalidated, ['/vector/inventory'])
})

test('merged Lot success revalidates the Inventory path', async () => {
  calls.length = 0
  revalidated.length = 0
  writeResult = { ok: true, code: 'LOT_MERGED' }

  const data = new FormData()

  for (const [key, value] of Object.entries({
    material: 'Beryl',
    rawAmount: '1',
    inputUnit: 'SCU',
    quality: '904',
    locationId: 'location',
  })) {
    data.set(key, value)
  }

  assert.deepEqual(
    await submitInventoryLot(data),
    { ok: true, code: 'LOT_MERGED' },
  )

  assert.equal(calls.length, 1)
  assert.deepEqual(
    revalidated,
    ['/vector/inventory'],
  )

  writeResult = { ok: true, code: 'LOT_CREATED' }
})

test('adapter rejects missing and invalid units without writing', async () => {
  const data = new FormData()
  assert.deepEqual(await submitInventoryLot(data), { ok: false, code: 'UNIT_REQUIRED' })
  data.set('inputUnit', 'invalid')
  assert.deepEqual(await submitInventoryLot(data), { ok: false, code: 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND' })
  assert.equal(calls.length, 1)
})

test('count is passed as COUNT and failed writes retain their error without revalidation', async () => {
  const data = new FormData()
  data.set('inputUnit', 'COUNT')
  writeResult = { ok: false, code: 'PLAYER_CONTEXT_REQUIRED' }
  assert.deepEqual(await submitInventoryLot(data), writeResult)
  assert.equal(calls[1].inputUnit, 'COUNT')
  assert.deepEqual(revalidated, ['/vector/inventory'])
})

test('form exposes only the appropriate units and central messages', () => {
  assert.match(form, /kind === 'count' && <option value="COUNT">Stück/)
  assert.match(form, /kind === 'volume' && \['SCU', 'cSCU', 'mSCU', 'µSCU'\]/)
  assert.match(form, /INVENTORY_ERROR_MESSAGES\[result\.code\]/)
  assert.match(form, /INVENTORY_SUCCESS_MESSAGES\[result\.code\]/)
  assert.doesNotMatch(form + action, /\.from\(['"]inventory['"]\)|\.insert\s*\(/)
  assert.doesNotMatch(form, /name="(?:user_id|player_name|materialKind|amount_micro_scu)"/)
})

test('page retains inventory read boundary and loads existing active locations', () => {
  assert.match(page, /await getActiveGroupInventory\(\)/)
  assert.match(options, /\.from\('inventory_locations'\)/)
  assert.match(options, /\.select\('id, canonical_name'\)/)
  assert.match(options, /\.eq\('is_archived', false\)/)
})
