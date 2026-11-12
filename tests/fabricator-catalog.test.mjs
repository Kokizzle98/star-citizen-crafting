import assert from 'node:assert/strict'
import test from 'node:test'
import zlib from 'node:zlib'
import { loadFabricatorModule, loadLive } from './fabricator-fixture.mjs'

// Fabricator F2: compact client catalog built from the F1 hierarchy. Family
// and variant identity come from F1 unchanged; raw SCMDB data never leaves
// the server.

const live = await loadLive()
const catalogModule = await loadFabricatorModule('fabricator-catalog')
const catalog = catalogModule.buildFabricatorCatalog({ source: live.source, hierarchy: live.hierarchy })
const familyByTag = tag => {
  const index = catalog.blueprints.findIndex(b => b.tag === tag)
  return catalog.families.find(f => f.variants.some(v => v.components.some(c => c.blueprints.includes(index))))
}
const names = family => family.variants.map(v => v.components.map(c => catalog.blueprints[c.blueprints[0]].productName))

test('families mirror the F1 hierarchy one to one, plus the unresolved blueprint output', () => {
  assert.equal(catalog.version, '4.10.2-live.12913470')
  assert.equal(catalog.families.length, live.hierarchy.families.length + 1)
  assert.deepEqual(catalog.families.slice(0, -1).map(f => f.key), live.hierarchy.families.map(f => f.familyKey))
  const kinds = catalog.families.reduce((m, f) => ({ ...m, [f.kind]: (m[f.kind] ?? 0) + 1 }), {})
  assert.deepEqual(kinds, { ARMOR_SET: 116, SINGLE: 539, TAG_LINE: 38, UNRESOLVED_OUTPUT: 1 })
  assert.equal(catalog.families.length, 694)
  const referenced = catalog.families.flatMap(f => f.variants.flatMap(v => v.components.flatMap(c => c.blueprints)))
  assert.equal(referenced.length, 1618)
  assert.equal(new Set(referenced).size, 1618, 'every blueprint is reachable exactly once')
})

test('REVIEW_REQUIRED items stay visible as their own results', () => {
  const review = catalog.families.filter(f => f.status === 'REVIEW_REQUIRED')
  assert.equal(review.length, 23)
  const reasons = review.flatMap(f => f.reviewReasons).reduce((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {})
  assert.deepEqual(reasons, { ARMOR_TAG_UNSUPPORTED: 19, FAMILY_NAME_CONFLICT: 2, MULTIPLE_BLUEPRINTS: 1, BLUEPRINT_OUTPUT_UNRESOLVED: 1, PRODUCT_NAME_MISSING: 1 })
  const suit = familyByTag('BP_CRAFT_cds_combat_superheavy_suit_01_01_01')
  assert.equal(suit.kind, 'SINGLE')
  assert.deepEqual(suit.reviewReasons, ['ARMOR_TAG_UNSUPPORTED'])
  const pioneer = familyByTag('BP_CRAFT_COOL_S04_CNOU_Pioneer')
  assert.equal(pioneer.kind, 'UNRESOLVED_OUTPUT')
  assert.deepEqual(pioneer.reviewReasons, ['BLUEPRINT_OUTPUT_UNRESOLVED', 'PRODUCT_NAME_MISSING'])
  assert.equal(pioneer.title, 'BP_CRAFT_COOL_S04_CNOU_Pioneer')
  assert.equal(pioneer.titleFromTag, true)
})

test('Defiance: set, variants, Scorched only Torso, Modified separate; colliding titles get a display detail', () => {
  const defiance = familyByTag('BP_CRAFT_slaver_armor_heavy_core_01_01_01')
  assert.equal(defiance.kind, 'ARMOR_SET')
  assert.equal(defiance.title, 'Defiance')
  assert.equal(defiance.titleDetail, 'Defiance Helmet Tactical')
  assert.deepEqual(defiance.slots, ['Helmet', 'Torso', 'Arms', 'Legs'])
  assert.equal(defiance.variants.length, 7)
  const scorched = defiance.variants.find(v => v.variantKey === '14')
  assert.deepEqual(scorched.components.map(c => c.slot), ['Torso'])
  const modified = familyByTag('BP_CRAFT_slaver_armor_heavy_core_01_9tails_01')
  assert.notEqual(modified.key, defiance.key)
  assert.equal(modified.title, 'Defiance')
  assert.equal(modified.titleDetail, 'Defiance Helmet (Modified)')
  assert.equal(defiance.categoryKey, 'ARMOR')
  assert.equal(defiance.sizeLabel, null)
})

test('Killshot: base and variant under one family; no Payback in this LIVE dataset', () => {
  const killshot = familyByTag('BP_CRAFT_none_rifle_multi_01')
  assert.equal(killshot.title, 'Killshot Rifle')
  assert.equal(killshot.categoryKey, 'WeaponPersonal')
  assert.deepEqual(names(killshot), [['Killshot Rifle'], ['Killshot "Dominion Camo" Rifle']])
  assert.equal(catalog.blueprints.some(b => /payback/i.test(b.productName ?? '')), false)
  assert.notEqual(familyByTag('BP_CRAFT_none_rifle_multi_01_mag').key, killshot.key)
})

test('Glacis: one component with both blueprints, no default choice encoded', () => {
  const glacis = familyByTag('BP_CRAFT_SHLD_ORIG_S04_890J_SCItem')
  assert.equal(glacis.title, 'Glacis')
  assert.deepEqual(glacis.reviewReasons, ['MULTIPLE_BLUEPRINTS'])
  const component = glacis.variants[0].components[0]
  assert.deepEqual(component.blueprints.map(i => catalog.blueprints[i].tag).sort(),
    ['BP_CRAFT_SHLD_ORIG_S04_890J_SCItem', 'BP_CRAFT_SHLD_RSI_S04_Polaris_SCItem'])
  assert.equal(component.sizeLabel, 'S4')
})

test('recipes: deduplicated, exact integer requirements, units and minQuality', () => {
  assert.equal(catalog.recipes.length, 469)
  const js400 = catalog.recipes[catalog.blueprints.find(b => b.tag === 'BP_CRAFT_POWR_AMRS_S02_JS400_SCItem').recipe]
  assert.deepEqual(js400.slots.map(s => [s.name, s.material.name, s.material.unit, s.material.required, s.material.minQuality]), [
    ['Shell', 'Stileron', 'SCU', '1220000', 1], ['Voltage Regulator', 'Beryl', 'SCU', '500000', 1], ['Stator Cores', 'Savrilium', 'SCU', '850000', 1],
  ])
  const collector = catalog.recipes[catalog.blueprints.find(b => b.tag === 'BP_CRAFT_Carryable_2H_CY_CollectorMaterial_001').recipe]
  assert.deepEqual(collector.slots.map(s => [s.material.kind, s.material.unit, s.material.required, s.material.minQuality]), [
    ['RESOURCE', 'SCU', '2000000', 900], ['RESOURCE', 'SCU', '2000000', 800], ['ITEM', 'COUNT', '4', 0],
  ])
  for (const recipe of catalog.recipes) for (const slot of recipe.slots) assert.match(slot.material.required, /^[1-9]\d*$/)
})

test('the client payload is compact and carries no raw SCMDB data', () => {
  const json = JSON.stringify(catalog)
  assert.ok(json.length < 1_200_000, `payload ${json.length} bytes`)
  assert.ok(zlib.gzipSync(json).length < 120_000)
  for (const raw of ['"tiers"', '"modifiers"', '"modifierAtStart"', '"entityClass"', '"productEntityClass"', '"source"', '"tags"']) {
    assert.equal(json.includes(raw), false, raw)
  }
})

const labels = family => family.variants.map(v => v.label)
const componentNames = (family, variantKey) => family.variants.find(v => v.variantKey === variantKey).components
  .map(c => [c.slot, catalog.blueprints[c.blueprints[0]].productName, c.functional])

test('display labels (after identity resolution): set, short variant label, component slot', () => {
  const defiance = familyByTag('BP_CRAFT_slaver_armor_heavy_core_01_01_01')
  assert.equal(defiance.title, 'Defiance')
  assert.deepEqual(labels(defiance), ['Tactical', 'Sunchaser', 'Hailstorm', 'Charcoal', 'Firestarter', 'Scorched', 'Desert'])
  const adp = familyByTag('BP_CRAFT_cds_legacy_armor_heavy_arms_01_01_05')
  assert.equal(adp.title, 'ADP', 'the set title follows the name used by most slots, not the helmet')
  assert.equal(adp.titleDetail, 'ADP Core')
  assert.equal(adp.variants.length, 20)
  assert.ok(labels(adp).includes('Aqua'))
  assert.deepEqual(componentNames(adp, '17').map(c => c[0]), ['Helmet', 'Torso', 'Arms', 'Legs'])
  assert.equal(adp.variants.find(v => v.variantKey === '17').label, 'Aqua')
  const killshot = familyByTag('BP_CRAFT_none_rifle_multi_01')
  assert.deepEqual(labels(killshot), ['Basis', 'Dominion Camo'])
})

test('display labels never invent a name: inconsistent source names yield null, duplicates keep the variant key', () => {
  const multi = catalog.families.filter(f => f.variants.length > 1)
  assert.equal(multi.reduce((n, f) => n + f.variants.length, 0), 367)
  assert.equal(multi.flatMap(f => f.variants.filter(v => v.label === null)).length, 8)
  for (const family of multi) assert.equal(new Set(labels(family).filter(Boolean)).size, labels(family).filter(Boolean).length, family.key)
  const argus = familyByTag('BP_CRAFT_vgl_armor_light_arms_01_01_10')
  assert.ok(labels(argus).includes('Black/Silver · 11') && labels(argus).includes('Black/Silver · 15'))
  assert.equal(catalog.families.filter(f => f.variants.length === 1).every(f => f.variants[0].label === null), true)
})

test('functional classification reaches the client: TrueDef-Pro Arms/Legs White/Silver/Grey differ, the rest is equivalent', () => {
  const argus = familyByTag('BP_CRAFT_vgl_armor_light_arms_01_01_10')
  assert.equal(argus.title, 'TrueDef-Pro')
  assert.equal(argus.variants.find(v => v.variantKey === '10').label, 'White/Silver/Grey')
  assert.deepEqual(componentNames(argus, '10'), [
    ['Helmet', 'Argus Helmet White/Silver/Grey', 'FUNCTIONALLY_EQUIVALENT'],
    ['Torso', 'TrueDef-Pro Core White/Silver/Grey', 'FUNCTIONALLY_EQUIVALENT'],
    ['Arms', 'TrueDef-Pro Arms White/Silver/Grey', 'FUNCTIONALLY_DIFFERENT'],
    ['Legs', 'TrueDef-Pro Legs White/Silver/Grey', 'FUNCTIONALLY_DIFFERENT'],
  ])
  const all = catalog.families.flatMap(f => f.variants.flatMap(v => v.components.map(c => c.functional)))
  assert.deepEqual(all.reduce((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {}), { FUNCTIONALLY_EQUIVALENT: 856, FUNCTIONALLY_DIFFERENT: 2, UNRESOLVED: 759 })
})
