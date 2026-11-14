import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

let source = await readFile(
  new URL('../lib/inventory/inventory-write.ts', import.meta.url),
  'utf8',
)

const quantitySource = await readFile(
  new URL('../lib/inventory/inventory-quantity.ts', import.meta.url),
  'utf8',
)

const validationSource = (await readFile(
  new URL('../lib/inventory/inventory-lot-validation.ts', import.meta.url),
  'utf8',
)).replace(/^import \{[\s\S]*?\} from '\.\/inventory-quantity'\s*$/m, '')

source = source
  .replace(/^\uFEFF?import 'server-only'\s*$/m, '')
  .replace(/^import .*inventory-error-messages.*$/m, '')
  .replace(/^import .*inventory-lot-validation.*$/m, '')
  .replace(
    /^import \{[\s\S]*?\} from '@\/lib\/inventory\/inventory-quantity'\s*$/m,
    '',
  )
  .replace(/^import .*crew-context.*$/m, '')
  .replace(/^import .*material-units.*$/m, '')
  .replace(/^import .*supabase\/server.*$/m, '')
  .replace(
    /export async function addInventoryLot[\s\S]*$/,
    '',
  )

const combined = `${quantitySource}\n${validationSource}\n${source}`

const javascript = ts.transpileModule(combined, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const {
  prepareInventoryLot,
  inventoryAddRpcOutcome,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
)

const LOCATION_ID = '98a57fa1-be28-4cae-8d58-4758df6195f7'

test('prepares an exact volume insert payload', () => {
  const result = prepareInventoryLot(
    {
      material: 'Aluminum',
      rawAmount: '2.5',
      inputUnit: 'cSCU',
      quality: '507',
      locationId: LOCATION_ID,
    },
    'volume',
  )

  assert.deepEqual(result, {
    ok: true,
    value: {
      material: 'Aluminum',
      amount: '0.025',
      amountMicroScu: '25000',
      inputUnit: 'cSCU',
      quality: 507,
      locationId: LOCATION_ID,
    },
  })
})

test('prepares a count payload using the compatibility rule', () => {
  const result = prepareInventoryLot(
    {
      material: 'Feynmaline',
      rawAmount: '130',
      inputUnit: 'COUNT',
      quality: '881',
      locationId: LOCATION_ID,
    },
    'count',
  )

  assert.deepEqual(result, {
    ok: true,
    value: {
      material: 'Feynmaline',
      amount: '130',
      amountMicroScu: '130',
      inputUnit: 'COUNT',
      quality: 881,
      locationId: LOCATION_ID,
    },
  })
})

test('rejects missing material and location', () => {
  assert.deepEqual(
    prepareInventoryLot(
      {
        material: ' ',
        rawAmount: '1',
        inputUnit: 'SCU',
        quality: '1',
        locationId: LOCATION_ID,
      },
      'volume',
    ),
    {
      ok: false,
      code: 'MATERIAL_REQUIRED',
    },
  )

  assert.deepEqual(
    prepareInventoryLot(
      {
        material: 'Aluminum',
        rawAmount: '1',
        inputUnit: 'SCU',
        quality: '1',
        locationId: '',
      },
      'volume',
    ),
    {
      ok: false,
      code: 'LOCATION_REQUIRED',
    },
  )
})

test('rejects malformed locations', () => {
  assert.deepEqual(
    prepareInventoryLot(
      {
        material: 'Aluminum',
        rawAmount: '1',
        inputUnit: 'SCU',
        quality: '1',
        locationId: 'not-a-uuid',
      },
      'volume',
    ),
    {
      ok: false,
      code: 'LOCATION_INVALID',
    },
  )
})

test('validates quality without rounding', () => {
  for (const [quality, code] of [
    ['', 'QUALITY_REQUIRED'],
    ['507.5', 'QUALITY_INVALID'],
    ['-1', 'QUALITY_INVALID'],
    ['1001', 'QUALITY_OUT_OF_RANGE'],
  ]) {
    assert.deepEqual(
      prepareInventoryLot(
        {
          material: 'Aluminum',
          rawAmount: '1',
          inputUnit: 'SCU',
          quality,
          locationId: LOCATION_ID,
        },
        'volume',
      ),
      {
        ok: false,
        code,
      },
    )
  }
})

test('does not expose owner identity in input or prepared payload', () => {
  const result = prepareInventoryLot(
    {
      material: 'Aluminum',
      rawAmount: '1',
      inputUnit: 'SCU',
      quality: '500',
      locationId: LOCATION_ID,
    },
    'volume',
  )

  assert.equal(result.ok, true)

  if (!result.ok) {
    assert.fail(`Expected success, received ${result.code}`)
  }

  assert.equal('user_id' in result.value, false)
  assert.equal('player_name' in result.value, false)
})

test('write boundary accepts only own LIVE material-unit properties', async () => {
  const source = await readFile(
    new URL('../lib/inventory/inventory-write.ts', import.meta.url),
    'utf8',
  )

  assert.match(
    source,
    /Object\.hasOwn\(metadata\.units,\s*material\)/,
  )
})

test('write boundary rejects archived inventory locations', async () => {
  const source = await readFile(
    new URL('../lib/inventory/inventory-write.ts', import.meta.url),
    'utf8',
  )

  assert.match(
    source,
    /\.from\(['"]inventory_locations['"]\)[\s\S]*?\.eq\(['"]id['"],\s*prepared\.value\.locationId\)[\s\S]*?\.eq\(['"]is_archived['"],\s*false\)/,
  )
})


test('maps validated atomic RPC outcomes to application success codes', () => {
  assert.equal(
    inventoryAddRpcOutcome({
      inventory_id: '18',
      outcome: 'CREATED',
      amount: '1.5',
      amount_micro_scu: '1500000',
    }),
    'LOT_CREATED',
  )

  assert.equal(
    inventoryAddRpcOutcome({
      inventory_id: '18',
      outcome: 'MERGED',
      amount: '2',
      amount_micro_scu: '2000000',
    }),
    'LOT_MERGED',
  )
})

test('rejects malformed or unknown atomic RPC results', () => {
  for (const value of [
    null,
    [],
    {},
    {
      inventory_id: '0',
      outcome: 'CREATED',
      amount: '1',
      amount_micro_scu: '1000000',
    },
    {
      inventory_id: '18',
      outcome: 'UNKNOWN',
      amount: '1',
      amount_micro_scu: '1000000',
    },
    {
      inventory_id: '18',
      outcome: 'MERGED',
      amount: '0',
      amount_micro_scu: '0',
    },
  ]) {
    assert.equal(inventoryAddRpcOutcome(value), null)
  }
})

test('write boundary uses only the atomic add-or-merge RPC', async () => {
  const source = await readFile(
    new URL('../lib/inventory/inventory-write.ts', import.meta.url),
    'utf8',
  )

  assert.match(
    source,
    /\.rpc\(['"]add_or_merge_inventory_lot['"],\s*\{/,
  )

  for (const parameter of [
    'p_material',
    'p_amount',
    'p_amount_micro_scu',
    'p_input_unit',
    'p_quantity_kind',
    'p_quality',
    'p_location_id',
  ]) {
    assert.match(
      source,
      new RegExp(`\\b${parameter}\\b`),
    )
  }

  assert.doesNotMatch(
    source,
    /\.from\(['"]inventory['"]\)\s*\.insert\(/,
  )

  assert.doesNotMatch(
    source,
    /p_user_id|p_player_name|p_inventory_id/,
  )
})
