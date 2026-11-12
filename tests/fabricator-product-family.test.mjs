import assert from 'node:assert/strict'
import test from 'node:test'
import { familyOfTag, loadFabricatorModule, loadLive, productNames } from './fabricator-fixture.mjs'

// Fabricator F1: Product Family -> Variant -> Slot -> Item -> Blueprint
// (owner decision D1 = A). Real LIVE mirror 4.10.2-live.12913470 plus
// synthetic No-Guess cases.

const live = await loadLive()
const family = await loadFabricatorModule('fabricator-product-family')
const { hierarchy, source } = live

const allComponents = hierarchy.families.flatMap(f => f.variants.flatMap(v => v.components))
const slotsOf = variant => variant.components.map(c => c.slot)

test('every LIVE blueprint appears exactly once: in one family component or as unresolved', () => {
  const guids = [...allComponents.flatMap(c => c.blueprintGuids), ...hierarchy.unresolvedBlueprints.map(u => u.sourceGuid)]
  assert.equal(guids.length, source.blueprints.length)
  assert.equal(new Set(guids).size, source.blueprints.length)
  assert.equal(source.blueprints.length, 1618)
})

test('Killshot: structural tag line with base and one variant; the magazine is not part of it', () => {
  const killshot = familyOfTag(live, 'BP_CRAFT_none_rifle_multi_01')
  assert.equal(killshot.familyKey, 'WeaponPersonal:none_rifle_multi_01')
  assert.equal(killshot.kind, 'TAG_LINE')
  assert.equal(killshot.status, 'RESOLVED')
  assert.deepEqual(killshot.variants.map(v => [v.variantKey, v.isBase]), [['', true], ['collector01', false]])
  assert.deepEqual(productNames(live, killshot), [['Killshot Rifle'], ['Killshot "Dominion Camo" Rifle']])
  assert.deepEqual(killshot.variants.map(slotsOf), [[null], [null]])
  const magazine = familyOfTag(live, 'BP_CRAFT_none_rifle_multi_01_mag')
  assert.notEqual(magazine.familyKey, killshot.familyKey)
  assert.equal(magazine.kind, 'SINGLE')
})

test('personal weapons and vehicle weapons form only verified tag lines', () => {
  const lines = hierarchy.families.filter(f => f.kind === 'TAG_LINE')
  const byAttach = lines.reduce((m, f) => ({ ...m, [f.familyKey.split(':')[0]]: (m[f.familyKey.split(':')[0]] ?? 0) + 1 }), {})
  assert.deepEqual(byAttach, { WeaponGun: 3, WeaponPersonal: 35 })
  for (const line of lines) {
    assert.equal(line.variants.filter(v => v.isBase).length, 1, line.familyKey)
    assert.equal(line.variants[0].isBase, true)
  }
})

test('Defiance: armor set with seven variants, Scorched keeps only its real slot, Modified line separate', () => {
  const defiance = familyOfTag(live, 'BP_CRAFT_slaver_armor_heavy_core_01_01_01')
  assert.equal(defiance.familyKey, 'ARMOR:slaver_armor_heavy_*_01_01')
  assert.equal(defiance.kind, 'ARMOR_SET')
  assert.equal(defiance.status, 'RESOLVED')
  assert.deepEqual(defiance.variants.map(v => v.variantKey), ['01', '03', '10', '11', '13', '14', '15'])
  for (const variant of defiance.variants.filter(v => v.variantKey !== '14')) {
    assert.deepEqual(slotsOf(variant), ['Helmet', 'Torso', 'Arms', 'Legs'])
  }
  const scorched = defiance.variants.find(v => v.variantKey === '14')
  assert.deepEqual(slotsOf(scorched), ['Torso'], 'missing slots stay missing, nothing is synthesized')
  assert.equal(live.byGuid.get(scorched.components[0].blueprintGuids[0]).productName, 'Defiance Core Scorched')
  assert.ok(defiance.variants.every(v => v.isBase === null), 'armor base variant is not structurally provable')

  const modified = familyOfTag(live, 'BP_CRAFT_slaver_armor_heavy_core_01_9tails_01')
  assert.equal(modified.familyKey, 'ARMOR:slaver_armor_heavy_*_01_9tails')
  assert.notEqual(modified.familyKey, defiance.familyKey)
  assert.deepEqual(modified.variants.map(slotsOf), [['Helmet', 'Torso', 'Arms', 'Legs']])
  assert.deepEqual(productNames(live, modified)[0], [
    'Defiance Helmet (Modified)', 'Defiance Core (Modified)', 'Defiance Arms (Modified)', 'Defiance Legs (Modified)'])
})

test('armor slot always equals the source attachType', () => {
  for (const component of allComponents) {
    const item = source.items.get(component.itemEntityClass)
    assert.equal(component.slot, family.ARMOR_SLOT_BY_ATTACH_TYPE[item.attachType] ?? null)
  }
})

test('slot-scoped name veto (F1.1): a set whose helmet is marketed under its own name stays one structural set', () => {
  const adp = familyOfTag(live, 'BP_CRAFT_cds_legacy_armor_heavy_legs_01_01_05')
  assert.equal(adp.familyKey, 'ARMOR:cds_legacy_armor_heavy_*_01_01')
  assert.equal(adp.kind, 'ARMOR_SET')
  assert.equal(adp.status, 'RESOLVED')
  assert.equal(adp.variants.length, 20)
  assert.ok(adp.variants.every(v => v.components.map(c => c.slot).join('/') === 'Helmet/Torso/Arms/Legs'))
  const green = adp.variants.find(v => v.variantKey === '05')
  assert.deepEqual(productNames(live, { variants: [green] })[0],
    ['Balor HCH Helmet Green', 'ADP Core Green', 'ADP Arms Green', 'ADP Legs Green'])
  // Only the container line keeps a name conflict; no armor line is vetoed any more.
  const conflicts = hierarchy.families.filter(f => f.reviewReasons.includes('FAMILY_NAME_CONFLICT'))
  assert.equal(conflicts.length, 2)
  assert.ok(conflicts.every(f => f.structuralKey.startsWith('Container:')))
})

test('names stay a pure veto: every resolved family is name-consistent per slot (armor) or per line', () => {
  for (const familyRow of hierarchy.families.filter(f => f.status === 'RESOLVED' && f.kind !== 'SINGLE')) {
    const groups = new Map()
    for (const variant of familyRow.variants) for (const c of variant.components) {
      const key = familyRow.kind === 'ARMOR_SET' ? c.slot : ''
      groups.set(key, [...(groups.get(key) ?? []), live.byGuid.get(c.blueprintGuids[0]).productName.split(/\s+/)[0]])
    }
    for (const [slot, tokens] of groups) assert.equal(new Set(tokens).size, 1, `${familyRow.familyKey} ${slot}`)
  }
})

test('unsupported armor tag shapes (suits) stay visible as REVIEW_REQUIRED singles', () => {
  const suit = familyOfTag(live, 'BP_CRAFT_cds_combat_superheavy_suit_01_01_01')
  assert.equal(suit.kind, 'SINGLE')
  assert.deepEqual(suit.reviewReasons, ['ARMOR_TAG_UNSUPPORTED'])
  assert.equal(hierarchy.families.filter(f => f.reviewReasons.includes('ARMOR_TAG_UNSUPPORTED')).length, 19)
})

test('item -> blueprint: Glacis keeps both blueprints without choosing one; Pioneer stays unresolved', () => {
  const statuses = [...hierarchy.itemBlueprints.values()].reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {})
  assert.deepEqual(statuses, { UNIQUE: 1615, MULTIPLE: 1 })

  const glacisBlueprints = source.blueprints.filter(b => b.productName === 'Glacis')
  assert.equal(glacisBlueprints.length, 2)
  const glacisItem = glacisBlueprints[0].productEntityClass
  assert.deepEqual(hierarchy.itemBlueprints.get(glacisItem), {
    status: 'MULTIPLE', blueprintGuids: glacisBlueprints.map(b => b.sourceGuid).sort(),
  })
  const glacis = hierarchy.families.find(f => f.familyKey === `ITEM:${glacisItem}`)
  assert.equal(glacis.status, 'REVIEW_REQUIRED')
  assert.deepEqual(glacis.reviewReasons, ['MULTIPLE_BLUEPRINTS'])
  assert.equal(glacis.variants[0].components[0].blueprintGuids.length, 2)

  const pioneer = live.byTag.get('BP_CRAFT_COOL_S04_CNOU_Pioneer')
  assert.deepEqual(hierarchy.unresolvedBlueprints, [{ sourceGuid: pioneer.sourceGuid, reason: 'BLUEPRINT_OUTPUT_UNRESOLVED' }])
  assert.equal(source.items.has(pioneer.productEntityClass), false)
})

// --- Synthetic No-Guess cases ------------------------------------------------

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const item = (n, attachType, name) => ({ entityClass: uuid(n), name, itemType: 'x', attachType, attachSubType: null,
  size: 1, manufacturer: null, manufacturerCode: null, source: {} })
const blueprint = (n, tag, productName) => ({ sourceGuid: uuid(1000 + n), sourceTag: tag, productEntityClass: uuid(n),
  productName, manufacturer: null, gear: 'fpsgear', type: null, subtype: null, recipe: { status: 'RESOLVED', recipe: null } })
const build = rows => family.buildFabricatorProductHierarchy(
  rows.map(([n, , tag, name]) => blueprint(n, tag, name)),
  new Map(rows.map(([n, attachType, , name]) => [uuid(n), item(n, attachType, name)])))

test('no name-only relation: identical names without a structural tag relation stay separate', () => {
  const result = build([
    [1, 'WeaponPersonal', 'BP_CRAFT_abc_rifle_01', 'Same Rifle'],
    [2, 'WeaponPersonal', 'BP_CRAFT_xyz_rifle_02', 'Same Rifle'],
    [3, 'WeaponPersonal', 'BP_CRAFT_abc_rifle_01x', 'Same Rifle Variant'],
  ])
  assert.equal(result.families.length, 3)
  assert.ok(result.families.every(f => f.kind === 'SINGLE' && f.status === 'RESOLVED'))
})

test('no cross-attachType relation: a magazine tag extending a weapon tag is not a variant', () => {
  const result = build([
    [1, 'WeaponPersonal', 'BP_CRAFT_abc_rifle_01', 'Foo Rifle'],
    [2, 'WeaponAttachment', 'BP_CRAFT_abc_rifle_01_mag', 'Foo Rifle Magazine'],
  ])
  assert.deepEqual(result.families.map(f => f.kind), ['SINGLE', 'SINGLE'])
})

test('names veto but never create: structural line with a missing or different name is ungrouped', () => {
  const conflict = build([
    [1, 'WeaponPersonal', 'BP_CRAFT_abc_rifle_01', 'Foo Rifle'],
    [2, 'WeaponPersonal', 'BP_CRAFT_abc_rifle_01_tint01', 'Bar Rifle'],
  ])
  assert.deepEqual(conflict.families.map(f => [f.kind, f.status, f.reviewReasons[0]]),
    [['SINGLE', 'REVIEW_REQUIRED', 'FAMILY_NAME_CONFLICT'], ['SINGLE', 'REVIEW_REQUIRED', 'FAMILY_NAME_CONFLICT']])
  const missing = build([
    [1, 'Char_Armor_Helmet', 'BP_CRAFT_foo_armor_helmet_01_01_01', 'Foo Helmet'],
    [2, 'Char_Armor_Legs', 'BP_CRAFT_foo_armor_legs_01_01_01', null],
  ])
  assert.ok(missing.families.every(f => f.reviewReasons[0] === 'FAMILY_NAME_MISSING'))
})

test('armor veto is slot-scoped: different names across slots pass, different names inside one slot veto', () => {
  const acrossSlots = build([
    [1, 'Char_Armor_Helmet', 'BP_CRAFT_foo_armor_helmet_01_01_01', 'Bar Helmet'],
    [2, 'Char_Armor_Legs', 'BP_CRAFT_foo_armor_legs_01_01_01', 'Foo Legs'],
    [3, 'Char_Armor_Helmet', 'BP_CRAFT_foo_armor_helmet_01_01_02', 'Bar Helmet Red'],
    [4, 'Char_Armor_Legs', 'BP_CRAFT_foo_armor_legs_01_01_02', 'Foo Legs Red'],
  ])
  assert.deepEqual(acrossSlots.families.map(f => [f.kind, f.status, f.variants.length]), [['ARMOR_SET', 'RESOLVED', 2]])
  const insideSlot = build([
    [1, 'Char_Armor_Legs', 'BP_CRAFT_foo_armor_legs_01_01_01', 'Foo Legs'],
    [2, 'Char_Armor_Legs', 'BP_CRAFT_foo_armor_legs_01_01_02', 'Baz Legs Red'],
    [3, 'Char_Armor_Helmet', 'BP_CRAFT_foo_armor_helmet_01_01_01', 'Foo Helmet'],
  ])
  assert.equal(insideSlot.families.length, 3)
  assert.ok(insideSlot.families.every(f => f.kind === 'SINGLE' && f.reviewReasons[0] === 'FAMILY_NAME_CONFLICT'))
})

test('armor: slot token must agree with attachType; duplicate variant slots are not merged', () => {
  const conflict = build([[1, 'Char_Armor_Helmet', 'BP_CRAFT_foo_armor_legs_01_01_01', 'Foo Legs']])
  assert.deepEqual(conflict.families[0].reviewReasons, ['ARMOR_SLOT_TOKEN_CONFLICT'])
  const duplicate = build([
    [1, 'Char_Armor_Helmet', 'BP_CRAFT_foo_armor_helmet_01_01_01', 'Foo Helmet'],
    [2, 'Char_Armor_Helmet', 'BP_CRAFT_foo_armor_helmet_01_01_01', 'Foo Helmet B'],
  ])
  assert.ok(duplicate.families.every(f => f.reviewReasons[0] === 'ARMOR_DUPLICATE_VARIANT_SLOT'))
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_foo_suit_01_01_01', 'Torso'), { ok: false, reason: 'ARMOR_TAG_UNSUPPORTED' })
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_a_helmet_b_helmet_01_01', 'Helmet'), { ok: false, reason: 'ARMOR_TAG_UNSUPPORTED' })
  assert.deepEqual(family.parseArmorTag('BP_CRAFT_foo_core_01_01_07', 'Torso'), { ok: true, lineKey: 'foo_*_01_01', variantKey: '07' })
})
