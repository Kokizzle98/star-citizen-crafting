import assert from 'node:assert/strict'
import test from 'node:test'
import { loadFabricatorModule } from './fabricator-fixture.mjs'

// F3: inventory-aware available preset (D-F3-1) and MANUAL input contract.

const craft = await loadFabricatorModule('fabricator-craftability')
const preset = await loadFabricatorModule('fabricator-preset')

const material = (name, unit, required, minQuality = 0) => ({
  kind: unit === 'SCU' ? 'RESOURCE' : 'ITEM', name, unit, amount: 0, required, minQuality, vocabulary: 'RESOLVED',
})
const recipe = (...materials) => ({ status: 'RESOLVED', issues: [], craftTimeSeconds: 1, slots: materials.map((m, i) => ({ slotKey: String(i), name: `S${i}`, material: m })) })
let id = 0
const lot = (material, quality, micro, extra = {}) => ({
  id: String(++id), playerName: 'A', material, inputUnit: 'SCU', amount: (micro / 1e6).toFixed(6), amountMicroScu: String(micro),
  quality, locationId: 'L1', locationName: 'Area18', ...extra,
})
const presetFor = (r, lots) => preset.availablePreset(craft.recipeCraftability(r, craft.indexCrewLots(lots)))

test('D-F3-1: the global preset is the lowest per-slot available quality; slot values stay visible', () => {
  const r = recipe(material('A', 'SCU', '1000000'), material('B', 'SCU', '1000000'), material('C', 'SCU', '1000000'))
  const result = presetFor(r, [lot('A', 920, 2_000_000), lot('B', 900, 800_000), lot('B', 600, 200_000), lot('C', 875, 1_000_000)])
  assert.deepEqual(result, { status: 'AVAILABLE', quality: 840, slotQualities: { 0: 920, 1: 840, 2: 875 } })
  assert.equal(preset.initialManualQuality(result), 840)
})

test('a small high-quality amount and an insufficient amount produce no inflated preset', () => {
  const r = recipe(material('A', 'SCU', '1000000'))
  assert.deepEqual(presetFor(r, [lot('A', 1000, 10_000)]), { status: 'NONE', reason: 'NOT_COVERED' })
  assert.equal(presetFor(r, [lot('A', 1000, 10_000), lot('A', 500, 990_000)]).quality, 505)
  assert.equal(presetFor(r, [lot('A', 700, 1_000_000), lot('A', 300, 4_000_000)]).quality, 700, 'surplus does not dilute')
})

test('minQuality excludes lots; several crew members and lots combine', () => {
  const r = recipe(material('A', 'SCU', '2000000', 800))
  const result = presetFor(r, [lot('A', 1000, 1_000_000, { playerName: 'B' }), lot('A', 799, 9_000_000), lot('A', 800, 1_000_000)])
  assert.equal(result.quality, 900)
})

test('no crew inventory, unresolved recipe and no preset fall back to the neutral default', () => {
  const none = preset.availablePreset(null)
  assert.deepEqual(none, { status: 'NONE', reason: 'NO_CREW_INVENTORY' })
  assert.equal(preset.initialManualQuality(none), preset.DEFAULT_MANUAL_QUALITY)
  assert.equal(preset.DEFAULT_MANUAL_QUALITY, 500)
  const empty = { status: 'REVIEW_REQUIRED', issues: ['RECIPE_EMPTY'], craftTimeSeconds: null, slots: [] }
  assert.equal(presetFor(empty, []).reason, 'UNRESOLVED')
})

test('MANUAL input: integer Q0–1000, clamp, never NaN / Infinity / blank', () => {
  const c = preset.clampManualQuality
  for (const [input, expected] of [[0, 0], [1, 1], [499, 499], [500, 500], [501, 501], [999, 999], [1000, 1000],
    [-5, 0], [1001, 1000], ['750', 750], ['12.6', 13], ['', 321], ['  ', 321], ['abc', 321], [Number.NaN, 321],
    [Infinity, 321], [-Infinity, 321], [null, 321], [undefined, 321]]) {
    assert.equal(c(input, 321), expected, `input ${String(input)}`)
  }
})

test('MANUAL keyboard: arrows ±1, PageUp/PageDown ±10, Home/End, clamped', () => {
  const k = preset.manualQualityKeyStep
  assert.deepEqual(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End'].map(key => k(key, 500)),
    [501, 501, 499, 499, 510, 490, 0, 1000])
  assert.deepEqual([k('ArrowUp', 1000), k('PageDown', 5), k('PageUp', 995), k('Tab', 500)], [1000, 0, 1000, null])
})
