import assert from 'node:assert/strict'
import test from 'node:test'
import { familyOfTag, loadFabricatorModule, loadLive, productNames } from './fabricator-fixture.mjs'

// Fabricator F1.2: Armor Family Key V2 (owner decisions OD-FAB-GROUP-04 to 08).
// For the evidenced tag structure `<prefix>_<slot>_<SetNr>_<rest>` the family
// is `<prefix>` + `<SetNr>`, the edition / variant is the complete remainder,
// the component is the slot (`attachType`). Only source structure relates
// items; FCF1, names, mission data and identical recipes never do. Expected
// values were measured on the LIVE mirror 4.10.2-live.12913470.

const live = await loadLive()
const family = await loadFabricatorModule('fabricator-product-family')
const fp = await loadFabricatorModule('fabricator-fingerprint')
const { hierarchy, source } = live

const tally = values => values.reduce((m, v) => ({ ...m, [v]: (m[v] ?? 0) + 1 }), {})
const classes = f => f.variants.flatMap(v => v.components.map(c => c.functional))
const shape = f => f.variants.map(v => [v.variantKey, v.components.map(c => c.slot).join('/')])
const variant = (f, key) => f.variants.find(v => v.variantKey === key)
const fingerprintOf = tag => {
  const blueprint = live.byTag.get(tag)
  return fp.functionalFingerprint(source, blueprint, source.items.get(blueprint.productEntityClass))
}

test('tag parser V2: family = prefix + set number, variant = the complete remainder, slot from attachType', () => {
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_foo_core_01_01_07', 'Torso'), { ok: true, lineKey: 'foo_*_01', variantKey: '01_07' })
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_foo_bar_arms_01_01_hd_sec', 'Arms'), { ok: true, lineKey: 'foo_bar_*_01', variantKey: '01_hd_sec' },
    'multi-part suffixes stay whole')
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_foo_legs_02_9tails_01', 'Legs'), { ok: true, lineKey: 'foo_*_02', variantKey: '9tails_01' })
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_foo_core_ab_01_01', 'Torso'), { ok: false, reason: 'ARMOR_TAG_UNSUPPORTED' },
    'the token after the slot must be a set number')
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_foo_core_01', 'Torso'), { ok: false, reason: 'ARMOR_TAG_UNSUPPORTED' }, 'no remainder, no variant')
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_foo_core_01_01_01', 'Arms'), { ok: false, reason: 'ARMOR_SLOT_TOKEN_CONFLICT' })
})

test('ADP: standard colours, Hurston Edition, Crusader Edition and Modified form one set-01 family', () => {
  const adp = familyOfTag(live, 'BP_CRAFT_cds_legacy_armor_heavy_arms_01_01_05')
  assert.equal(adp.familyKey, 'ARMOR:cds_legacy_armor_heavy_*_01')
  assert.deepEqual([adp.kind, adp.status], ['ARMOR_SET', 'RESOLVED'])
  assert.equal(adp.variants.length, 23)
  for (const tag of ['BP_CRAFT_cds_legacy_armor_heavy_core_01_01_hd_sec', 'BP_CRAFT_cds_legacy_armor_heavy_core_01_crus01_01',
    'BP_CRAFT_cds_legacy_armor_heavy_core_01_9tails_01']) assert.equal(familyOfTag(live, tag).familyKey, adp.familyKey, tag)
  assert.deepEqual(productNames(live, { variants: [variant(adp, '01_hd_sec')] })[0],
    ['Balor HCH Helmet Hurston Edition', 'ADP Core Hurston Edition', 'ADP Arms Hurston Edition', 'ADP Legs Hurston Edition'])
  assert.deepEqual(productNames(live, { variants: [variant(adp, 'crus01_01')] })[0],
    ['Balor HCH Helmet Crusader Edition', 'ADP Core Crusader Edition', 'ADP Arms Crusader Edition', 'ADP Legs Crusader Edition'])
  assert.deepEqual(productNames(live, { variants: [variant(adp, '9tails_01')] })[0], ['ADP Core (Modified)', 'ADP Arms (Modified)'],
    'Modified keeps exactly its real slots')
  const pairs = adp.variants.flatMap(v => v.components.map(c => `${v.variantKey}/${c.slot}`))
  assert.equal(new Set(pairs).size, pairs.length, 'no duplicate variant / slot pair')
  assert.deepEqual(tally(classes(adp)), { FUNCTIONALLY_EQUIVALENT: 90 })
})

test('ADP-mk4: its own model line, never normalized into ADP; Woodland and SecondWind keep their structural lines', () => {
  const adp = familyOfTag(live, 'BP_CRAFT_cds_legacy_armor_heavy_core_01_01_01')
  const woodland = familyOfTag(live, 'BP_CRAFT_cds_armor_heavy_core_01_01_01')
  const secondWind = familyOfTag(live, 'BP_CRAFT_cds_combat_heavy_core_01_02_02')
  assert.equal(woodland.familyKey, 'ARMOR:cds_armor_heavy_*_01')
  assert.deepEqual(shape(woodland), [['01_01', 'Helmet/Torso/Arms/Legs']])
  assert.equal(secondWind.familyKey, 'ARMOR:cds_combat_heavy_*_01')
  assert.deepEqual(shape(secondWind), [['01_01', 'Backpack'], ['02_02', 'Helmet/Torso/Arms/Legs']])
  assert.deepEqual(productNames(live, secondWind)[1], ['ADP-mk4 Helmet SecondWind', 'ADP-mk4 Core SecondWind', 'ADP-mk4 Arms SecondWind', 'ADP-mk4 Legs SecondWind'])
  assert.notEqual(woodland.familyKey, adp.familyKey)
  assert.notEqual(secondWind.familyKey, adp.familyKey)
  assert.notEqual(woodland.familyKey, secondWind.familyKey, 'different prefixes: no synthetic series level')
  const mk4Families = hierarchy.families.filter(f => f.variants.some(v => v.components.some(c =>
    /^ADP-mk4 /.test(live.byGuid.get(c.blueprintGuids[0]).productName))))
  assert.deepEqual(mk4Families.map(f => f.familyKey), ['ARMOR:cds_armor_heavy_*_01', 'ARMOR:cds_combat_heavy_*_01'])
})

test('Artimex: set 01 standard, Elysium and Modified share one family; Hurston Dynamics Executive Security (set 02) stays separate', () => {
  const artimex = familyOfTag(live, 'BP_CRAFT_qrt_specialist_medium_core_01_01_01')
  assert.equal(artimex.familyKey, 'ARMOR:qrt_specialist_medium_*_01')
  assert.deepEqual(artimex.variants.map(v => v.variantKey), ['01_01', '01_04', '01_10', '01_15', '01_16', '01_iae2022', '01_iae2024', '03_01', '9tails_01'])
  assert.deepEqual(productNames(live, { variants: [variant(artimex, '03_01')] })[0],
    ['Artimex Helmet Elysium', 'Artimex Core Elysium', 'Artimex Arms Elysium', 'Artimex Legs Elysium'])
  assert.deepEqual(productNames(live, { variants: [variant(artimex, '9tails_01')] })[0], ['Artimex Core (Modified)', 'Artimex Arms (Modified)'])
  assert.deepEqual(tally(classes(artimex)), { FUNCTIONALLY_EQUIVALENT: 34 })
  const executive = familyOfTag(live, 'BP_CRAFT_qrt_specialist_medium_core_02_01_01')
  assert.equal(executive.familyKey, 'ARMOR:qrt_specialist_medium_*_02')
  assert.notEqual(executive.familyKey, artimex.familyKey)
  assert.equal(fingerprintOf('BP_CRAFT_qrt_specialist_medium_core_02_01_01'), fingerprintOf('BP_CRAFT_qrt_specialist_medium_core_01_01_01'),
    'identical function and name do not join different set numbers')
  assert.equal(source.blueprints.some(b => /^Artimex/.test(b.productName ?? '') && /microtech/i.test(`${b.sourceTag} ${b.productName}`)), false,
    'no microTech Artimex edition exists in this LIVE dataset')
})

test('Defiance: seven colour variants plus Modified; Scorched keeps only its real Torso', () => {
  const defiance = familyOfTag(live, 'BP_CRAFT_slaver_armor_heavy_core_01_01_01')
  assert.equal(defiance.familyKey, 'ARMOR:slaver_armor_heavy_*_01')
  assert.deepEqual(shape(defiance), [
    ['01_01', 'Helmet/Torso/Arms/Legs'], ['01_03', 'Helmet/Torso/Arms/Legs'], ['01_10', 'Helmet/Torso/Arms/Legs'], ['01_11', 'Helmet/Torso/Arms/Legs'],
    ['01_13', 'Helmet/Torso/Arms/Legs'], ['01_14', 'Torso'], ['01_15', 'Helmet/Torso/Arms/Legs'], ['9tails_01', 'Helmet/Torso/Arms/Legs']])
  assert.deepEqual(tally(classes(defiance)), { FUNCTIONALLY_EQUIVALENT: 29 })
})

test('measured V2 consolidations: Morozov, Monde, Tailwind, Antium, Chiron', () => {
  const morozov = familyOfTag(live, 'BP_CRAFT_rrs_specialist_heavy_core_01_9tails_01')
  assert.deepEqual(shape(morozov), [['01_01', 'Helmet/Torso/Arms/Legs'], ['01_03', 'Helmet/Torso/Arms/Legs'], ['01_10', 'Helmet/Torso/Arms/Legs'],
    ['01_12', 'Helmet/Torso/Arms/Legs'], ['02_01', 'Helmet/Torso/Arms/Legs'], ['02_02', 'Legs'], ['03_01', 'Helmet'], ['05_01', 'Helmet'], ['9tails_01', 'Torso/Arms/Legs']])
  assert.deepEqual(tally(classes(morozov)), { FUNCTIONALLY_EQUIVALENT: 26 })
  const monde = familyOfTag(live, 'BP_CRAFT_kap_combat_heavy_core_02_01_01')
  assert.equal(monde.familyKey, 'ARMOR:kap_combat_heavy_*_02')
  assert.deepEqual(monde.variants.map(v => v.variantKey), ['01_01', '04_01', '05_01', '06_01', '07_01', '08_01', '09_01'])
  assert.deepEqual(tally(classes(monde)), { FUNCTIONALLY_EQUIVALENT: 28 })
  const tailwind = familyOfTag(live, 'BP_CRAFT_vgl_flightsuit_helmet_01_02_01')
  assert.equal(tailwind.variants.length, 9)
  assert.ok(tailwind.variants.every(v => v.components.map(c => c.slot).join('/') === 'Helmet'))
  assert.deepEqual(tally(classes(tailwind)), { FUNCTIONALLY_EQUIVALENT: 9 })
  const antium = familyOfTag(live, 'BP_CRAFT_qrt_specialist_heavy_core_01_01_01')
  assert.deepEqual(antium.variants.map(v => v.variantKey), ['01_01', '01_10', '01_12', '01_13', '01_15', '02_16', '03_01'])
  assert.deepEqual(tally(classes(antium)), { FUNCTIONALLY_EQUIVALENT: 28 })
})

test('VGL utility light (Chiron): grouped structurally, the FCF1 deviations stay FUNCTIONALLY_DIFFERENT', () => {
  const chiron = familyOfTag(live, 'BP_CRAFT_vgl_utility_light_core_01_01_01')
  assert.equal(chiron.familyKey, 'ARMOR:vgl_utility_light_*_01')
  assert.deepEqual(chiron.variants.map(v => [v.variantKey, v.components.map(c => `${c.slot}:${c.functional}`)]), [
    ['01_01', ['Helmet:FUNCTIONALLY_EQUIVALENT', 'Torso:FUNCTIONALLY_EQUIVALENT', 'Arms:FUNCTIONALLY_DIFFERENT', 'Legs:FUNCTIONALLY_DIFFERENT']],
    ['04_01', ['Torso:FUNCTIONALLY_EQUIVALENT', 'Arms:FUNCTIONALLY_DIFFERENT', 'Legs:FUNCTIONALLY_DIFFERENT']],
    ['05_01', ['Helmet:FUNCTIONALLY_EQUIVALENT', 'Backpack:UNRESOLVED']],
  ])
})

test('exactly the measured families combine more than one edition token; every armor family stays resolved and duplicate-free', () => {
  const multi = hierarchy.families.filter(f => f.kind === 'ARMOR_SET' && new Set(f.variants.map(v => v.variantKey.split('_')[0])).size > 1)
  assert.deepEqual(multi.map(f => f.familyKey.slice('ARMOR:'.length)), [
    'cds_armor_medium_*_01', 'cds_combat_heavy_*_01', 'cds_combat_medium_*_01', 'cds_combat_superheavy_*_01', 'cds_legacy_armor_heavy_*_01',
    'cds_legacy_armor_medium_*_01', 'fta_medium_*_01', 'kap_combat_heavy_*_01', 'kap_combat_heavy_*_02', 'kap_combat_light_*_02',
    'mrai_flightsuit_*_01', 'omc_utility_heavy_*_01', 'outlaw_legacy_armor_heavy_*_01', 'qrt_combat_medium_*_01', 'qrt_specialist_heavy_*_01',
    'qrt_specialist_medium_*_01', 'rrs_specialist_heavy_*_01', 'slaver_armor_heavy_*_01', 'vgl_flightsuit_*_01', 'vgl_utility_light_*_01'])
  assert.equal(hierarchy.families.filter(f => f.reviewReasons.includes('ARMOR_DUPLICATE_VARIANT_SLOT')).length, 0)
  for (const f of hierarchy.families.filter(x => x.kind === 'ARMOR_SET')) assert.equal(f.status, 'RESOLVED', f.familyKey)
})

test('Modified items are VALID_SPECIAL_VARIANT: visible, inside their structural set, never hidden by name', () => {
  const modified = source.blueprints.filter(b => /_9tails_/.test(b.sourceTag))
  assert.equal(modified.length, 16)
  for (const blueprint of modified) {
    const f = familyOfTag(live, blueprint.sourceTag)
    assert.deepEqual([f.kind, f.status], ['ARMOR_SET', 'RESOLVED'], blueprint.sourceTag)
    assert.ok(variant(f, '9tails_01').components.some(c => c.blueprintGuids.includes(blueprint.sourceGuid)))
  }
  const coda = live.byTag.get('BP_CRAFT_ksar_pistol_ballistic_01_spc')
  assert.equal(coda.productName, 'Coda Pistol (Modified)')
  assert.ok(familyOfTag(live, coda.sourceTag), 'the non-armor Modified item stays visible')
})

test('undersuits are no armor-set component: TCS-4 and FBL-8u stay separate resolved products despite the shared cds_undersuit_01 structure', () => {
  const tcsTag = 'BP_CRAFT_cds_undersuit_01_01_01'
  const fblTag = 'BP_CRAFT_cds_undersuit_01_02_02'
  const tcs = familyOfTag(live, tcsTag)
  const fbl = familyOfTag(live, fblTag)
  for (const [f, tag] of [[tcs, tcsTag], [fbl, fblTag]]) {
    assert.deepEqual([f.kind, f.status, f.reviewReasons, f.structuralKey], ['SINGLE', 'RESOLVED', [], null], tag)
    assert.deepEqual(f.variants.map(v => v.components.map(c => [c.slot, c.blueprintGuids])), [[['Undersuit', [live.byTag.get(tag).sourceGuid]]]])
  }
  assert.notEqual(tcs.familyKey, fbl.familyKey)
  assert.deepEqual(productNames(live, tcs), [['TCS-4 Undersuit']])
  assert.deepEqual(productNames(live, fbl), [['FBL-8u Undersuit SecondWind']])
  assert.equal(JSON.stringify(live.byTag.get(tcsTag).recipe.recipe), JSON.stringify(live.byTag.get(fblTag).recipe.recipe), 'same recipe')
  assert.equal(fingerprintOf(tcsTag), fingerprintOf(fblTag), 'same functional fingerprint')
})

test('no undersuit forms or joins an armor family; no review state is caused by the non-applicable set resolver', () => {
  const undersuitFamilies = hierarchy.families.filter(f => f.variants.some(v => v.components.some(c => c.slot === 'Undersuit')))
  assert.ok(undersuitFamilies.every(f => f.kind === 'SINGLE' && f.variants.length === 1 && f.variants[0].components.length === 1))
  assert.equal(undersuitFamilies.filter(f => f.status === 'RESOLVED').length, 13)
  assert.deepEqual(tally(undersuitFamilies.flatMap(f => f.reviewReasons)), { ARMOR_TAG_UNSUPPORTED: 12 }, 'only unsupported suit tags stay review')
  assert.equal(hierarchy.families.filter(f => (f.structuralKey ?? '').startsWith('ARMOR:') && f.reviewReasons.includes('FAMILY_NAME_CONFLICT')).length, 0)
  assert.equal(family.ARMOR_SET_SLOTS.has('Undersuit'), false)
})

// --- negatives -----------------------------------------------------------------

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const recipe = { slots: [{ name: 'Shell', material: { kind: 'RESOURCE', name: 'Iron' }, modifiers: [] }] }
const build = (rows, options) => family.buildFabricatorProductHierarchy(
  rows.map(([n, , tag, name]) => ({ sourceGuid: uuid(1000 + n), sourceTag: tag, productEntityClass: uuid(n), productName: name,
    manufacturer: null, gear: 'fpsgear', type: null, subtype: null, recipe: { status: 'RESOLVED', recipe } })),
  new Map(rows.map(([n, attachType, , name]) => [uuid(n), { entityClass: uuid(n), name, itemType: 'x', attachType, attachSubType: null,
    size: 1, manufacturer: null, manufacturerCode: null, source: {} }])), options)
const keys = result => result.families.map(f => [f.familyKey, f.kind, f.variants.map(v => v.variantKey)])

test('negative: different set numbers and different prefixes stay separate, even with identical names, recipe and fingerprint', () => {
  const result = build([
    [1, 'Char_Armor_Torso', 'BP_CRAFT_foo_armor_core_01_01_01', 'Foo Core'],
    [2, 'Char_Armor_Torso', 'BP_CRAFT_foo_armor_core_02_01_01', 'Foo Core'],
    [3, 'Char_Armor_Torso', 'BP_CRAFT_foo_combat_core_01_01_02', 'Foo Core'],
  ], { fingerprint: () => 'identical' })
  assert.deepEqual(keys(result), [
    ['ARMOR:foo_armor_*_01', 'ARMOR_SET', ['01_01']], ['ARMOR:foo_armor_*_02', 'ARMOR_SET', ['01_01']], ['ARMOR:foo_combat_*_01', 'ARMOR_SET', ['01_02']]])
})

test('negative: display names never create a family; the structure decides and names only veto', () => {
  const sameNameDifferentStructure = build([
    [1, 'Char_Armor_Helmet', 'BP_CRAFT_aaa_helmet_01_01_01', 'Shared Helmet'],
    [2, 'Char_Armor_Helmet', 'BP_CRAFT_bbb_helmet_01_01_02', 'Shared Helmet'],
  ])
  assert.equal(sameNameDifferentStructure.families.length, 2)
  const editions = build([
    [1, 'Char_Armor_Legs', 'BP_CRAFT_aaa_legs_01_01_01', 'Foo Legs'],
    [2, 'Char_Armor_Legs', 'BP_CRAFT_aaa_legs_01_crus01_01', 'Foo Legs Crusader'],
    [3, 'Char_Armor_Legs', 'BP_CRAFT_aaa_legs_01_01_hd_sec', 'Foo Legs Hurston'],
  ])
  assert.deepEqual(keys(editions), [['ARMOR:aaa_*_01', 'ARMOR_SET', ['01_01', '01_hd_sec', 'crus01_01']]])
})

test('negative: no slot synthesis and no edition synthesis — every variant / slot is exactly one source blueprint', () => {
  const result = build([
    [1, 'Char_Armor_Torso', 'BP_CRAFT_aaa_core_01_01_01', 'Foo Core'],
    [2, 'Char_Armor_Arms', 'BP_CRAFT_aaa_arms_01_9tails_01', 'Foo Arms (Modified)'],
  ])
  assert.deepEqual(result.families[0].variants.map(v => [v.variantKey, v.components.map(c => c.slot)]), [['01_01', ['Torso']], ['9tails_01', ['Arms']]])
  const live1 = hierarchy.families.filter(f => f.kind === 'ARMOR_SET')
  const members = live1.flatMap(f => f.variants.flatMap(v => v.components.map(c => [f.familyKey, v.variantKey, c])))
  for (const [familyKey, variantKey, component] of members) {
    const blueprint = live.byGuid.get(component.blueprintGuids[0])
    const parsed = family.parseArmorTag(blueprint.sourceTag, component.slot)
    assert.deepEqual([`ARMOR:${parsed.lineKey}`, parsed.variantKey], [familyKey, variantKey], blueprint.sourceTag)
  }
})

test('negative: undersuits sharing prefix and set number, recipe and fingerprint form no family and no name conflict', () => {
  const result = build([
    [1, 'Char_Armor_Undersuit', 'BP_CRAFT_aaa_undersuit_01_01_01', 'Foo Undersuit'],
    [2, 'Char_Armor_Undersuit', 'BP_CRAFT_aaa_undersuit_01_02_02', 'Bar Undersuit'],
    [3, 'Char_Armor_Undersuit', 'BP_CRAFT_aaa_undersuit_01_01_02', 'Foo Undersuit Red'],
  ], { fingerprint: () => 'identical' })
  assert.deepEqual(result.families.map(f => [f.kind, f.status, f.reviewReasons, f.variants[0].components[0].functional]),
    Array(3).fill(['SINGLE', 'RESOLVED', [], 'UNRESOLVED']))
  const withSet = build([
    [1, 'Char_Armor_Torso', 'BP_CRAFT_aaa_core_01_01_01', 'Foo Core'],
    [2, 'Char_Armor_Undersuit', 'BP_CRAFT_aaa_undersuit_01_01_01', 'Foo Undersuit'],
  ])
  assert.deepEqual(withSet.families.map(f => [f.kind, f.variants.flatMap(v => v.components.map(c => c.slot))]),
    [['ARMOR_SET', ['Torso']], ['SINGLE', ['Undersuit']]], 'an undersuit never becomes a set component')
})

test('negative: containers, unsupported suits, Glacis and Pioneer keep their review states', () => {
  assert.equal(hierarchy.families.filter(f => (f.structuralKey ?? '').startsWith('Container:') && f.reviewReasons.includes('FAMILY_NAME_CONFLICT')).length, 2)
  assert.deepEqual(familyOfTag(live, 'BP_CRAFT_cds_combat_superheavy_suit_01_01_01').reviewReasons, ['ARMOR_TAG_UNSUPPORTED'])
  assert.equal(hierarchy.families.filter(f => f.reviewReasons.includes('ARMOR_TAG_UNSUPPORTED')).length, 19)
  assert.deepEqual(familyOfTag(live, 'BP_CRAFT_SHLD_ORIG_S04_890J_SCItem').reviewReasons, ['MULTIPLE_BLUEPRINTS'])
  const pioneer = live.byTag.get('BP_CRAFT_COOL_S04_CNOU_Pioneer')
  assert.deepEqual(hierarchy.unresolvedBlueprints, [{ sourceGuid: pioneer.sourceGuid, reason: 'BLUEPRINT_OUTPUT_UNRESOLVED' }])
})
