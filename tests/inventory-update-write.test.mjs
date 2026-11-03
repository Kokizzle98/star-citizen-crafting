import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../lib/inventory/${path}`, import.meta.url), 'utf8')
const quantity = await read('inventory-quantity.ts')
const validation = (await read('inventory-lot-validation.ts'))
  .replace(/^import \{[\s\S]*?\} from '\.\/inventory-quantity'\s*$/m, '')
const update = (await read('inventory-update.ts'))
  .replace(/^import \{ prepareInventoryLotFields \} from .*$/m, '')
const write = await read('inventory-write.ts')
const authorization = write.match(/export function isAuthorizationError[\s\S]*?(?=export async function addInventoryLot)/)[0]
const boundary = (await read('inventory-update-write.ts'))
  .replace(/^import 'server-only'\s*$/m, '')
  .replace(/^import \{[\s\S]*?\} from '@\/lib\/inventory\/inventory-update'\s*$/m, '')
  .replace(/^import .* from .*$/gm, '')
const source = `
const { createSupabaseServerClient, getCrewContext, getLiveMaterialUnits } = globalThis.__inventoryUpdateMocks;
${quantity}\n${validation}\n${update}\n${authorization}\n${boundary}`
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText

let state
const calls = []
globalThis.__inventoryUpdateMocks = {
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
    from: table => {
      const call = { table, filters: [] }
      calls.push(call)
      const query = {
        select(value) { call.select = value; return this },
        update(value) { call.payload = value; return this },
        eq(key, value) { call.filters.push([key, value]); return this },
        async maybeSingle() {
          if (table === 'inventory_locations') return state.location
          return call.payload ? state.update : state.lot
        },
      }
      return query
    },
  }),
  getCrewContext: async () => ({ activeGroupId: state.crew }),
  getLiveMaterialUnits: async () => state.metadata,
}
const { updateInventoryLot } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
)
const locationId = '98a57fa1-be28-4cae-8d58-4758df6195f7'
const input = { inventoryId: '00012', rawAmount: '2.5', inputUnit: 'cSCU', quality: '507', locationId }
function reset() {
  calls.length = 0
  state = {
    user: { id: 'user-1' }, authError: null, crew: 'crew-1',
    lot: { data: { id: '12', material: 'Aluminum' }, error: null },
    metadata: { available: true, units: { Aluminum: 'volume', Feynmaline: 'count' } },
    location: { data: { id: locationId }, error: null },
    update: { data: { id: '12' }, error: null },
  }
}
const result = code => ({ ok: false, code })

test('authentication, crew and ID failures stop before database access', async () => {
  reset(); state.user = null
  assert.deepEqual(await updateInventoryLot(input), result('AUTH_REQUIRED'))
  assert.equal(calls.length, 0)
  reset(); state.authError = { message: 'expired' }
  assert.deepEqual(await updateInventoryLot(input), result('AUTH_REQUIRED'))
  assert.equal(calls.length, 0)
  reset(); state.crew = null
  assert.deepEqual(await updateInventoryLot(input), result('ACTIVE_GROUP_REQUIRED'))
  assert.equal(calls.length, 0)
  for (const inventoryId of ['', '0', '-1', '1.2', '1e3', 'abc', '9223372036854775808']) {
    reset()
    assert.deepEqual(await updateInventoryLot({ ...input, inventoryId }), result('LOT_ID_INVALID'))
    assert.equal(calls.length, 0)
  }
})

test('missing and foreign lots are indistinguishable and stop processing', async () => {
  for (const scenario of ['missing', 'foreign']) {
    reset(); state.lot.data = null
    assert.deepEqual(await updateInventoryLot(input), result('LOT_NOT_FOUND'), scenario)
    assert.deepEqual(calls, [{ table: 'inventory', select: 'id, material', filters: [['id', '12'], ['user_id', 'user-1']] }])
  }
})

test('uses only own LIVE material metadata and rejects unavailable or ambiguous units', async () => {
  for (const material of ['constructor', 'toString', 'Unknown', 'Ambiguous']) {
    reset(); state.lot.data.material = material; state.metadata.units.Ambiguous = undefined
    assert.deepEqual(await updateInventoryLot({ ...input, material: 'Aluminum', materialKind: 'volume' }), result('MATERIAL_UNIT_UNKNOWN'))
    assert.equal(calls.length, 1)
  }
  reset(); state.metadata.available = false
  assert.deepEqual(await updateInventoryLot(input), result('MATERIAL_UNIT_UNKNOWN'))
  assert.equal(calls.length, 1)
})

test('validates preparation and active location before update', async () => {
  reset()
  assert.deepEqual(await updateInventoryLot({ ...input, quality: '1001' }), result('QUALITY_OUT_OF_RANGE'))
  assert.equal(calls.length, 1)
  reset(); state.location.data = null
  assert.deepEqual(await updateInventoryLot(input), result('LOCATION_INVALID'))
  assert.deepEqual(calls[1].filters, [['id', locationId], ['is_archived', false]])
  assert.equal(calls.length, 2)
})

test('updates exact volume and count fields using database material and server timestamp', async () => {
  for (const [material, changes, amount, micro, unit] of [
    ['Aluminum', {}, '0.025', '25000', 'cSCU'],
    ['Feynmaline', { rawAmount: '130', inputUnit: 'COUNT' }, '130', '130', 'COUNT'],
  ]) {
    reset(); state.lot.data.material = material
    const before = Date.now()
    assert.deepEqual(await updateInventoryLot({ ...input, ...changes, material: 'untrusted', updated_at: 'untrusted' }), { ok: true, code: 'LOT_UPDATED' })
    const after = Date.now()
    const call = calls[2]
    assert.equal(call.table, 'inventory')
    assert.equal(call.select, 'id')
    assert.deepEqual(call.filters, [['id', '12'], ['user_id', 'user-1']])
    assert.deepEqual(Object.keys(call.payload).sort(), ['amount', 'amount_micro_scu', 'input_unit', 'quality', 'location_id', 'updated_at'].sort())
    assert.deepEqual({ ...call.payload, updated_at: undefined }, {
      amount, amount_micro_scu: micro, input_unit: unit, quality: 507, location_id: locationId, updated_at: undefined,
    })
    const timestamp = Date.parse(call.payload.updated_at)
    assert.ok(timestamp >= before && timestamp <= after)
    assert.equal(new Date(timestamp).toISOString(), call.payload.updated_at)
  }
})

test('zero updated rows are not successful', async () => {
  reset(); state.update.data = null
  assert.deepEqual(await updateInventoryLot(input), result('LOT_NOT_FOUND'))
})

test('maps authorization and unexpected errors at every database operation', async () => {
  for (const step of ['lot', 'location', 'update']) {
    for (const [error, code] of [
      [{ code: '42501' }, 'UPDATE_NOT_ALLOWED'],
      [{ message: 'row-level security violation' }, 'UPDATE_NOT_ALLOWED'],
      [{ message: 'permission denied' }, 'UPDATE_NOT_ALLOWED'],
      [{ code: 'other', message: 'private details' }, 'UPDATE_FAILED'],
    ]) {
      reset(); state[step] = { data: null, error }
      assert.deepEqual(await updateInventoryLot(input), result(code), step)
      assert.equal(calls.length, { lot: 1, location: 2, update: 3 }[step])
    }
  }
})
