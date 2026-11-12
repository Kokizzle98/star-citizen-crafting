import assert from 'node:assert/strict'
import test from 'node:test'
import { loadFabricatorModule, loadLive } from './fabricator-fixture.mjs'

// Fabricator F3: product stats per concrete item from the real LIVE mirror and
// the unchanged engine (VECTOR_CRAFT_CALC_V1). Expected values are derived from
// the mirror's segments and the SCMDB-reconciled semantics.

const live = await loadLive()
const catalogModule = await loadFabricatorModule('fabricator-catalog')
const stats = await loadFabricatorModule('fabricator-stats')
const catalog = catalogModule.buildFabricatorCatalog({ source: live.source, hierarchy: live.hierarchy })

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const blueprintByTag = tag => catalog.blueprints.find(b => b.tag === tag)
function statsAt(tag, quality, overrides) {
  const blueprint = blueprintByTag(tag)
  const recipe = catalog.recipes[blueprint.recipe]
  return Object.fromEntries(stats.fabricatorStats(recipe, catalogModule.blueprintBaselines(catalog, blueprint),
    stats.slotQualities(recipe, quality, overrides), catalog.properties).map(row => [row.propertyKey, row]))
}

const JS400 = 'BP_CRAFT_POWR_AMRS_S02_JS400_SCItem'

test('JS-400 at Q0, Q500, Q501, Q750 and Q1000 (segment boundaries 500/501, additive pips)', () => {
  const expected = {
    0: [980 * 0.8, 17], 500: [980, 21], 501: [980, 21], 750: [980 * (1 + ((750 - 501) / 499) * 0.2), 23], 1000: [980 * 1.2, 25],
  }
  for (const [quality, [integrity, power]] of Object.entries(expected)) {
    const row = statsAt(JS400, Number(quality))
    close(row.health_maxhealth.craftedValue, integrity)
    assert.equal(row.itemresource_powergeneration.craftedValue, power)
    assert.deepEqual([row.health_maxhealth.status, row.itemresource_powergeneration.status], ['RESOLVED', 'RESOLVED'])
    assert.equal(row.health_maxhealth.baseValue, 980)
    assert.equal(row.itemresource_powergeneration.baseValue, 21)
  }
  const q750 = statsAt(JS400, 750)
  assert.equal(q750.health_maxhealth.craftedValue.toFixed(2), '1077.80')
  assert.equal(q750.health_maxhealth.percentDelta.toFixed(2), '9.98', 'no historical 10.00 % interpolation')
  assert.equal(q750.itemresource_powergeneration.percentDelta.toFixed(2), '9.52')
  close(q750.health_maxhealth.absoluteDelta, q750.health_maxhealth.craftedValue - 980)
  assert.equal(q750.itemresource_powergeneration.absoluteDelta, 2)
  assert.deepEqual(q750.itemresource_powergeneration.slotKeys, ['1', '2'])
  assert.equal(q750.itemresource_powergeneration.operation, 'ADDITIVE')
  assert.equal(q750.health_maxhealth.operation, 'MULTIPLICATIVE')
})

test('material -> stat relation comes only from the slot modifiers', () => {
  const recipe = catalog.recipes[blueprintByTag(JS400).recipe]
  assert.deepEqual(stats.affectedProperties(recipe), {
    0: ['health_maxhealth'], 1: ['itemresource_powergeneration'], 2: ['itemresource_powergeneration'],
  })
  assert.deepEqual(recipe.slots.map(s => s.material.name), ['Stileron', 'Beryl', 'Savrilium'])
})

test('per-slot qualities are structurally possible (D2 NEXT) without a per-slot UI', () => {
  const row = statsAt(JS400, 750, { 1: 100 })
  assert.equal(row.itemresource_powergeneration.craftedValue, 21 - 2 + 1)
  assert.deepEqual(stats.slotQualities({ slots: [{ slotKey: 'a' }, { slotKey: 'b' }] }, 600, { b: 900 }), { a: 600, b: 900 })
})

test('multiplicative effects of several slots combine as 1 + sum(m - 1) (engine and SCMDB)', () => {
  const blueprint = catalog.blueprints.find(b => {
    const recipe = catalog.recipes[b.recipe]
    return recipe.slots.filter(s => s.modifiers.some(m => m.propertyKey === 'shield_maxhealth')).length > 1
  })
  const recipe = catalog.recipes[blueprint.recipe]
  const row = statsAt(blueprint.tag, 900).shield_maxhealth
  const deltas = recipe.slots.flatMap(s => s.modifiers.filter(m => m.propertyKey === 'shield_maxhealth').map(m => {
    const [start, end, a, b] = m.segments.find(([s0, e0]) => 900 >= s0 && 900 <= e0)
    return a + ((900 - start) / (end - start)) * (b - a) - 1
  }))
  assert.equal(row.status, 'RESOLVED')
  close(row.craftedValue, row.baseValue * (1 + deltas.reduce((x, y) => x + y, 0)), 1e-6)
})

test('quantum speed regressions stay intact (Agni, TS-2) and display in SCMDB Mm/s', () => {
  const agni = statsAt('BP_CRAFT_QDRV_JUST_S03_Agni_SCItem', 750).quantum_speed
  assert.equal(agni.baseValue, 585715600)
  assert.equal(stats.formatStatValue(agni, agni.baseValue), '585,72 Mm/s')
  assert.equal(stats.formatStatValue(agni, agni.craftedValue), '644,17 Mm/s')
  assert.equal(agni.percentDelta.toFixed(2), '9.98')
  const ts2 = statsAt('BP_CRAFT_QDRV_WETK_S03_TS2_SCItem', 750).quantum_speed
  assert.equal(stats.formatStatValue(ts2, ts2.craftedValue), '560,59 Mm/s')
  const fuel = statsAt('BP_CRAFT_QDRV_JUST_S03_Agni_SCItem', 750).quantum_fuelrequirement
  assert.deepEqual([fuel.status, fuel.reason, fuel.baseValue, fuel.craftedValue], ['REVIEW_REQUIRED', 'UNIT_UNVERIFIED', null, null])
})

test('armor temperatures reconciled with SCMDB: TrueDef-Pro Arms -75 -> -82.5 °C (-10.00 %), 75 -> 82.5 °C', () => {
  const row = statsAt('BP_CRAFT_vgl_armor_light_arms_01_01_10', 750)
  assert.deepEqual([row.armor_temperaturemin.status, row.armor_temperaturemin.baseValue], ['RESOLVED', -75])
  close(row.armor_temperaturemin.craftedValue, -82.5)
  assert.equal(row.armor_temperaturemin.percentDelta.toFixed(2), '-10.00')
  close(row.armor_temperaturemin.absoluteDelta, -7.5)
  close(row.armor_temperaturemax.craftedValue, 82.5)
  assert.equal(row.armor_temperaturemax.percentDelta.toFixed(2), '10.00')
  assert.equal(stats.formatStatValue(row.armor_temperaturemin, row.armor_temperaturemin.craftedValue), '-82,50 ºC')
  assert.equal(stats.formatStatValue(row.armor_temperaturemax, row.armor_temperaturemax.absoluteDelta, 'delta'), '+7,50 ºC')
})

test('D4: damage mitigation stays REVIEW_REQUIRED with only the exact relative effect, no absolute value', () => {
  const row = statsAt('BP_CRAFT_vgl_armor_light_arms_01_01_10', 750).armor_damagemitigation
  assert.deepEqual([row.status, row.reason, row.baseValue, row.craftedValue, row.absoluteDelta, row.percentDelta],
    ['REVIEW_REQUIRED', 'MULTI_CHANNEL_SOURCE', null, null, null, null])
  assert.equal(row.relativeEffectPercent.toFixed(2), '7.50', 'SCMDB shows x1.075 / +7.50 % at Q750')
})

test('a quality outside every source segment is unavailable, never a neutral fallback', () => {
  const blueprint = catalog.blueprints.find(b => catalog.recipes[b.recipe].slots.some(s =>
    s.modifiers.some(m => m.propertyKey === 'armor_temperaturemax' && m.segments[0][0] === 500)))
  const low = statsAt(blueprint.tag, 499).armor_temperaturemax
  assert.deepEqual([low.status, low.reason, low.craftedValue, low.relativeEffectPercent], ['REVIEW_REQUIRED', 'QUALITY_OUTSIDE_SEGMENT', null, null])
  const covered = statsAt(blueprint.tag, 500).armor_temperaturemax
  assert.equal(covered.status, 'RESOLVED')
  close(covered.craftedValue, covered.baseValue)
})

test('missing baseline, base zero and unresolved stay honest (synthetic recipes)', () => {
  const recipe = {
    status: 'RESOLVED', issues: [], craftTimeSeconds: 1,
    slots: [{ slotKey: '0', name: 'S', material: {}, modifiers: [
      { propertyKey: 'a', operation: 'MULTIPLICATIVE', segments: [[0, 1000, 0.9, 1.1]] },
      { propertyKey: 'b', operation: 'MULTIPLICATIVE', segments: [[0, 1000, 0.9, 1.1]] },
      { propertyKey: 'c', operation: 'ADDITIVE', segments: [[0, 1000, 0, 2]] },
      { propertyKey: 'd', operation: 'ADDITIVE', segments: [[0, 1000, 1, 1]] },
    ] }],
  }
  const baselines = {
    a: { status: 'RESOLVED', value: 0 }, b: { status: 'SOURCE_DATA_MISSING', reason: 'FIELD_MISSING' },
    c: { status: 'RESOLVED', value: 5 },
  }
  const rows = Object.fromEntries(stats.fabricatorStats(recipe, baselines, { 0: 1000 }, {}).map(r => [r.propertyKey, r]))
  assert.deepEqual([rows.a.status, rows.a.craftedValue, rows.a.percentDelta], ['RESOLVED', 0, null], 'base 0: no percent')
  assert.equal(stats.formatPercent(rows.a.percentDelta), '—')
  assert.deepEqual([rows.b.status, rows.b.baseValue, rows.b.craftedValue], ['SOURCE_DATA_MISSING', null, null])
  close(rows.b.relativeEffectPercent, 10)
  assert.deepEqual([rows.c.status, rows.c.reason], ['REVIEW_REQUIRED', 'ADDITIVE_SHAPE_UNVERIFIED'])
  assert.deepEqual([rows.d.status, rows.d.reason, rows.d.relativeEffectPercent], ['UNRESOLVED', 'PROPERTY_UNKNOWN', null])
  assert.deepEqual(stats.fabricatorStats({ ...recipe, status: 'REVIEW_REQUIRED' }, baselines, { 0: 1 }, {}), [])
})

test('functionally different variants keep their own concrete values (no family calculation)', () => {
  const different = catalog.families.flatMap(f => f.variants.flatMap(v => v.components))
    .filter(c => c.functional === 'FUNCTIONALLY_DIFFERENT')
  assert.ok(different.length > 0)
  let distinct = 0
  for (const component of different.slice(0, 40)) {
    const bp = catalog.blueprints[component.blueprints[0]]
    const own = stats.fabricatorStats(catalog.recipes[bp.recipe], catalogModule.blueprintBaselines(catalog, bp),
      stats.slotQualities(catalog.recipes[bp.recipe], 750), catalog.properties)
    for (const row of own) if (row.status === 'RESOLVED') assert.equal(row.baseValue, catalogModule.blueprintBaselines(catalog, bp)[row.propertyKey].value)
    distinct += own.length > 0 ? 1 : 0
  }
  assert.ok(distinct > 0)
})

test('printf unit formats from SCMDB; no unit is invented', () => {
  assert.deepEqual(stats.parseUnitFormat('%.2f M'), { signed: false, decimals: 2, suffix: ' M' })
  assert.deepEqual(stats.parseUnitFormat('%+.2f %%'), { signed: true, decimals: 2, suffix: ' %' })
  assert.equal(stats.parseUnitFormat('Rating'), null)
  assert.equal(stats.parseUnitFormat(null), null)
  assert.equal(stats.formatStatValue({ unitFormat: null, sourceUnit: null }, 1077.8), '1.077,8')
  assert.equal(stats.formatStatValue({ unitFormat: 'Rating', sourceUnit: null }, 3), '3')
  assert.equal(stats.formatStatValue({ unitFormat: '%.2f M', sourceUnit: null }, 1500), '1.500,00 M')
  assert.equal(stats.formatStatValue({ unitFormat: null, sourceUnit: null }, 2, 'delta'), '+2')
  assert.equal(stats.formatPercent(9.979), '+9,98 %')
  assert.equal(stats.formatPercent(-10), '-10,00 %')
})
