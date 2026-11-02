import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../lib/inventory/inventory-quantity.ts', import.meta.url),
  'utf8',
)

const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const {
  formatMicroScuAsScu,
  normalizeInventoryQuantity,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
)

function expectSuccess(input, expected) {
  const result = normalizeInventoryQuantity(input)

  assert.equal(result.ok, true)

  if (!result.ok) {
    assert.fail(`Expected success, received ${result.code}`)
  }

  assert.deepEqual(result.value, expected)
}

function expectFailure(input, code) {
  const result = normalizeInventoryQuantity(input)

  assert.deepEqual(result, {
    ok: false,
    code,
  })
}

test('normalizes every supported volume unit to exact micro SCU', () => {
  expectSuccess(
    {
      rawAmount: '1',
      materialKind: 'volume',
      inputUnit: 'SCU',
    },
    {
      amount: '1',
      amountMicroScu: '1000000',
      inputUnit: 'SCU',
    },
  )

  expectSuccess(
    {
      rawAmount: '1',
      materialKind: 'volume',
      inputUnit: 'cSCU',
    },
    {
      amount: '0.01',
      amountMicroScu: '10000',
      inputUnit: 'cSCU',
    },
  )

  expectSuccess(
    {
      rawAmount: '1',
      materialKind: 'volume',
      inputUnit: 'mSCU',
    },
    {
      amount: '0.001',
      amountMicroScu: '1000',
      inputUnit: 'mSCU',
    },
  )

  expectSuccess(
    {
      rawAmount: '1',
      materialKind: 'volume',
      inputUnit: 'µSCU',
    },
    {
      amount: '0.000001',
      amountMicroScu: '1',
      inputUnit: 'µSCU',
    },
  )
})

test('normalizes equivalent volume inputs to the same canonical value', () => {
  for (const input of [
    { rawAmount: '0.025', inputUnit: 'SCU' },
    { rawAmount: '2.5', inputUnit: 'cSCU' },
    { rawAmount: '25', inputUnit: 'mSCU' },
    { rawAmount: '25000', inputUnit: 'µSCU' },
  ]) {
    expectSuccess(
      {
        ...input,
        materialKind: 'volume',
      },
      {
        amount: '0.025',
        amountMicroScu: '25000',
        inputUnit: input.inputUnit,
      },
    )
  }
})

test('accepts comma decimals without floating point arithmetic', () => {
  expectSuccess(
    {
      rawAmount: '2,5',
      materialKind: 'volume',
      inputUnit: 'cSCU',
    },
    {
      amount: '0.025',
      amountMicroScu: '25000',
      inputUnit: 'cSCU',
    },
  )
})

test('normalizes count values using the production compatibility rule', () => {
  expectSuccess(
    {
      rawAmount: '130',
      materialKind: 'count',
      inputUnit: 'COUNT',
    },
    {
      amount: '130',
      amountMicroScu: '130',
      inputUnit: 'COUNT',
    },
  )

  expectSuccess(
    {
      rawAmount: '00020',
      materialKind: 'count',
      inputUnit: 'COUNT',
    },
    {
      amount: '20',
      amountMicroScu: '20',
      inputUnit: 'COUNT',
    },
  )
})

test('rejects incompatible material and unit combinations', () => {
  expectFailure(
    {
      rawAmount: '1',
      materialKind: 'volume',
      inputUnit: 'COUNT',
    },
    'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND',
  )

  expectFailure(
    {
      rawAmount: '1',
      materialKind: 'count',
      inputUnit: 'SCU',
    },
    'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND',
  )
})

test('rejects values that cannot be represented as whole micro SCU', () => {
  expectFailure(
    {
      rawAmount: '0.0000001',
      materialKind: 'volume',
      inputUnit: 'SCU',
    },
    'AMOUNT_NOT_EXACT_MICRO_SCU',
  )

  expectFailure(
    {
      rawAmount: '1.5',
      materialKind: 'volume',
      inputUnit: 'µSCU',
    },
    'AMOUNT_NOT_EXACT_MICRO_SCU',
  )
})

test('rejects empty, zero, invalid, and fractional count values', () => {
  expectFailure(
    {
      rawAmount: '',
      materialKind: 'count',
      inputUnit: 'COUNT',
    },
    'AMOUNT_REQUIRED',
  )

  expectFailure(
    {
      rawAmount: '0',
      materialKind: 'count',
      inputUnit: 'COUNT',
    },
    'AMOUNT_MUST_BE_POSITIVE',
  )

  expectFailure(
    {
      rawAmount: '1.5',
      materialKind: 'count',
      inputUnit: 'COUNT',
    },
    'AMOUNT_NOT_INTEGER',
  )

  expectFailure(
    {
      rawAmount: '1e3',
      materialKind: 'count',
      inputUnit: 'COUNT',
    },
    'AMOUNT_INVALID_FORMAT',
  )
})

test('rejects values outside the PostgreSQL bigint range', () => {
  expectFailure(
    {
      rawAmount: '9223372036854775808',
      materialKind: 'volume',
      inputUnit: 'µSCU',
    },
    'AMOUNT_OUT_OF_RANGE',
  )

  expectFailure(
    {
      rawAmount: '9223372036854775808',
      materialKind: 'count',
      inputUnit: 'COUNT',
    },
    'AMOUNT_OUT_OF_RANGE',
  )
})

test('formats canonical micro SCU without scientific notation', () => {
  assert.equal(formatMicroScuAsScu(1n), '0.000001')
  assert.equal(formatMicroScuAsScu(1000n), '0.001')
  assert.equal(formatMicroScuAsScu(10000n), '0.01')
  assert.equal(formatMicroScuAsScu(25000n), '0.025')
  assert.equal(formatMicroScuAsScu(1000000n), '1')
  assert.equal(formatMicroScuAsScu(1250000n), '1.25')
})
