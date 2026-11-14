import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCraft } from '../src/calculation/craft-calculation-engine.js'
import { loadFabricatorModule, loadLive } from './fabricator-fixture.mjs'

// Fabricator F1: blueprint -> recipe (strict, with modifiers), recipe ->
// inventory vocabulary (dataset-bound exact identity), modifier adapter to the
// unchanged VECTOR_CRAFT_CALC_V1 engine, and the JS-400 source contract.

const live = await loadLive()
const recipeModule = await loadFabricatorModule('fabricator-recipe')
const adapter = await loadFabricatorModule('fabricator-modifier-adapter')
const baseline = await loadFabricatorModule('fabricator-baseline')
const { source } = live
const VERSION = '4.10.2-live.12913470'

const recipes = source.blueprints.map(b => b.recipe.recipe)
const materials = recipes.flatMap(r => r.slots.map(s => s.material))

test('every LIVE recipe reads strictly, with exactly one material option per slot', () => {
  assert.ok(source.blueprints.every(b => b.recipe.status === 'RESOLVED'))
  assert.equal(materials.length, 4316)
  assert.equal(recipes.flatMap(r => r.slots).filter(s => s.modifiers.length > 0).length > 0, true)
})

test('recipe -> inventory vocabulary: every material is an exact name of this LIVE version', () => {
  assert.ok(materials.every(m => m.vocabulary === 'RESOLVED' && m.datasetVersion === VERSION))
  assert.equal(new Set(materials.map(m => `${m.kind}:${m.name}`)).size, 37)
  for (const material of materials) {
    const vocabulary = material.kind === 'RESOURCE' ? source.vocabulary.resources : source.vocabulary.items
    assert.ok(vocabulary.has(material.name))
  }
  assert.equal(source.vocabulary.resources.size, 26)
  assert.equal(source.vocabulary.items.size, 11)
})

test('units, amounts and minQuality are kept exactly', () => {
  const js400 = live.byTag.get('BP_CRAFT_POWR_AMRS_S02_JS400_SCItem').recipe.recipe
  assert.deepEqual(js400.slots.map(s => [s.slotKey, s.name, s.material.kind, s.material.name, s.material.amount,
    s.material.unit, s.material.amountMicroScu, s.material.minQuality]), [
    ['0', 'Shell', 'RESOURCE', 'Stileron', 1.22, 'SCU', 1220000, 1],
    ['1', 'Voltage Regulator', 'RESOURCE', 'Beryl', 0.5, 'SCU', 500000, 1],
    ['2', 'Stator Cores', 'RESOURCE', 'Savrilium', 0.85, 'SCU', 850000, 1],
  ])
  const collector = live.byTag.get('BP_CRAFT_Carryable_2H_CY_CollectorMaterial_001').recipe.recipe
  assert.deepEqual(collector.slots.map(s => [s.material.name, s.material.unit, s.material.amount, s.material.amountMicroScu, s.material.minQuality]), [
    ['Titanium', 'SCU', 2, 2000000, 900], ['Riccite', 'SCU', 2, 2000000, 800], ['Yormandi Eye', 'COUNT', 4, null, 0],
  ])
  assert.equal(materials.filter(m => m.minQuality > 0).length, 1399)
  assert.ok(materials.filter(m => m.unit === 'COUNT').every(m => Number.isInteger(m.amount) && m.kind === 'ITEM'))
  assert.equal(recipeModule.scuToMicroScu(0.0000001), null)
})

// --- Synthetic strictness ------------------------------------------------------

const context = {
  datasetVersion: VERSION, resources: new Set(['Iron']), items: new Set(['Gem']),
  properties: new Map([['health_maxhealth', { key: 'health_maxhealth', name: 'Integrity', unitFormat: null, category: 'other' }]]),
}
const seg = (s, e, a, b, extra = {}) => ({ startQuality: s, endQuality: e, modifierAtStart: a, modifierAtEnd: b,
  propertyName: 'Integrity', propertyKey: 'health_maxhealth', ...extra })
const tier = (options, modifiers = null, extra = {}) => [{ craftTimeSeconds: 10, slots: [{ name: 'Shell', options, modifiers, ...extra }] }]
const iron = { type: 'resource', quantity: 1, minQuality: 0, resourceName: 'Iron' }
const read = tiers => recipeModule.readFabricatorRecipe(tiers, context)
const issues = tiers => { const r = read(tiers); return r.status === 'RESOLVED' ? [] : r.issues }

test('strict recipe shape: unknown or unsupported shapes are REVIEW_REQUIRED, never guessed', () => {
  assert.equal(read(tier([iron])).status, 'RESOLVED')
  assert.deepEqual(issues([]), ['RECIPE_TIER_COUNT_UNSUPPORTED'])
  assert.deepEqual(issues([...tier([iron]), ...tier([iron])]), ['RECIPE_TIER_COUNT_UNSUPPORTED'])
  assert.deepEqual(issues([{ craftTimeSeconds: 1, slots: [] }]), ['RECIPE_EMPTY'])
  assert.deepEqual(issues(tier([iron, iron])), ['RECIPE_SLOT_OPTION_COUNT_UNSUPPORTED'])
  assert.deepEqual(issues(tier([iron], null, { extra: 1 })), ['RECIPE_SHAPE_INVALID'])
  assert.deepEqual(issues(tier([{ ...iron, quantity: 0 }])), ['RECIPE_MATERIAL_INVALID'])
  assert.deepEqual(issues(tier([{ ...iron, minQuality: 1001 }])), ['RECIPE_MATERIAL_INVALID'])
  assert.deepEqual(issues(tier([{ ...iron, type: 'unknown' }])), ['RECIPE_MATERIAL_INVALID'])
  assert.deepEqual(issues(tier([{ ...iron, itemName: 'Gem' }])), ['RECIPE_MATERIAL_INVALID'])
  assert.deepEqual(issues(tier([{ type: 'item', quantity: 1.5, minQuality: 0, itemName: 'Gem' }])), ['RECIPE_MATERIAL_INVALID'])
  assert.deepEqual(issues(tier([{ ...iron, modifiers: [seg(0, 1000, 1, 1)] }])), ['MODIFIER_SHAPE_INVALID'])
})

test('unknown material names stay UNRESOLVED (no fuzzy match, no other vocabulary kind)', () => {
  const unknown = read(tier([{ ...iron, resourceName: 'iron' }]))
  assert.deepEqual(unknown.issues, ['RECIPE_MATERIAL_UNRESOLVED'])
  assert.equal(unknown.recipe.slots[0].material.vocabulary, 'UNRESOLVED')
  const wrongKind = read(tier([{ type: 'item', quantity: 1, minQuality: 0, itemName: 'Iron' }]))
  assert.equal(wrongKind.recipe.slots[0].material.vocabulary, 'UNRESOLVED')
})

test('strict modifiers: invalid fields, overlaps, mixed operations and unknown properties fail closed', () => {
  assert.deepEqual(issues(tier([iron], [seg(0, 500, 0.8, 1), seg(501, 1000, 1, 1.2)])), [])
  assert.deepEqual(issues(tier([iron], [seg(0, 600, 1, 1), seg(500, 1000, 1, 1)])), ['MODIFIER_SHAPE_INVALID'])
  assert.deepEqual(issues(tier([iron], [seg(0, 500, 1, 1), seg(501, 1000, 1, 1, { additive: true })])), ['MODIFIER_SHAPE_INVALID'])
  assert.deepEqual(issues(tier([iron], [seg(0, 1000.5, 1, 1)])), ['MODIFIER_SHAPE_INVALID'])
  assert.deepEqual(issues(tier([iron], [seg(10, 10, 1, 2)])), ['MODIFIER_SHAPE_INVALID'])
  assert.deepEqual(issues(tier([iron], [seg(0, 1000, 1, Number.NaN)])), ['MODIFIER_SHAPE_INVALID'])
  assert.deepEqual(issues(tier([iron], [seg(0, 1000, 1, 1, { additive: 'yes' })])), ['MODIFIER_SHAPE_INVALID'])
  assert.deepEqual(issues(tier([iron], [seg(0, 1000, 1, 1, { surprise: true })])), ['MODIFIER_SHAPE_INVALID'])
  assert.deepEqual(issues(tier([iron], [seg(0, 1000, 1, 1, { propertyKey: 'made_up' })])), ['MODIFIER_PROPERTY_UNKNOWN'])
  assert.deepEqual(issues(tier([iron], {})), ['MODIFIER_SHAPE_INVALID'])
})

test('modifier coverage is recorded exactly as the source states it', () => {
  const groups = recipes.flatMap(r => r.slots.flatMap(s => s.modifiers))
  assert.equal(groups.length, 5251)
  assert.equal(groups.filter(g => g.fullCoverage).length, 4998)
  assert.equal(groups.filter(g => g.operation === 'ADDITIVE').length, 150)
})

test('adapter maps SCMDB fields to the engine contract and fails closed on invalid shape', () => {
  const js400 = live.byTag.get('BP_CRAFT_POWR_AMRS_S02_JS400_SCItem').recipe.recipe
  const modifiers = adapter.toCraftCalculationModifiers(js400)
  assert.deepEqual(modifiers[0], {
    propertyKey: 'health_maxhealth', slotKey: '0', operation: 'MULTIPLICATIVE',
    segments: [
      { startQuality: 0, endQuality: 500, modifierStart: 0.8, modifierEnd: 1 },
      { startQuality: 501, endQuality: 1000, modifierStart: 1, modifierEnd: 1.2 },
    ],
  })
  assert.deepEqual(modifiers.slice(1).map(m => [m.slotKey, m.propertyKey, m.operation, m.segments.length]),
    [['1', 'itemresource_powergeneration', 'ADDITIVE', 5], ['2', 'itemresource_powergeneration', 'ADDITIVE', 5]])

  const bad = segments => ({ craftTimeSeconds: 1, slots: [{ slotKey: '0', name: 'S', material: {}, modifiers: [{ propertyKey: 'p', operation: 'MULTIPLICATIVE', segments, fullCoverage: false }] }] })
  const code = fn => { try { fn(); return null } catch (e) { return e.code } }
  assert.equal(code(() => adapter.toCraftCalculationModifiers(bad([]))), 'SEGMENTS_INVALID')
  assert.equal(code(() => adapter.toCraftCalculationModifiers(bad([{ startQuality: 0, endQuality: 600, modifierAtStart: 1, modifierAtEnd: 1 }, { startQuality: 500, endQuality: 1000, modifierAtStart: 1, modifierAtEnd: 1 }]))), 'SEGMENTS_INVALID')
  assert.equal(code(() => adapter.toCraftCalculationModifiers(bad([{ startQuality: 0, endQuality: 1000, modifierStart: 1, modifierEnd: 1 }]))), 'SEGMENTS_INVALID')
  assert.equal(code(() => adapter.toCraftCalculationModifiers({ slots: [{ slotKey: '0', modifiers: [{ propertyKey: 'p', operation: 'SET', segments: [] }] }] })), 'OPERATION_INVALID')
})

test('quality input: one global MANUAL value (D2 = C) with structural room for per-slot overrides', () => {
  const js400 = live.byTag.get('BP_CRAFT_POWR_AMRS_S02_JS400_SCItem').recipe.recipe
  assert.deepEqual(adapter.toCraftCalculationQualities(js400, { globalQuality: 750 }), { 0: 750, 1: 750, 2: 750 })
  assert.deepEqual(adapter.toCraftCalculationQualities(js400, { globalQuality: 750, slotOverrides: { 1: 900 } }), { 0: 750, 1: 900, 2: 750 })
  for (const input of [{ globalQuality: -1 }, { globalQuality: 1001 }, { globalQuality: 500.5 }, { globalQuality: 1, slotOverrides: { 9: 1 } }, { globalQuality: 1, slotOverrides: { 0: 2000 } }]) {
    assert.throws(() => adapter.toCraftCalculationQualities(js400, input), /FABRICATOR_ADAPTER_QUALITY/)
  }
  const ccc = live.byTag.get('BP_CRAFT_ccc_medium_armor_core_01_01_01').recipe.recipe
  const uncovered = adapter.uncoveredModifiers(ccc, adapter.toCraftCalculationQualities(ccc, { globalQuality: 499 }))
  assert.ok(uncovered.some(u => u.propertyKey === 'armor_temperaturemin'))
  assert.deepEqual(adapter.uncoveredModifiers(ccc, adapter.toCraftCalculationQualities(ccc, { globalQuality: 500 })), [])
})

test('JS-400 current source contract with the unchanged engine (historical Q750 values are test input only)', () => {
  const blueprint = live.byTag.get('BP_CRAFT_POWR_AMRS_S02_JS400_SCItem')
  const item = source.items.get(blueprint.productEntityClass)
  const recipe = blueprint.recipe.recipe
  const baselines = Object.fromEntries(['health_maxhealth', 'itemresource_powergeneration'].map(key => {
    const b = baseline.resolveFabricatorBaseline(key, item, source.properties)
    return [key, { status: b.status, value: b.value }]
  }))
  assert.deepEqual(baselines, {
    health_maxhealth: { status: 'RESOLVED', value: 980 },
    itemresource_powergeneration: { status: 'RESOLVED', value: 21 },
  })
  const calc = quality => {
    const result = calculateCraft({
      channel: 'LIVE', gameVersion: VERSION, blueprintId: blueprint.sourceGuid, productEntityClass: item.entityClass,
      baselines, modifiers: adapter.toCraftCalculationModifiers(recipe),
      qualities: adapter.toCraftCalculationQualities(recipe, { globalQuality: quality }),
    })
    assert.equal(result.status, 'COMPLETE')
    return Object.fromEntries(result.stats.map(s => [s.propertyKey, s]))
  }
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
  const q750 = calc(750)
  // Integrity: segment 501..1000, t = 249/499 (historical 1078 / +10.00 % assumed t = 0.5).
  near(q750.health_maxhealth.craftedValue, 980 * (1 + (249 / 499) * 0.2))
  assert.equal(q750.health_maxhealth.craftedValue.toFixed(2), '1077.80')
  near(q750.health_maxhealth.percentDelta, (249 / 499) * 20)
  // Power pips: +1 from each of the two regulator slots at Q750 (identical to the historical value).
  assert.equal(q750.itemresource_powergeneration.craftedValue, 23)
  assert.equal(q750.itemresource_powergeneration.absoluteDelta, 2)
  for (const [quality, integrity, pips] of [[0, 784, 17], [500, 980, 21], [501, 980, 21], [1000, 1176, 25]]) {
    const stats = calc(quality)
    near(stats.health_maxhealth.craftedValue, integrity)
    assert.equal(stats.itemresource_powergeneration.craftedValue, pips)
  }
})
