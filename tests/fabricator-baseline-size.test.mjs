import assert from 'node:assert/strict'
import test from 'node:test'
import { loadFabricatorModule, loadLive } from './fabricator-fixture.mjs'

// Fabricator F1: evidence-based baseline allowlist and component size.

const live = await loadLive()
const baseline = await loadFabricatorModule('fabricator-baseline')
const size = await loadFabricatorModule('fabricator-size')
const { source } = live

const tally = rows => rows.reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {})

test('baseline statuses over every LIVE blueprint x modified stat', () => {
  const results = source.blueprints.flatMap(bp => {
    const item = source.items.get(bp.productEntityClass) ?? null
    const keys = new Set(bp.recipe.recipe.slots.flatMap(s => s.modifiers.map(m => m.propertyKey)))
    return [...keys].map(key => baseline.resolveFabricatorBaseline(key, item, source.properties))
  })
  assert.deepEqual(tally(results.map(r => r.status)), {
    REVIEW_REQUIRED: 3675, RESOLVED: 806, SOURCE_DATA_MISSING: 97, UNRESOLVED: 2,
  })
  for (const r of results) {
    assert.equal(r.value === null, r.status !== 'RESOLVED', 'only RESOLVED carries a value')
    if (r.status === 'RESOLVED') assert.ok(Number.isFinite(r.value))
  }
  const resolvedKeys = new Set(results.filter(r => r.status === 'RESOLVED').map(r => r.propertyKey))
  assert.deepEqual([...resolvedKeys].sort(), Object.keys(baseline.FABRICATOR_BASELINE_RULES).sort())
})

test('allowlist and review list are disjoint and together cover every SCMDB property', () => {
  const rules = Object.keys(baseline.FABRICATOR_BASELINE_RULES)
  const review = Object.keys(baseline.FABRICATOR_BASELINE_REVIEW)
  assert.equal(rules.filter(key => review.includes(key)).length, 0)
  assert.deepEqual([...rules, ...review].sort(), [...source.properties.keys()].sort())
})

test('representative statuses and reasons', () => {
  const at = (tag, key) => baseline.resolveFabricatorBaseline(key,
    source.items.get(live.byTag.get(tag).productEntityClass) ?? null, source.properties)
  const js400 = at('BP_CRAFT_POWR_AMRS_S02_JS400_SCItem', 'health_maxhealth')
  assert.deepEqual({ ...js400 }, { propertyKey: 'health_maxhealth', status: 'RESOLVED', value: 980, sourcePath: 'health',
    unitFormat: null, unitConversion: 'IDENTITY', reason: null })
  const defiance = 'BP_CRAFT_slaver_armor_heavy_core_01_01_01'
  assert.equal(at(defiance, 'armor_temperaturemin').status, 'REVIEW_REQUIRED')
  assert.equal(at(defiance, 'armor_temperaturemin').reason, 'SIGNED_VALUE_MULTIPLIER_SEMANTICS_UNVERIFIED')
  assert.equal(at(defiance, 'armor_damagemitigation').reason, 'MULTI_CHANNEL_SOURCE')
  assert.equal(at(defiance, 'health_maxhealth').reason, 'SCOPE_NOT_ALLOWLISTED')
  assert.equal(at('BP_CRAFT_none_rifle_multi_01', 'weapon_damage').reason, 'MULTI_CHANNEL_SOURCE')
  assert.equal(at('BP_CRAFT_COOL_S04_CNOU_Pioneer', 'health_maxhealth').status, 'UNRESOLVED')
  assert.equal(at('BP_CRAFT_COOL_S04_CNOU_Pioneer', 'health_maxhealth').reason, 'ITEM_UNRESOLVED')
  assert.equal(baseline.resolveFabricatorBaseline('made_up', null, source.properties).reason, 'PROPERTY_UNKNOWN')

  const gun = source.blueprints.find(b => source.items.get(b.productEntityClass)?.attachType === 'WeaponGun' &&
    b.recipe.recipe.slots.some(s => s.modifiers.some(m => m.propertyKey === 'health_maxhealth')))
  assert.deepEqual([at(gun.sourceTag, 'health_maxhealth').status, at(gun.sourceTag, 'health_maxhealth').reason],
    ['SOURCE_DATA_MISSING', 'FIELD_MISSING'])

  const qd = source.blueprints.find(b => source.items.get(b.productEntityClass)?.attachType === 'QuantumDrive')
  const speed = at(qd.sourceTag, 'quantum_speed')
  assert.equal(speed.status, 'RESOLVED')
  assert.equal(speed.unitConversion, 'UNVERIFIED', 'raw driveSpeed must not be converted to Mm/s without evidence')
  assert.equal(at(qd.sourceTag, 'quantum_fuelrequirement').reason, 'UNIT_UNVERIFIED')
})

test('size: only component sizes, never synthesized', () => {
  const sizes = [...source.items.values()].map(item => size.normalizeFabricatorSize(item))
  assert.deepEqual(tally(sizes.map(s => s.status === 'RESOLVED' ? s.label : s.status)), {
    S0: 29, S1: 135, S2: 145, S3: 103, S4: 25, S5: 7, S6: 8, NOT_APPLICABLE: 1164,
  })
  const js400 = source.items.get(live.byTag.get('BP_CRAFT_POWR_AMRS_S02_JS400_SCItem').productEntityClass)
  assert.deepEqual(size.normalizeFabricatorSize(js400), { status: 'RESOLVED', value: 2, label: 'S2' })
  const killshot = source.items.get(live.byTag.get('BP_CRAFT_none_rifle_multi_01').productEntityClass)
  assert.deepEqual(size.normalizeFabricatorSize(killshot), { status: 'NOT_APPLICABLE' })
  const defiance = source.items.get(live.byTag.get('BP_CRAFT_slaver_armor_heavy_core_01_01_01').productEntityClass)
  assert.deepEqual(size.normalizeFabricatorSize(defiance), { status: 'NOT_APPLICABLE' })
  assert.deepEqual(size.normalizeFabricatorSize(null), { status: 'NOT_APPLICABLE' })
  assert.deepEqual(size.normalizeFabricatorSize({ attachType: 'Cooler', size: null }), { status: 'SOURCE_DATA_MISSING' })
  // The blueprint subtype sizeN agrees with the item size for every ship component.
  for (const bp of source.blueprints) {
    const item = source.items.get(bp.productEntityClass)
    if (item && /^size\d$/.test(bp.subtype ?? '')) assert.equal(Number(bp.subtype.slice(4)), item.size)
  }
})
