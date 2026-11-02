import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../lib/inventory/inventory-display.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { formatQuantity, sumDecimals } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)

test('aggregates count quantities exactly and never labels unknown units', () => {
  const rows = [{ amount: '12345678901234567890.123456', amount_micro_scu: '1' }, { amount: '0.000001', amount_micro_scu: '2' }]
  assert.equal(sumDecimals(rows.map((row) => row.amount)), '12345678901234567890.123457')
  assert.equal(formatQuantity(rows, 'count', 'AUTO'), '12345678901234567890.123457 Stück')
  assert.equal(formatQuantity(rows, undefined, 'AUTO'), 'Einheit unbekannt')
})

test('formats volume using exact micro SCU without losing precision', () => {
  const rows = [{ amount_micro_scu: '9223372036854775807' }, { amount_micro_scu: '2' }]
  assert.equal(formatQuantity(rows, 'volume', 'AUTO'), '9223372036854.775809 SCU')
  assert.equal(formatQuantity(rows, 'volume', 'µSCU'), '9223372036854775809 µSCU')
})

test('formats volume in every explicit global unit mode', () => {
  const rows = [
    {
      amount: '0.025',
      amount_micro_scu: '25000',
    },
  ]

  assert.equal(
    formatQuantity(rows, 'volume', 'SCU'),
    '0.025 SCU',
  )

  assert.equal(
    formatQuantity(rows, 'volume', 'cSCU'),
    '2.5 cSCU',
  )

  assert.equal(
    formatQuantity(rows, 'volume', 'mSCU'),
    '25 mSCU',
  )

  assert.equal(
    formatQuantity(rows, 'volume', 'µSCU'),
    '25000 µSCU',
  )
})

test('AUTO chooses a readable volume unit deterministically', () => {
  assert.equal(
    formatQuantity(
      [{ amount: '2', amount_micro_scu: '2000000' }],
      'volume',
      'AUTO',
    ),
    '2 SCU',
  )

  assert.equal(
    formatQuantity(
      [{ amount: '0.025', amount_micro_scu: '25000' }],
      'volume',
      'AUTO',
    ),
    '2.5 cSCU',
  )

  assert.equal(
    formatQuantity(
      [{ amount: '0.005', amount_micro_scu: '5000' }],
      'volume',
      'AUTO',
    ),
    '5 mSCU',
  )

  assert.equal(
    formatQuantity(
      [{ amount: '0.0005', amount_micro_scu: '500' }],
      'volume',
      'AUTO',
    ),
    '500 µSCU',
  )
})

test('COUNT remains Stück in every global unit mode', () => {
  const rows = [
    {
      amount: '130',
      amount_micro_scu: '130',
    },
  ]

  for (const mode of [
    'AUTO',
    'SCU',
    'cSCU',
    'mSCU',
    'µSCU',
  ]) {
    assert.equal(
      formatQuantity(rows, 'count', mode),
      '130 Stück',
    )
  }
})
