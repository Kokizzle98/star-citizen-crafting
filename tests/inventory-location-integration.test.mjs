import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [options, write, quantity, validation, result, filtering, view, readPath, addForm, editForm] = await Promise.all([
  read('lib/inventory/inventory-form-options.ts'),
  read('lib/inventory/inventory-write.ts'),
  read('lib/inventory/inventory-quantity.ts'),
  read('lib/inventory/inventory-lot-validation.ts'),
  read('lib/inventory/inventory-result.ts'),
  read('lib/inventory/inventory-search-filter-sort.ts'),
  read('components/inventory/InventoryView.tsx'),
  read('lib/inventory/inventory-read.ts'),
  read('components/inventory/AddInventoryLotForm.tsx'),
  read('components/inventory/EditInventoryLotForm.tsx'),
])
const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const load = source => import(`data:text/javascript;base64,${Buffer.from(transpile(source)).toString('base64')}`)

const locations = [
  { id: '11111111-1111-4111-8111-111111111111', canonical_name: 'Unbekannt', normalized_name: 'unbekannt', is_system: true, is_archived: false },
  { id: '22222222-2222-4222-8222-222222222222', canonical_name: 'Legacy', normalized_name: 'legacy', is_system: false, is_archived: false },
  { id: '33333333-3333-4333-8333-333333333333', canonical_name: 'Promoted', normalized_name: 'promoted', is_system: false, is_archived: false },
  { id: '44444444-4444-4444-8444-444444444444', canonical_name: 'Archived', normalized_name: 'archived', is_system: false, is_archived: true },
]
let state
let calls
function reset() {
  state = { locations: structuredClone(locations), outcome: 'CREATED', failFallback: false }
  calls = []
}
globalThis.__locationIntegration = {
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }) },
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      const query = {
        select(value) { call.select = value; return this },
        eq(key, value) { call.filters.push([key, value]); return this },
        is(key, value) { call.filters.push([key, value]); return this },
        async order() {
          return { data: state.locations.filter(row => call.filters.every(([k, v]) => row[k] === v)), error: null }
        },
        async maybeSingle() {
          if (table === 'game_accounts') return { data: { handle: 'player' }, error: null }
          if (state.failFallback && call.filters.some(([k]) => k === 'normalized_name')) return { data: null, error: { code: 'failed' } }
          const matches = state.locations.filter(row => call.filters.every(([k, v]) => row[k] === v))
          return { data: matches.length === 1 ? matches[0] : null, error: matches.length > 1 ? { code: 'ambiguous' } : null }
        },
      }
      return query
    },
    rpc(name, payload) {
      calls.push({ rpc: name, payload })
      return { select: () => ({ maybeSingle: async () => ({
        data: { inventory_id: '1', outcome: state.outcome, amount: '1', amount_micro_scu: '1000000' }, error: null,
      }) }) }
    },
  }),
  getCrewContext: async () => ({ activeGroupId: 'crew' }),
  getLiveMaterialUnits: async () => ({ available: true, units: { Copper: 'volume' } }),
}
const mocks = `const { createSupabaseServerClient, getCrewContext, getLiveMaterialUnits } = globalThis.__locationIntegration;\n`
const strippedOptions = options.replace(/^import .*$/gm, '')
const strippedValidation = validation.replace(/^import \{[\s\S]*?\} from '\.\/inventory-quantity'\s*$/m, '')
const strippedWrite = write.replace(/^\uFEFF?import 'server-only'\s*$/m, '')
  .replace(/^import \{[\s\S]*?\} from '@\/lib\/inventory\/inventory-quantity'\s*$/m, '')
  .replace(/^import .*$/gm, '')
const { getInventoryLocationOptions } = await load(mocks + strippedOptions)
const { addInventoryLot } = await load(mocks + quantity + '\n' + strippedValidation + '\n' + strippedWrite)
const { inventoryReadResult } = await load(result)
const { filterInventoryRows } = await load(filtering)
const input = { material: 'Copper', rawAmount: '1', inputUnit: 'SCU', quality: '500', locationId: '' }

test('options include active promoted, legacy and independent system fallback only', async () => {
  reset()
  const found = await getInventoryLocationOptions()
  assert.equal(found.ok, true)
  assert.equal(found.fallbackLocationId, locations[0].id)
  assert.deepEqual(found.locations, locations.slice(0, 3).map(({ id, canonical_name }) => ({ id, canonical_name })))
  assert.deepEqual(calls.map(call => call.table), ['inventory_locations'])
  assert.deepEqual(calls[0].filters, [['is_archived', false]])
  assert.match(addForm, /defaultValue=\{fallbackLocationId\}/)
  assert.match(editForm, /locations\.map\(\(location\).*?value=\{location\.id\}/)
  state.locations[0].is_archived = true
  assert.deepEqual(await getInventoryLocationOptions(), { ok: false })
})

test('add defaults only missing location to active system fallback and rejects invalid targets', async () => {
  for (const [locationId, expected] of [['', locations[0].id], [locations[0].id, locations[0].id], [locations[1].id, locations[1].id], [locations[2].id, locations[2].id]]) {
    reset()
    assert.deepEqual(await addInventoryLot({ ...input, locationId }), { ok: true, code: 'LOT_CREATED' })
    assert.equal(calls.find(call => call.rpc)?.payload.p_location_id, expected)
    assert.ok(calls.every(call => !call.table || ['inventory_locations', 'game_accounts'].includes(call.table)))
  }
  for (const locationId of [locations[3].id, '55555555-5555-4555-8555-555555555555', 'invalid']) {
    reset()
    assert.equal((await addInventoryLot({ ...input, locationId })).ok, false)
    assert.equal(calls.some(call => call.rpc), false)
  }
  reset()
  state.locations[0].is_archived = true
  assert.deepEqual(await addInventoryLot(input), { ok: false, code: 'LOCATION_INVALID' })
  assert.equal(calls.some(call => call.rpc), false)
  reset()
  state.outcome = 'MERGED'
  assert.deepEqual(await addInventoryLot(input), { ok: true, code: 'LOT_MERGED' })
})

test('client preserves and filters returned archived assignments by UUID and name', () => {
  const base = {
    owner_user_id: 'owner', player_name: 'Player', material: 'Copper', amount: '1', amount_micro_scu: '1000000',
    input_unit: 'SCU', quality: 500, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
  const rows = [
    { ...base, inventory_id: '1', location_id: locations[2].id, location_name: 'Promoted' },
    { ...base, inventory_id: '2', location_id: locations[3].id, location_name: 'Archived' },
  ]
  const snapshot = structuredClone(rows)
  const parsed = inventoryReadResult(rows, null)
  assert.deepEqual(parsed, { status: 'success', rows })
  const filters = { query: '', player: '', locationId: '', qualityMin: null, qualityMax: null }
  assert.deepEqual(filterInventoryRows(parsed.rows, { ...filters, query: 'archived' }), [rows[1]])
  assert.deepEqual(filterInventoryRows(parsed.rows, { ...filters, locationId: locations[3].id }), [rows[1]])
  assert.deepEqual(rows, snapshot)
  assert.match(view, /groupBy\(entries, \(row\) => row\.location_id\)/)
  assert.match(view, /rows\.map\(\(row\) => \[row\.location_id, row\.location_name\]/)
  assert.match(view, /materials\(visibleRows\)/)
  assert.match(view, /locations\(visibleRows\)/)
  assert.doesNotMatch(readPath, /is_archived|\.update\(|\.insert\(|\.delete\(/)
})
