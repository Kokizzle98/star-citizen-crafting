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
