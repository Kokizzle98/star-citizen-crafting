import assert from 'node:assert/strict'
import test from 'node:test'
import { familyOfTag, loadFabricatorModule, loadLive } from './fabricator-fixture.mjs'

// Fabricator F1.1: functional crafting fingerprint and the
// FUNCTIONALLY_EQUIVALENT / FUNCTIONALLY_DIFFERENT / UNRESOLVED classification
// (OD-FAB-GROUP-01..03). The fingerprint confirms or flags; it never forms,
// splits or merges a family.

const live = await loadLive()
const fp = await loadFabricatorModule('fabricator-fingerprint')
const family = await loadFabricatorModule('fabricator-product-family')
const { source, hierarchy } = live

const fingerprintOf = tag => {
  const blueprint = live.byTag.get(tag)
  return fp.functionalFingerprint(source, blueprint, source.items.get(blueprint.productEntityClass))
}
const classes = f => f.variants.flatMap(v => v.components.map(c => c.functional))
const tally = values => values.reduce((m, v) => ({ ...m, [v]: (m[v] ?? 0) + 1 }), {})

test('canonical JSON is key-order independent and keeps array order', () => {
  assert.equal(fp.canonicalJson({ b: 1, a: { d: [2, 1], c: null } }), '{"a":{"c":null,"d":[2,1]},"b":1}')
  assert.equal(fp.canonicalJson({ a: 1, b: 2 }), fp.canonicalJson({ b: 2, a: 1 }))
  assert.equal(fp.canonicalJson({ a: undefined }), '{}')
})

test('fingerprint content: version, dataset, slot, recipe, modifiers and resolved stats; no names, tags, manufacturer or id', () => {
  const tag = 'BP_CRAFT_cds_legacy_armor_heavy_arms_01_01_05'
  const blueprint = live.byTag.get(tag)
  const item = source.items.get(blueprint.productEntityClass)
  const parsed = JSON.parse(fingerprintOf(tag))
  assert.equal(parsed.version, 'FCF1')
  assert.equal(parsed.dataset, '4.10.2-live.12913470')
  assert.equal(parsed.slot, 'Char_Armor_Arms')
  assert.deepEqual(parsed.recipe.map(s => [s.slot, s.kind, s.material, s.unit, s.amount, s.minQuality]),
    blueprint.recipe.recipe.slots.map(s => [s.name, s.material.kind, s.material.name, s.material.unit, s.material.amountMicroScu, s.material.minQuality]))
  assert.deepEqual(parsed.recipe[0].modifiers[0], { property: 'armor_damagemitigation', operation: 'MULTIPLICATIVE', segments: [[0, 1000, 0.85, 1.15]] })
  assert.deepEqual(parsed.stats.temperatureResistance, { min: -75, max: 105 })
  assert.deepEqual(parsed.stats.damageResistance, live.itemDocument.damageResistancePools[item.source.damageResistanceIndex])
  assert.equal('damageResistanceIndex' in parsed.stats, false, 'pooled stats are resolved, not compared by index')
  const text = fingerprintOf(tag)
  for (const forbidden of [blueprint.productName, item.name, item.manufacturer, item.manufacturerCode, item.entityClass, '"tags"', 'Set_01']) {
    assert.equal(text.includes(forbidden), false, String(forbidden))
  }
})

test('fingerprint is null when no reliable comparison is possible', () => {
  const blueprint = live.byTag.get('BP_CRAFT_POWR_AMRS_S02_JS400_SCItem')
  const item = source.items.get(blueprint.productEntityClass)
  assert.equal(fp.functionalFingerprint(source, { ...blueprint, recipe: { status: 'REVIEW_REQUIRED', issues: ['RECIPE_EMPTY'], recipe: null } }, item), null)
  const broken = { ...item, source: { ...item.source, signaturesIndex: 9999 } }
  assert.equal(fp.functionalFingerprint(source, blueprint, broken), null)
})

test('classification rule: equal, strict-majority reference, no majority, too few comparable members', () => {
  assert.deepEqual(fp.classifyFunctionalGroup(['a', 'a', 'a']), Array(3).fill('FUNCTIONALLY_EQUIVALENT'))
  assert.deepEqual(fp.classifyFunctionalGroup(['a', 'a', 'b']), ['FUNCTIONALLY_EQUIVALENT', 'FUNCTIONALLY_EQUIVALENT', 'FUNCTIONALLY_DIFFERENT'])
  assert.deepEqual(fp.classifyFunctionalGroup(['a', 'b']), ['FUNCTIONALLY_DIFFERENT', 'FUNCTIONALLY_DIFFERENT'])
  assert.deepEqual(fp.classifyFunctionalGroup(['a', 'a', 'b', 'b']), Array(4).fill('FUNCTIONALLY_DIFFERENT'))
  assert.deepEqual(fp.classifyFunctionalGroup(['a', null, 'a']), ['FUNCTIONALLY_EQUIVALENT', 'UNRESOLVED', 'FUNCTIONALLY_EQUIVALENT'])
  assert.deepEqual(fp.classifyFunctionalGroup(['a']), ['UNRESOLVED'])
  assert.deepEqual(fp.classifyFunctionalGroup(['a', null]), ['UNRESOLVED', 'UNRESOLVED'])
})

test('ADP: the formerly split variants and editions form one set; every component is functionally equivalent', () => {
  const adp = familyOfTag(live, 'BP_CRAFT_cds_legacy_armor_heavy_arms_01_01_05')
  assert.equal(adp.kind, 'ARMOR_SET')
  assert.equal(adp.variants.length, 23)
  assert.deepEqual(tally(classes(adp)), { FUNCTIONALLY_EQUIVALENT: 90 })
})

test('Argus / TrueDef-Pro: one set; exactly the two deviating items are FUNCTIONALLY_DIFFERENT and stay in the family', () => {
  const argus = familyOfTag(live, 'BP_CRAFT_vgl_armor_light_arms_01_01_10')
  assert.equal(argus.familyKey, 'ARMOR:vgl_armor_light_*_01')
  assert.equal(argus.status, 'RESOLVED')
  assert.equal(argus.variants.length, 21)
  const different = argus.variants.flatMap(v => v.components.filter(c => c.functional === 'FUNCTIONALLY_DIFFERENT')
    .map(c => [v.variantKey, c.slot, live.byGuid.get(c.blueprintGuids[0]).productName]))
  assert.deepEqual(different, [['01_10', 'Arms', 'TrueDef-Pro Arms White/Silver/Grey'], ['01_10', 'Legs', 'TrueDef-Pro Legs White/Silver/Grey']])
  assert.deepEqual(tally(classes(argus)), { FUNCTIONALLY_EQUIVALENT: 78, FUNCTIONALLY_DIFFERENT: 2 })
  const white = argus.variants.find(v => v.variantKey === '01_10')
  const torso = white.components.find(c => c.slot === 'Torso')
  assert.equal(torso.functional, 'FUNCTIONALLY_EQUIVALENT', 'the rest of that variant is unaffected')
})

test('Defiance: set 01 incl. Modified; Scorched Torso equivalent to the other torsos', () => {
  const defiance = familyOfTag(live, 'BP_CRAFT_slaver_armor_heavy_core_01_01_14')
  assert.equal(defiance.familyKey, 'ARMOR:slaver_armor_heavy_*_01')
  assert.deepEqual(defiance.variants.map(v => v.variantKey), ['01_01', '01_03', '01_10', '01_11', '01_13', '01_14', '01_15', '9tails_01'])
  assert.deepEqual(defiance.variants.find(v => v.variantKey === '01_14').components.map(c => [c.slot, c.functional]),
    [['Torso', 'FUNCTIONALLY_EQUIVALENT']])
  assert.deepEqual(tally(classes(defiance)), { FUNCTIONALLY_EQUIVALENT: 29 })
})

test('CBH-3 / PAB-1, G-2 / ORC-mkV (missing slots stay missing) and Fortifier / Citadel', () => {
  const light = familyOfTag(live, 'BP_CRAFT_cds_legacy_armor_light_arms_01_01_01')
  assert.deepEqual([light.kind, light.variants.length, tally(classes(light))], ['ARMOR_SET', 20, { FUNCTIONALLY_EQUIVALENT: 80 }])
  const medium = familyOfTag(live, 'BP_CRAFT_cds_legacy_armor_medium_arms_01_01_01')
  assert.equal(medium.variants.length, 27)
  const slotsPerVariant = medium.variants.map(v => v.components.length)
  assert.equal(slotsPerVariant.reduce((a, b) => a + b, 0), 102)
  assert.ok(medium.variants.some(v => v.components.map(c => c.slot).join('/') === 'Torso'), 'incomplete variants keep only their real slots')
  assert.deepEqual(tally(classes(medium)), { FUNCTIONALLY_EQUIVALENT: 102 })
  const outlaw = familyOfTag(live, 'BP_CRAFT_outlaw_legacy_armor_heavy_arms_01_01_01')
  assert.deepEqual([outlaw.kind, outlaw.variants.length, tally(classes(outlaw))], ['ARMOR_SET', 3, { FUNCTIONALLY_EQUIVALENT: 10 }])
})

test('negative: an identical fingerprint without a structural relation creates no family', () => {
  const field = 'BP_CRAFT_cds_armor_light_arms_01_01_01'
  const fbl = 'BP_CRAFT_cds_combat_light_arms_02_02_01'
  assert.equal(fingerprintOf(field), fingerprintOf(fbl))
  assert.notEqual(familyOfTag(live, field).familyKey, familyOfTag(live, fbl).familyKey)
  // Synthetic: two unrelated items with the same fingerprint function result stay separate.
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const items = new Map([1, 2].map(n => [uuid(n), { entityClass: uuid(n), name: 'Same', itemType: 'x', attachType: 'Cooler',
    attachSubType: null, size: 1, manufacturer: null, manufacturerCode: null, source: {} }]))
  const blueprints = [1, 2].map(n => ({ sourceGuid: uuid(100 + n), sourceTag: `BP_CRAFT_COOL_${n}`, productEntityClass: uuid(n),
    productName: 'Same', manufacturer: null, gear: 'x', type: null, subtype: null, recipe: { status: 'RESOLVED', recipe: null } }))
  const result = family.buildFabricatorProductHierarchy(blueprints, items, { fingerprint: () => 'identical' })
  assert.deepEqual(result.families.map(f => [f.kind, f.variants[0].components[0].functional]), [['SINGLE', 'UNRESOLVED'], ['SINGLE', 'UNRESOLVED']])
})

test('negative: different product lines with the same recipe stay separate (ADP vs ADP-mk4)', () => {
  const adp = live.byTag.get('BP_CRAFT_cds_legacy_armor_heavy_arms_01_01_01')
  const mk4 = live.byTag.get('BP_CRAFT_cds_armor_heavy_arms_01_01_01')
  assert.equal(JSON.stringify(JSON.parse(fingerprintOf(adp.sourceTag)).recipe), JSON.stringify(JSON.parse(fingerprintOf(mk4.sourceTag)).recipe))
  assert.notEqual(fingerprintOf(adp.sourceTag), fingerprintOf(mk4.sourceTag), 'base stats differ')
  assert.notEqual(familyOfTag(live, adp.sourceTag).familyKey, familyOfTag(live, mk4.sourceTag).familyKey)
})

test('negative: container line stays unresolved, suits stay review; _crus01 / _hd_sec / 9tails join set 01 only through structure (F1.2)', () => {
  const containers = hierarchy.families.filter(f => (f.structuralKey ?? '').startsWith('Container:') && f.reviewReasons.includes('FAMILY_NAME_CONFLICT'))
  assert.equal(containers.length, 2)
  assert.deepEqual(familyOfTag(live, 'BP_CRAFT_cds_combat_superheavy_suit_01_01_01').reviewReasons, ['ARMOR_TAG_UNSUPPORTED'])
  const main = familyOfTag(live, 'BP_CRAFT_cds_legacy_armor_heavy_arms_01_01_01').familyKey
  for (const tag of ['BP_CRAFT_cds_legacy_armor_heavy_arms_01_crus01_01', 'BP_CRAFT_cds_legacy_armor_heavy_arms_01_01_hd_sec',
    'BP_CRAFT_cds_legacy_armor_heavy_arms_01_9tails_01']) {
    assert.equal(familyOfTag(live, tag).familyKey, main, tag)
    assert.equal(fingerprintOf(tag), fingerprintOf('BP_CRAFT_cds_legacy_armor_heavy_arms_01_01_01'), 'FCF1 confirms, it did not group')
  }
  assert.notEqual(familyOfTag(live, 'BP_CRAFT_cds_armor_heavy_arms_01_01_01').familyKey, main, 'ADP-mk4 stays its own model line')
})

test('measured totals of the refined resolution', () => {
  const kinds = tally(hierarchy.families.map(f => `${f.kind}/${f.status}`))
  assert.deepEqual(kinds, { 'ARMOR_SET/RESOLVED': 62, 'SINGLE/RESOLVED': 530, 'SINGLE/REVIEW_REQUIRED': 22, 'TAG_LINE/RESOLVED': 38 })
  assert.deepEqual(tally(hierarchy.families.flatMap(f => f.reviewReasons)), { ARMOR_TAG_UNSUPPORTED: 19, FAMILY_NAME_CONFLICT: 2, MULTIPLE_BLUEPRINTS: 1 })
  const all = hierarchy.families.flatMap(classes)
  assert.deepEqual(tally(all), { FUNCTIONALLY_EQUIVALENT: 973, FUNCTIONALLY_DIFFERENT: 6, UNRESOLVED: 637 })
  assert.ok(hierarchy.families.filter(f => f.kind === 'SINGLE').every(f => classes(f).every(c => c === 'UNRESOLVED')))
  assert.ok(hierarchy.families.filter(f => f.kind === 'TAG_LINE').every(f => classes(f).every(c => c === 'FUNCTIONALLY_EQUIVALENT')))
})

test('without a fingerprint function every component stays UNRESOLVED (no implicit comparison)', () => {
  const plain = family.buildFabricatorProductHierarchy(source.blueprints, source.items)
  assert.equal(plain.families.length, hierarchy.families.length)
  assert.ok(plain.families.every(f => classes(f).every(c => c === 'UNRESOLVED')))
  assert.deepEqual(plain.families.map(f => f.familyKey), hierarchy.families.map(f => f.familyKey), 'grouping never depends on the fingerprint')
})
