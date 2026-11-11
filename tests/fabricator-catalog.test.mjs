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
  assert.deepEqual(kinds, { ARMOR_SET: 104, SINGLE: 911, TAG_LINE: 38, UNRESOLVED_OUTPUT: 1 })
  const referenced = catalog.families.flatMap(f => f.variants.flatMap(v => v.components.flatMap(c => c.blueprints)))
  assert.equal(referenced.length, 1618)
  assert.equal(new Set(referenced).size, 1618, 'every blueprint is reachable exactly once')
})

test('REVIEW_REQUIRED items stay visible as their own results', () => {
  const review = catalog.families.filter(f => f.status === 'REVIEW_REQUIRED')
  assert.equal(review.length, 395)
  const adp = familyByTag('BP_CRAFT_cds_legacy_armor_heavy_legs_01_01_05')
  assert.equal(adp.kind, 'SINGLE')
  assert.deepEqual(adp.reviewReasons, ['FAMILY_NAME_CONFLICT'])
  assert.equal(adp.title, 'ADP Legs Green')
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
