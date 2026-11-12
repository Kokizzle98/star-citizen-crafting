import assert from 'node:assert/strict'
import test from 'node:test'
import { loadFabricatorModule } from './fabricator-fixture.mjs'

// Fabricator F2: crew craftability (read-only, exact integer quantities,
// minQuality, dimensions, location spread).

const craft = await loadFabricatorModule('fabricator-craftability')

const material = (name, unit, required, minQuality = 0, vocabulary = 'RESOLVED') => ({
  kind: unit === 'SCU' ? 'RESOURCE' : 'ITEM', name, unit, amount: 0, required, minQuality, vocabulary,
})
const recipe = (...materials) => ({ status: 'RESOLVED', issues: [], craftTimeSeconds: 1, slots: materials.map((m, i) => ({ slotKey: String(i), name: `S${i}`, material: m })) })
let id = 0
const lot = (material, quality, microOrCount, extra = {}) => {
  const count = extra.inputUnit === 'COUNT'
  return Object.freeze({
    id: String(++id), playerName: 'A', material, inputUnit: 'SCU',
    amount: count ? `${microOrCount}.000000` : (Number(microOrCount) / 1e6).toFixed(6), amountMicroScu: String(microOrCount),
    quality, locationId: 'L1', locationName: 'Area18', ...extra,
  })
}
const run = (r, lots) => craft.recipeCraftability(r, craft.indexCrewLots(lots))

test('exact amount, insufficient amount and surplus with exact micro-SCU arithmetic', () => {
  const r = recipe(material('Iron', 'SCU', '1220000'))
  const exact = run(r, [lot('Iron', 500, 1_000_000), lot('Iron', 500, 220_000)]).slots[0]
  assert.deepEqual([exact.status, exact.available, exact.missing, exact.surplus], ['COVERED', 1_220_000n, 0n, 0n])
  const short = run(r, [lot('Iron', 500, 1_219_999)]).slots[0]
  assert.deepEqual([short.status, short.missing], ['INSUFFICIENT', 1n])
  const surplus = run(r, [lot('Iron', 500, 5_000_000)]).slots[0]
  assert.deepEqual([surplus.status, surplus.surplus], ['COVERED', 3_780_000n])
  assert.equal(craft.formatFabricatorQuantity(1_220_000n, 'SCU'), '1,22 SCU')
  assert.equal(craft.formatFabricatorQuantity(2n, 'SCU'), '0,000002 SCU')
  assert.equal(craft.formatFabricatorQuantity(4n, 'COUNT'), '4 Stk.')
})

test('multiple players, lots and locations add up; the location spread is reported', () => {
  const r = recipe(material('Iron', 'SCU', '3000000'))
  const result = run(r, [
    lot('Iron', 600, 1_000_000, { playerName: 'A', locationId: 'L1' }),
    lot('Iron', 700, 1_000_000, { playerName: 'B', locationId: 'L2' }),
    lot('Iron', 800, 1_000_000, { playerName: 'B', locationId: 'L1' }),
  ])
  assert.equal(result.status, 'AVAILABLE')
  assert.deepEqual([result.slots[0].playerCount, result.slots[0].locationCount, result.multiLocation], [2, 2, true])
  const single = run(r, [lot('Iron', 600, 3_000_000)])
  assert.equal(single.multiLocation, false)
})

test('a lot below minQuality stays visible but does not count', () => {
  const r = recipe(material('Riccite', 'SCU', '2000000', 800))
  const slot = run(r, [lot('Riccite', 799, 5_000_000), lot('Riccite', 800, 1_000_000)]).slots[0]
  assert.deepEqual(slot.lots.map(u => [u.lot.quality, u.usable, u.reason]), [[799, false, 'BELOW_MIN_QUALITY'], [800, true, null]])
  assert.deepEqual([slot.status, slot.available, slot.missing], ['INSUFFICIENT', 1_000_000n, 1_000_000n])
})

test('dimensions are never mixed; COUNT lots must be consistent', () => {
  const items = recipe(material('Gem', 'COUNT', '4'))
  assert.equal(run(items, [lot('Gem', 0, 6, { inputUnit: 'COUNT' })]).slots[0].available, 6n)
  assert.equal(run(items, [lot('Gem', 0, 6_000_000)]).slots[0].lots[0].reason, 'DIMENSION_MISMATCH')
  assert.equal(run(items, [lot('Gem', 0, 6, { inputUnit: 'COUNT', amount: '5.000000' })]).slots[0].lots[0].reason, 'QUANTITY_INVALID')
  const volume = recipe(material('Iron', 'SCU', '1'))
  assert.equal(run(volume, [lot('Iron', 0, 5, { inputUnit: 'COUNT' })]).slots[0].lots[0].reason, 'DIMENSION_MISMATCH')
  assert.equal(run(volume, [lot('Iron', 0, 5, { inputUnit: null })]).slots[0].lots[0].reason, 'DIMENSION_MISMATCH')
  assert.equal(run(volume, [lot('Iron', 0, 5, { inputUnit: 'µSCU' })]).slots[0].status, 'COVERED')
  assert.equal(run(volume, [lot('iron', 0, 5)]).slots[0].lots.length, 0, 'exact name only, no case folding')
})

test('AVAILABLE, PARTIAL and UNAVAILABLE', () => {
  const r = recipe(material('Iron', 'SCU', '1000000'), material('Gem', 'COUNT', '2'))
  assert.equal(run(r, [lot('Iron', 1, 1_000_000), lot('Gem', 1, 2, { inputUnit: 'COUNT' })]).status, 'AVAILABLE')
  assert.equal(run(r, [lot('Iron', 1, 1_000_000), lot('Gem', 1, 1, { inputUnit: 'COUNT' })]).status, 'PARTIAL')
  assert.equal(run(r, [lot('Iron', 1, 999_999), lot('Gem', 1, 1, { inputUnit: 'COUNT' })]).status, 'UNAVAILABLE')
  assert.equal(run(r, []).status, 'UNAVAILABLE')
})

test('unresolved material or recipe is never AVAILABLE', () => {
  const unresolved = recipe(material('Mystery', 'SCU', '1', 0, 'UNRESOLVED'))
  const result = run(unresolved, [lot('Mystery', 1, 10)])
  assert.equal(result.status, 'UNRESOLVED')
  assert.equal(result.slots[0].status, 'UNRESOLVED')
  assert.equal(run({ status: 'REVIEW_REQUIRED', issues: ['RECIPE_EMPTY'], craftTimeSeconds: null, slots: [] }, []).status, 'UNRESOLVED')
  const reviewed = { ...recipe(material('Iron', 'SCU', '1')), status: 'REVIEW_REQUIRED', issues: ['RECIPE_MATERIAL_UNRESOLVED'] }
  assert.equal(run(reviewed, [lot('Iron', 1, 5)]).status, 'UNRESOLVED')
})

test('family list status is the best option; no mutation of the lots', () => {
  assert.equal(craft.bestCraftability(['UNAVAILABLE', 'PARTIAL', 'UNRESOLVED']), 'PARTIAL')
  assert.equal(craft.bestCraftability(['UNRESOLVED']), 'UNRESOLVED')
  assert.equal(craft.bestCraftability([]), 'UNRESOLVED')
  const lots = [lot('Iron', 1, 5), lot('Iron', 2, 5)]
  const snapshot = JSON.stringify(lots)
  run(recipe(material('Iron', 'SCU', '1')), lots)
  assert.equal(JSON.stringify(lots), snapshot)
})

test('F3: shared stock of one material over several slots is allocated once (F2 duplicate-material fix)', () => {
  const r = recipe(material('X', 'SCU', '1000000'), material('X', 'SCU', '1000000'))
  const result = run(r, [lot('X', 700, 1_500_000)])
  assert.equal(result.status, 'PARTIAL')
  assert.deepEqual(result.slots.map(s => [s.status, s.available, s.missing, s.surplus]),
    [['COVERED', 1_000_000n, 0n, 0n], ['INSUFFICIENT', 500_000n, 500_000n, 0n]])
  assert.deepEqual(result.slots.map(s => s.sharedWith), [['1'], ['0']])
  assert.deepEqual(result.slots.map(s => s.quality), [null, null], 'no quality while the material group is not covered')
  const enough = run(r, [lot('X', 900, 1_000_000), lot('X', 600, 1_500_000)])
  assert.equal(enough.status, 'AVAILABLE')
  assert.deepEqual(enough.slots.map(s => [s.available, s.surplus, s.quality]), [[1_000_000n, 0n, 750], [1_500_000n, 500_000n, 750]])
})

test('F3: covered slots carry the best reachable weighted input quality (OQ-F3-1)', () => {
  const r = recipe(material('Tungsten', 'SCU', '1000000'), material('Gem', 'COUNT', '2', 500))
  const result = run(r, [
    lot('Tungsten', 600, 400_000, { playerName: 'B', locationId: 'L2' }),
    lot('Tungsten', 900, 800_000),
    lot('Gem', 400, 5, { inputUnit: 'COUNT' }),
    lot('Gem', 800, 1, { inputUnit: 'COUNT' }),
    lot('Gem', 700, 1, { inputUnit: 'COUNT' }),
  ])
  assert.deepEqual(result.slots.map(s => s.quality), [840, 750])
  assert.deepEqual(result.slots[0].selection.map(p => [p.quantity, p.quality]), [[800_000n, 900], [200_000n, 600]])
  assert.equal(result.slots[1].lots.find(u => u.lot.quality === 400).reason, 'BELOW_MIN_QUALITY')
  const invalid = run(recipe(material('Iron', 'SCU', '1')), [lot('Iron', 500.5, 5)]).slots[0]
  assert.deepEqual([invalid.status, invalid.lots[0].reason], ['NONE', 'QUALITY_INVALID'])
})
