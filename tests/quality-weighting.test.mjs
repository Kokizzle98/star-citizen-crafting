import assert from 'node:assert/strict'
import test from 'node:test'
import { loadLibModule } from './fabricator-fixture.mjs'

// F3 quality primitives: quantity weighting (INVENTORY_UX_V1 §5), best
// reachable selection over the used quantities (owner domain evidence
// OQ-F3-1) and round-down (D-F3-1).

const q = await loadLibModule('lib/quality/quality-weighting')
const scu = value => BigInt(Math.round(value * 1_000_000))
const part = (ref, quantity, quality) => ({ ref, quantity, quality })

test('summary is quantity-weighted, not the plain mean of the qualities', () => {
  const summary = q.summarizeQuality([part('a', scu(0.8), 900), part('b', scu(0.4), 600)])
  assert.equal(summary.quantity, scu(1.2))
  assert.equal(summary.weightedQuality, 800) // (0.8*900 + 0.4*600) / 1.2
  assert.notEqual(summary.weightedQuality, 750)
  assert.deepEqual([summary.minQuality, summary.maxQuality, summary.partCount], [600, 900, 2])
})

test('equal quantities give the plain mean; COUNT uses pieces; empty has no quality', () => {
  assert.equal(q.summarizeQuality([part('a', 5n, 700), part('b', 5n, 900)]).weightedQuality, 800)
  assert.equal(q.summarizeQuality([part('a', 3n, 1000), part('b', 1n, 0)]).weightedQuality, 750)
  const empty = q.summarizeQuality([])
  assert.deepEqual([empty.quantity, empty.weightedQuality, empty.minQuality], [0n, null, null])
})

test('rounding is always down (never promises more than reachable)', () => {
  assert.equal(q.summarizeQuality([part('a', 2n, 1000), part('b', 1n, 999)]).weightedQuality, 999) // 999.67
  assert.equal(q.summarizeQuality([part('a', 1n, 1), part('b', 2n, 0)]).weightedQuality, 0)
})

test('OQ-F3-1 owner example: 1.0 SCU from 0.8 SCU Q900 + 0.2 of a 0.4 SCU Q600 lot = Q840', () => {
  const selection = q.selectBestQuality(scu(1.0), [part('low', scu(0.4), 600), part('high', scu(0.8), 900)])
  assert.equal(selection.status, 'COVERED')
  assert.equal(selection.quality, 840)
  assert.deepEqual(selection.used.map(u => [u.ref, u.quantity, u.quality]), [['high', scu(0.8), 900], ['low', scu(0.2), 600]])
  assert.equal(selection.available, scu(1.2))
})

test('exact amount, surplus and multiple lots: highest qualities first', () => {
  const exact = q.selectBestQuality(scu(1.2), [part('a', scu(0.8), 900), part('b', scu(0.4), 600)])
  assert.deepEqual([exact.status, exact.quality], ['COVERED', 800])
  const surplus = q.selectBestQuality(scu(1.0), [part('a', scu(5), 700), part('b', scu(0.5), 950), part('c', scu(3), 300)])
  assert.equal(surplus.quality, 825) // 0.5*950 + 0.5*700
  assert.deepEqual(surplus.used.map(u => u.ref), ['b', 'a'])
})

test('a small high-quality amount never raises the result when it cannot cover the requirement', () => {
  const selection = q.selectBestQuality(scu(1.0), [part('tiny', scu(0.01), 1000), part('bulk', scu(2), 500)])
  assert.equal(selection.quality, 505) // 0.01*1000 + 0.99*500
  assert.ok(selection.quality < 1000)
  const insufficient = q.selectBestQuality(scu(1.0), [part('tiny', scu(0.5), 1000)])
  assert.deepEqual([insufficient.status, insufficient.quality], ['INSUFFICIENT', null])
  assert.deepEqual(q.selectBestQuality(scu(1.0), []).status, 'NONE')
})

test('COUNT selection uses whole pieces; ties are deterministic; input is not mutated', () => {
  const parts = Object.freeze([part('a', 2n, 800), part('b', 3n, 800), part('c', 1n, 900)])
  const selection = q.selectBestQuality(4n, parts)
  assert.deepEqual(selection.used.map(u => [u.ref, u.quantity]), [['c', 1n], ['b', 3n]])
  assert.equal(selection.quality, 825)
  assert.equal(parts.length, 3)
})

test('invalid input fails closed', () => {
  assert.throws(() => q.selectBestQuality(0n, []), /QUALITY_QUANTITY_INVALID/)
  assert.throws(() => q.selectBestQuality(1n, [part('a', 1n, 1001)]), /QUALITY_QUALITY_INVALID/)
  assert.throws(() => q.summarizeQuality([part('a', 1n, 1.5)]), /QUALITY_QUALITY_INVALID/)
  assert.throws(() => q.summarizeQuality([part('a', 0n, 5)]), /QUALITY_QUANTITY_INVALID/)
})
