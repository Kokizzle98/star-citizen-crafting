import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const quantity = await readFile(new URL('../lib/inventory/inventory-quantity.ts', import.meta.url), 'utf8')
const validation = (await readFile(new URL('../lib/inventory/inventory-lot-validation.ts', import.meta.url), 'utf8'))
  .replace(/^import \{[\s\S]*?\} from '\.\/inventory-quantity'\s*$/m, '')
const update = (await readFile(new URL('../lib/inventory/inventory-update.ts', import.meta.url), 'utf8'))
  .replace(/^import \{ prepareInventoryLotFields \} from .*$/m, '')

const javascript = ts.transpileModule(`${quantity}\n${validation}\n${update}`, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { prepareInventoryLotUpdate } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
)

const locationId = '98a57fa1-be28-4cae-8d58-4758df6195f7'
const base = { inventoryId: '1', rawAmount: '1', inputUnit: 'SCU', quality: '507', locationId }
const prepare = (changes = {}, kind = 'volume') => prepareInventoryLotUpdate({ ...base, ...changes }, kind)

test('validates and canonicalizes bigint inventory IDs', () => {
  for (const [inventoryId, expected] of [['1', '1'], ['00012', '12'], ['9223372036854775807', '9223372036854775807']]) {
    const result = prepare({ inventoryId })
    assert.equal(result.ok, true)
    assert.equal(result.value.inventoryId, expected)
  }
  for (const inventoryId of ['', ' ', '0', '-1', '1.5', '1e3', 'abc', ' 1', '9223372036854775808']) {
    assert.deepEqual(prepare({ inventoryId }), { ok: false, code: 'LOT_ID_INVALID' })
  }
})

test('prepares exact quantities for every volume unit', () => {
  for (const [inputUnit, amount, amountMicroScu] of [
    ['SCU', '1', '1000000'], ['cSCU', '0.01', '10000'],
    ['mSCU', '0.001', '1000'], ['µSCU', '0.000001', '1'],
  ]) {
    const result = prepare({ inputUnit })
    assert.equal(result.ok, true)
    assert.equal(result.value.amount, amount)
    assert.equal(result.value.amountMicroScu, amountMicroScu)
    assert.equal(result.value.inputUnit, inputUnit)
  }
  assert.deepEqual(prepare({ rawAmount: '2.5', inputUnit: 'cSCU' }).value, {
    inventoryId: '1', amount: '0.025', amountMicroScu: '25000',
    inputUnit: 'cSCU', quality: 507, locationId,
  })
})

test('prepares count quantities without treating them as volume', () => {
  assert.deepEqual(prepare({ rawAmount: '130', inputUnit: 'COUNT' }, 'count').value, {
    inventoryId: '1', amount: '130', amountMicroScu: '130',
    inputUnit: 'COUNT', quality: 507, locationId,
  })
  assert.deepEqual(prepare({ rawAmount: '1.5', inputUnit: 'COUNT' }, 'count'), {
    ok: false, code: 'AMOUNT_NOT_INTEGER',
  })
})

test('validates quality and location using the Add rules', () => {
  for (const quality of ['0', '507', '1000']) {
    assert.equal(prepare({ quality }).value.quality, Number(quality))
  }
  for (const [quality, code] of [['', 'QUALITY_REQUIRED'], ['507.5', 'QUALITY_INVALID'], ['-1', 'QUALITY_INVALID'], ['1001', 'QUALITY_OUT_OF_RANGE']]) {
    assert.deepEqual(prepare({ quality }), { ok: false, code })
  }
  assert.equal(prepare().value.locationId, locationId)
  assert.deepEqual(prepare({ locationId: '' }), { ok: false, code: 'LOCATION_REQUIRED' })
  assert.deepEqual(prepare({ locationId: 'invalid' }), { ok: false, code: 'LOCATION_INVALID' })
})

test('never copies untrusted identity, material or timestamp fields', () => {
  const forbidden = ['user_id', 'userId', 'player_name', 'playerName', 'material', 'materialKind', 'created_at', 'createdAt', 'updated_at', 'updatedAt']
  const injected = Object.fromEntries(forbidden.map(key => [key, 'untrusted']))
  const result = prepare(injected)
  assert.equal(result.ok, true)
  assert.deepEqual(Object.keys(result.value).sort(), ['inventoryId', 'amount', 'amountMicroScu', 'inputUnit', 'quality', 'locationId'].sort())
  for (const key of forbidden) assert.equal(key in result.value, false)
})

test('rejects unknown material classification', () => {
  assert.deepEqual(
    prepareInventoryLotUpdate(base, undefined),
    {
      ok: false,
      code: 'MATERIAL_UNIT_UNKNOWN',
    },
  )
})
