import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCraft } from '../src/calculation/craft-calculation-engine.js'
import { loadFabricatorModule, loadLive } from './fabricator-fixture.mjs'

// Fabricator F1: regression against SCMDB's own semantics (owner decision
// 2026-11-11: SCMDB is the preferred source semantic reference for
// SCMDB-derived data). Expected values were read on scmdb.net for the same
// LIVE build 4.10.2-live.12913470 (Fabricator, default quality Q750) and match
// the conversion table in the shipped scmdb.net code.

const live = await loadLive()
const units = await loadFabricatorModule('fabricator-units')
const baseline = await loadFabricatorModule('fabricator-baseline')
const adapter = await loadFabricatorModule('fabricator-modifier-adapter')
const { source } = live

const display = (valueMs, unit) => {
  const { value, decimals } = units.speedFromMetresPerSecond(valueMs, unit)
  return `${value.toFixed(decimals)} ${unit}`
}

function quantumSpeed(tag, quality) {
  const blueprint = live.byTag.get(tag)
  const item = source.items.get(blueprint.productEntityClass)
  const base = baseline.resolveFabricatorBaseline('quantum_speed', item, source.properties)
  assert.equal(base.status, 'RESOLVED')
  assert.equal(base.sourceUnit, 'm/s')
  const recipe = blueprint.recipe.recipe
  const result = calculateCraft({
    baselines: { quantum_speed: { status: 'RESOLVED', value: base.value } },
    modifiers: adapter.toCraftCalculationModifiers(recipe).filter(m => m.propertyKey === 'quantum_speed'),
    qualities: adapter.toCraftCalculationQualities(recipe, { globalQuality: quality }),
  })
  return result.stats.find(s => s.propertyKey === 'quantum_speed')
}

test('SCMDB unit table for quantum speed (raw m/s)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(units.SCMDB_SPEED_UNITS)), {
    'm/s': { factor: 1, decimals: 0 }, 'km/s': { factor: 1000, decimals: 1 },
    'Mm/s': { factor: 1000000, decimals: 2 }, 'Gm/s': { factor: 1000000000, decimals: 3 },
  })
  assert.equal(units.DEFAULT_SPEED_UNIT, 'Mm/s')
  assert.throws(() => units.speedFromMetresPerSecond(Number.NaN), /FABRICATOR_UNIT_INVALID/)
  assert.throws(() => units.speedFromMetresPerSecond(1, 'ly/s'), /FABRICATOR_UNIT_INVALID/)
})

test('Agni: raw -> SCMDB display, base and crafted at Q750', () => {
  const stat = quantumSpeed('BP_CRAFT_QDRV_JUST_S03_Agni_SCItem', 750)
  assert.equal(stat.baseValue, 585715600)
  assert.equal(display(stat.baseValue, 'm/s'), '585715600 m/s')
  assert.equal(display(stat.baseValue, 'km/s'), '585715.6 km/s')
  assert.equal(display(stat.baseValue, 'Mm/s'), '585.72 Mm/s')
  assert.equal(display(stat.craftedValue, 'm/s'), '644169782 m/s')
  assert.equal(display(stat.craftedValue, 'km/s'), '644169.8 km/s')
  assert.equal(display(stat.craftedValue, 'Mm/s'), '644.17 Mm/s')
  assert.equal(stat.percentDelta.toFixed(2), '9.98')
})

test('TS-2: raw -> SCMDB display, base and crafted at Q750', () => {
  const stat = quantumSpeed('BP_CRAFT_QDRV_WETK_S03_TS2_SCItem', 750)
  assert.equal(stat.baseValue, 509717800)
  assert.equal(display(stat.baseValue, 'Mm/s'), '509.72 Mm/s')
  assert.equal(display(stat.craftedValue, 'Mm/s'), '560.59 Mm/s')
})

test('Agni integrity matches the SCMDB crafted view (1600 -> 1760 HP, +9.98 % at Q750)', () => {
  const blueprint = live.byTag.get('BP_CRAFT_QDRV_JUST_S03_Agni_SCItem')
  const item = source.items.get(blueprint.productEntityClass)
  const recipe = blueprint.recipe.recipe
  const result = calculateCraft({
    baselines: { health_maxhealth: { status: 'RESOLVED', value: baseline.resolveFabricatorBaseline('health_maxhealth', item, source.properties).value } },
    modifiers: adapter.toCraftCalculationModifiers(recipe).filter(m => m.propertyKey === 'health_maxhealth'),
    qualities: adapter.toCraftCalculationQualities(recipe, { globalQuality: 750 }),
  })
  const integrity = result.stats[0]
  assert.equal(integrity.baseValue, 1600)
  assert.equal(integrity.craftedValue.toFixed(0), '1760')
  assert.equal(integrity.percentDelta.toFixed(2), '9.98')
})
