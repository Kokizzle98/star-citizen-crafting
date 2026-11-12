import { classifyFunctionalGroup, type FabricatorFunctionalClass } from './fabricator-fingerprint'
import type { FabricatorBlueprint, FabricatorItem } from './fabricator-types'

// Product Family -> Variant / Skin -> Component / Slot -> Item -> Blueprint
// (Fabricator F1, owner decision D1 = A).
//
// Relations are created ONLY from deterministic structural source relations:
//
// - item -> blueprint: exact `productEntityClass` == item `entityClass`;
// - armor slot: the item's SCMDB `attachType` (never the name);
// - armor set and variant (Armor Family Key V2, owner decision OD-FAB-GROUP-04,
//   F1.2): the blueprint tag structure `BP_CRAFT_<prefix>_<slotToken>_<SetNr>_<rest>`.
//   The family is `<prefix>` + `<SetNr>`, the edition / variant is the complete
//   structural remainder after the set number (multi-part suffixes stay whole),
//   and the slot token must agree with `attachType`. Only slots with a
//   multi-part armor-set semantics take part (ARMOR_SET_SLOTS); an undersuit
//   (`Char_Armor_Undersuit`) is a product of its own and never joins a set or
//   another undersuit through the V2 key;
// - other items (weapons and the rest): within one `attachType`, a blueprint
//   tag that extends another blueprint tag by `_<suffix>` is a variant of it.
//
// Product names never create a relation. They act only as a consistency veto:
// when the members of a structural family do not share the same leading name
// token, the family is not formed and every member stays ungrouped as
// REVIEW_REQUIRED. For armor sets the veto is scoped to one functional slot
// (owner decision OD-FAB-GROUP-01, F1.1): CIG may market one slot of a set
// under its own name (e.g. a helmet), so names must agree inside each slot,
// not across slots. Unsupported shapes stay visible; nothing is synthesized.
//
// After a family is formed structurally, the functional crafting fingerprint
// classifies the members of each slot across variants (OD-FAB-GROUP-02/03).
// The classification never forms, splits or merges a family.

export type FabricatorArmorSlot = 'Helmet' | 'Torso' | 'Arms' | 'Legs' | 'Backpack' | 'Undersuit'

export const ARMOR_SLOT_BY_ATTACH_TYPE: Readonly<Record<string, FabricatorArmorSlot>> = Object.freeze({
  Char_Armor_Helmet: 'Helmet',
  Char_Armor_Torso: 'Torso',
  Char_Armor_Arms: 'Arms',
  Char_Armor_Legs: 'Legs',
  Char_Armor_Backpack: 'Backpack',
  Char_Armor_Undersuit: 'Undersuit',
})

export const ARMOR_SLOT_ORDER: readonly FabricatorArmorSlot[] = ['Helmet', 'Torso', 'Arms', 'Legs', 'Backpack', 'Undersuit']

/**
 * Slots that are components of a multi-part armor set (Armor Family Key V2).
 * `Undersuit` is excluded: a shared `<prefix>_<SetNr>` is no product-family
 * evidence for undersuits (owner decision, F1.2).
 */
export const ARMOR_SET_SLOTS: ReadonlySet<FabricatorArmorSlot> = new Set(['Helmet', 'Torso', 'Arms', 'Legs', 'Backpack'])

const ARMOR_SLOT_TOKENS: Readonly<Record<string, FabricatorArmorSlot>> = Object.freeze({
  helmet: 'Helmet', core: 'Torso', torso: 'Torso', arms: 'Arms', legs: 'Legs', backpack: 'Backpack', undersuit: 'Undersuit',
})

const TAG_PREFIX = 'BP_CRAFT_'

export type FabricatorItemBlueprintResolution =
  | { status: 'UNIQUE'; blueprintGuid: string }
  | { status: 'MULTIPLE'; blueprintGuids: string[] }
  | { status: 'NONE' }

export type FabricatorComponent = {
  /** Armor slot from `attachType`; null for items without a slot level. */
  slot: FabricatorArmorSlot | null
  itemEntityClass: string
  /** Exactly one guid unless the item is produced by several blueprints (then REVIEW_REQUIRED). */
  blueprintGuids: string[]
  /** Functional comparison with the same slot of the other variants of this family (F1.1). */
  functional: FabricatorFunctionalClass
}

export type FabricatorVariant = {
  /** Structural variant key from the blueprint tag ('' for the structural base of a tag line). */
  variantKey: string
  /** true/false where the structure proves it (tag lines); null where it does not (armor). */
  isBase: boolean | null
  components: FabricatorComponent[]
}

export type FabricatorFamilyReviewReason =
  | 'FAMILY_NAME_CONFLICT'
  | 'FAMILY_NAME_MISSING'
  | 'ARMOR_TAG_UNSUPPORTED'
  | 'ARMOR_SLOT_TOKEN_CONFLICT'
  | 'ARMOR_DUPLICATE_VARIANT_SLOT'
  | 'MULTIPLE_BLUEPRINTS'

export type FabricatorFamily = {
  familyKey: string
  kind: 'ARMOR_SET' | 'TAG_LINE' | 'SINGLE'
  status: 'RESOLVED' | 'REVIEW_REQUIRED'
  reviewReasons: FabricatorFamilyReviewReason[]
  /** The structural line the member was derived from, also kept when the family was vetoed. */
  structuralKey: string | null
  variants: FabricatorVariant[]
}

export type FabricatorUnresolvedBlueprint = { sourceGuid: string; reason: 'BLUEPRINT_OUTPUT_UNRESOLVED' }

export type FabricatorProductHierarchy = {
  families: FabricatorFamily[]
  itemBlueprints: Map<string, FabricatorItemBlueprintResolution>
  unresolvedBlueprints: FabricatorUnresolvedBlueprint[]
}

type Member = { item: FabricatorItem; blueprint: FabricatorBlueprint; stem: string }

const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

/** item -> blueprint(s) by exact productEntityClass; blueprints without an item stay unresolved. */
export function resolveItemBlueprints(
  blueprints: readonly FabricatorBlueprint[],
  items: ReadonlyMap<string, FabricatorItem>,
): { itemBlueprints: Map<string, FabricatorItemBlueprintResolution>; unresolvedBlueprints: FabricatorUnresolvedBlueprint[] } {
  const byItem = new Map<string, string[]>()
  const unresolvedBlueprints: FabricatorUnresolvedBlueprint[] = []
  for (const blueprint of blueprints) {
    if (!items.has(blueprint.productEntityClass)) {
      unresolvedBlueprints.push({ sourceGuid: blueprint.sourceGuid, reason: 'BLUEPRINT_OUTPUT_UNRESOLVED' })
      continue
    }
    const list = byItem.get(blueprint.productEntityClass) ?? []
    list.push(blueprint.sourceGuid)
    byItem.set(blueprint.productEntityClass, list)
  }
  const itemBlueprints = new Map<string, FabricatorItemBlueprintResolution>()
  for (const entityClass of items.keys()) {
    const guids = byItem.get(entityClass)
    if (!guids) itemBlueprints.set(entityClass, { status: 'NONE' })
    else if (guids.length === 1) itemBlueprints.set(entityClass, { status: 'UNIQUE', blueprintGuid: guids[0] })
    else itemBlueprints.set(entityClass, { status: 'MULTIPLE', blueprintGuids: [...guids].sort() })
  }
  return { itemBlueprints, unresolvedBlueprints }
}

type ArmorParse =
  | { ok: true; lineKey: string; variantKey: string }
  | { ok: false; reason: 'ARMOR_TAG_UNSUPPORTED' | 'ARMOR_SLOT_TOKEN_CONFLICT' }

const SET_NUMBER = /^\d+$/

/**
 * Armor Family Key V2: parses `<prefix>_<slotToken>_<SetNr>_<rest>`. The family
 * line is `<prefix>_*_<SetNr>`, the variant is the complete `<rest>` (all of its
 * segments, never only the last one). The slot itself always comes from attachType.
 */
export function parseArmorTag(sourceTag: string, slot: FabricatorArmorSlot): ArmorParse {
  if (!sourceTag.startsWith(TAG_PREFIX)) return { ok: false, reason: 'ARMOR_TAG_UNSUPPORTED' }
  const tokens = sourceTag.slice(TAG_PREFIX.length).split('_')
  const slotIndexes = tokens.flatMap((token, index) => (token.toLowerCase() in ARMOR_SLOT_TOKENS ? [index] : []))
  if (slotIndexes.length !== 1) return { ok: false, reason: 'ARMOR_TAG_UNSUPPORTED' }
  const index = slotIndexes[0]
  const before = tokens.slice(0, index)
  const after = tokens.slice(index + 1)
  if (before.length === 0 || after.length < 2 || !SET_NUMBER.test(after[0]) || [...before, ...after].some(token => token.length === 0)) {
    return { ok: false, reason: 'ARMOR_TAG_UNSUPPORTED' }
  }
  if (ARMOR_SLOT_TOKENS[tokens[index].toLowerCase()] !== slot) return { ok: false, reason: 'ARMOR_SLOT_TOKEN_CONFLICT' }
  return {
    ok: true,
    lineKey: [...before, '*', after[0]].join('_'),
    variantKey: after.slice(1).join('_'),
  }
}

function leadingNameToken(name: string | null): string | null {
  if (name === null) return null
  const token = name.trim().split(/\s+/)[0]
  return token.length > 0 ? token : null
}

/** Consistency veto only: it can block a structural family, never create one. */
function nameVeto(members: readonly Member[]): FabricatorFamilyReviewReason | null {
  const tokens = members.map(member => leadingNameToken(member.blueprint.productName))
  if (tokens.some(token => token === null)) return 'FAMILY_NAME_MISSING'
  return new Set(tokens).size === 1 ? null : 'FAMILY_NAME_CONFLICT'
}

/** Armor: the veto applies inside each functional slot; the first failing slot decides the reason. */
function slotScopedNameVeto(entries: readonly { member: Member; slot: FabricatorArmorSlot }[]): FabricatorFamilyReviewReason | null {
  const bySlot = new Map<FabricatorArmorSlot, Member[]>()
  for (const entry of entries) bySlot.set(entry.slot, [...(bySlot.get(entry.slot) ?? []), entry.member])
  for (const slot of ARMOR_SLOT_ORDER) {
    const members = bySlot.get(slot)
    const veto = members ? nameVeto(members) : null
    if (veto) return veto
  }
  return null
}

function component(member: Member, slot: FabricatorArmorSlot | null): FabricatorComponent {
  return { slot, itemEntityClass: member.item.entityClass, blueprintGuids: [member.blueprint.sourceGuid], functional: 'UNRESOLVED' }
}

function single(
  member: { item: FabricatorItem; blueprintGuids: string[] },
  status: FabricatorFamily['status'],
  reviewReasons: FabricatorFamilyReviewReason[],
  structuralKey: string | null,
): FabricatorFamily {
  const slot = ARMOR_SLOT_BY_ATTACH_TYPE[member.item.attachType] ?? null
  return {
    familyKey: `ITEM:${member.item.entityClass}`,
    kind: 'SINGLE',
    status,
    reviewReasons,
    structuralKey,
    variants: [{
      variantKey: '',
      isBase: null,
      components: [{ slot, itemEntityClass: member.item.entityClass, blueprintGuids: member.blueprintGuids, functional: 'UNRESOLVED' }],
    }],
  }
}

function vetoedSingles(members: readonly Member[], reason: FabricatorFamilyReviewReason, structuralKey: string) {
  return members.map(member => single({ item: member.item, blueprintGuids: [member.blueprint.sourceGuid] },
    'REVIEW_REQUIRED', [reason], structuralKey))
}

function armorFamilies(members: readonly Member[]): FabricatorFamily[] {
  const families: FabricatorFamily[] = []
  const lines = new Map<string, { member: Member; variantKey: string; slot: FabricatorArmorSlot }[]>()

  for (const member of members) {
    const slot = ARMOR_SLOT_BY_ATTACH_TYPE[member.item.attachType]
    const parsed = parseArmorTag(member.blueprint.sourceTag, slot)
    if (!parsed.ok) {
      families.push(single({ item: member.item, blueprintGuids: [member.blueprint.sourceGuid] },
        'REVIEW_REQUIRED', [parsed.reason], null))
      continue
    }
    if (!ARMOR_SET_SLOTS.has(slot)) {
      // Valid tag, but the set resolver does not apply: the item stays its own resolved product.
      families.push(single({ item: member.item, blueprintGuids: [member.blueprint.sourceGuid] }, 'RESOLVED', [], null))
      continue
    }
    const line = lines.get(parsed.lineKey) ?? []
    line.push({ member, variantKey: parsed.variantKey, slot })
    lines.set(parsed.lineKey, line)
  }

  for (const [lineKey, entries] of lines) {
    const structuralKey = `ARMOR:${lineKey}`
    const seen = new Set<string>()
    const duplicate = entries.some(entry => {
      const key = `${entry.variantKey}\u0000${entry.slot}`
      if (seen.has(key)) return true
      seen.add(key)
      return false
    })
    if (duplicate) {
      families.push(...vetoedSingles(entries.map(entry => entry.member), 'ARMOR_DUPLICATE_VARIANT_SLOT', structuralKey))
      continue
    }
    const veto = slotScopedNameVeto(entries)
    if (veto) {
      families.push(...vetoedSingles(entries.map(entry => entry.member), veto, structuralKey))
      continue
    }
    const variants = new Map<string, FabricatorComponent[]>()
    for (const entry of entries) {
      const list = variants.get(entry.variantKey) ?? []
      list.push(component(entry.member, entry.slot))
      variants.set(entry.variantKey, list)
    }
    families.push({
      familyKey: structuralKey,
      kind: 'ARMOR_SET',
      status: 'RESOLVED',
      reviewReasons: [],
      structuralKey,
      variants: [...variants.entries()]
        .sort(([a], [b]) => naturalCompare(a, b))
        .map(([variantKey, components]) => ({
          variantKey,
          isBase: null,
          components: components.sort((a, b) => ARMOR_SLOT_ORDER.indexOf(a.slot!) - ARMOR_SLOT_ORDER.indexOf(b.slot!)),
        })),
    })
  }
  return families
}

function tagLineFamilies(members: readonly Member[]): FabricatorFamily[] {
  const families: FabricatorFamily[] = []
  const byAttachType = new Map<string, Member[]>()
  for (const member of members) {
    const list = byAttachType.get(member.item.attachType) ?? []
    list.push(member)
    byAttachType.set(member.item.attachType, list)
  }

  for (const [attachType, group] of byAttachType) {
    const stems = new Set(group.map(member => member.stem))
    const roots = new Map<string, Member[]>()
    for (const member of group) {
      let root = member.stem
      for (const candidate of stems) {
        if (candidate !== member.stem && member.stem.startsWith(`${candidate}_`) && candidate.length < root.length) {
          root = candidate
        }
      }
      const list = roots.get(root) ?? []
      list.push(member)
      roots.set(root, list)
    }

    for (const [root, line] of roots) {
      const structuralKey = `${attachType}:${root}`
      if (line.length === 1) {
        families.push(single({ item: line[0].item, blueprintGuids: [line[0].blueprint.sourceGuid] }, 'RESOLVED', [], structuralKey))
        continue
      }
      const veto = nameVeto(line)
      if (veto) {
        families.push(...vetoedSingles(line, veto, structuralKey))
        continue
      }
      families.push({
        familyKey: structuralKey,
        kind: 'TAG_LINE',
        status: 'RESOLVED',
        reviewReasons: [],
        structuralKey,
        variants: line
          .map(member => ({
            variantKey: member.stem === root ? '' : member.stem.slice(root.length + 1),
            isBase: member.stem === root,
            components: [component(member, null)],
          }))
          .sort((a, b) => Number(b.isBase) - Number(a.isBase) || naturalCompare(a.variantKey, b.variantKey)),
      })
    }
  }
  return families
}

/**
 * Builds the product hierarchy. Every blueprint ends up exactly once: either
 * inside one family component or in `unresolvedBlueprints`.
 */
export type FabricatorHierarchyOptions = {
  /** Functional crafting fingerprint per concrete item (F1.1); without it every component stays UNRESOLVED. */
  fingerprint?: (blueprint: FabricatorBlueprint, item: FabricatorItem) => string | null
}

/**
 * Classifies each slot of a structurally formed family across its variants.
 * Components that cannot be compared (single member, several blueprints,
 * no fingerprint) stay UNRESOLVED.
 */
function classifyFamily(
  family: FabricatorFamily,
  byGuid: ReadonlyMap<string, FabricatorBlueprint>,
  items: ReadonlyMap<string, FabricatorItem>,
  fingerprint: NonNullable<FabricatorHierarchyOptions['fingerprint']>,
): void {
  const groups = new Map<string, FabricatorComponent[]>()
  for (const variant of family.variants) {
    for (const component of variant.components) {
      const key = component.slot ?? ''
      groups.set(key, [...(groups.get(key) ?? []), component])
    }
  }
  for (const group of groups.values()) {
    const fingerprints = group.map(component => component.blueprintGuids.length === 1
      ? fingerprint(byGuid.get(component.blueprintGuids[0])!, items.get(component.itemEntityClass)!)
      : null)
    classifyFunctionalGroup(fingerprints).forEach((functional, index) => { group[index].functional = functional })
  }
}

export function buildFabricatorProductHierarchy(
  blueprints: readonly FabricatorBlueprint[],
  items: ReadonlyMap<string, FabricatorItem>,
  options: FabricatorHierarchyOptions = {},
): FabricatorProductHierarchy {
  const { itemBlueprints, unresolvedBlueprints } = resolveItemBlueprints(blueprints, items)
  const byGuid = new Map(blueprints.map(blueprint => [blueprint.sourceGuid, blueprint]))
  const families: FabricatorFamily[] = []
  const armor: Member[] = []
  const others: Member[] = []

  for (const [entityClass, resolution] of itemBlueprints) {
    const item = items.get(entityClass)!
    if (resolution.status === 'NONE') continue
    if (resolution.status === 'MULTIPLE') {
      families.push(single({ item, blueprintGuids: resolution.blueprintGuids }, 'REVIEW_REQUIRED', ['MULTIPLE_BLUEPRINTS'], null))
      continue
    }
    const blueprint = byGuid.get(resolution.blueprintGuid)!
    const stem = blueprint.sourceTag.startsWith(TAG_PREFIX) ? blueprint.sourceTag.slice(TAG_PREFIX.length) : blueprint.sourceTag
    const member = { item, blueprint, stem }
    if (item.attachType in ARMOR_SLOT_BY_ATTACH_TYPE) armor.push(member)
    else others.push(member)
  }

  families.push(...armorFamilies(armor), ...tagLineFamilies(others))
  families.sort((a, b) => naturalCompare(a.familyKey, b.familyKey))
  if (options.fingerprint) {
    for (const family of families) {
      if (family.variants.length > 1) classifyFamily(family, byGuid, items, options.fingerprint)
    }
  }
  return { families, itemBlueprints, unresolvedBlueprints }
}
