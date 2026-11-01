import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../lib/inventory/inventory-result.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { inventoryReadResult } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)

const row = {
  inventory_id: '9223372036854775807',
  owner_user_id: 'owner',
  player_name: 'Player',
  material: 'Material',
  amount: '12345678901234567890.123456',
  amount_micro_scu: '9223372036854775807',
  input_unit: null,
  quality: 1000,
  location_id: 'location',
  location_name: 'Levski',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

test('preserves valid distinct rows and numeric strings', () => {
  const rows = [row, { ...row, inventory_id: '2' }]
  assert.deepEqual(inventoryReadResult(rows, null), { status: 'success', rows })
})

test('returns successful empty inventory', () => {
  assert.deepEqual(inventoryReadResult([], null), { status: 'success', rows: [] })
})

test('rejects malformed data without leaking partial rows', () => {
  const invalid = [
    { ...row, quality: 1001 },
    { ...row, quality: 0.5 },
    { ...row, quality: NaN },
    { ...row, location_name: '' },
    { ...row, location_id: null },
    { ...row, amount: 0.1 },
    { ...row, amount_micro_scu: 9223372036854776000 },
    { ...row, inventory_id: '-1' },
    { ...row, inventory_id: '0' },
    { ...row, amount: '-1' },
    { ...row, amount: '0' },
    { ...row, amount_micro_scu: '-1' },
    { ...row, amount_micro_scu: '0' },
    { ...row, input_unit: '' },
    { ...row, updated_at: 'not a timestamp' },
  ]
  for (const item of invalid) {
    assert.deepEqual(inventoryReadResult([row, item], null), { status: 'read_error' })
  }
  assert.deepEqual(inventoryReadResult(null, null), { status: 'read_error' })
})

test('maps RPC errors to stable states', () => {
  for (const [message, status] of [
    ['ACTIVE_GROUP_REQUIRED', 'no_active_crew'],
    ['ACTIVE_GROUP_NOT_ALLOWED', 'unauthorized'],
    ['AUTH_REQUIRED', 'unauthorized'],
    ['other failure', 'read_error'],
  ]) {
    assert.deepEqual(inventoryReadResult(null, { message }), { status })
  }
})
