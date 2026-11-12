import { fabricatorCategoryKey } from './fabricator-labels'
import type { FabricatorPreparedSource } from './fabricator-live-source-cache'
import type { FabricatorFunctionalClass } from './fabricator-fingerprint'
import type { FabricatorArmorSlot, FabricatorFamily } from './fabricator-product-family'
import { ARMOR_SLOT_ORDER } from './fabricator-product-family'
import { normalizeFabricatorSize } from './fabricator-size'
import type { FabricatorBlueprint, FabricatorItem, FabricatorRecipeResult } from './fabricator-types'

// Compact, serializable Fabricator catalog for the client (F2).
//
// Built on the server from the prepared F1 source and hierarchy. It carries
// only what the workspace needs: families with their variants, components and
// blueprint choices, and the recipes (deduplicated, because variants share
// identical recipes). Raw SCMDB documents never reach the client. Family and
// variant identity are taken from F1 unchanged; nothing here regroups.

export type FabricatorMaterialView = {
  kind: 'RESOURCE' | 'ITEM'
  name: string
  unit: 'SCU' | 'COUNT'
  /** Source amount (SCU or pieces), for display. */
  amount: number
  /** Exact requirement as an integer string: micro-SCU for resources, pieces for items. */
  required: string
  minQuality: number
  vocabulary: 'RESOLVED' | 'UNRESOLVED'
}

export type FabricatorRecipeView = {
  status: FabricatorRecipeResult['status']
  issues: string[]
  craftTimeSeconds: number | null
  slots: { slotKey: string; name: string; material: FabricatorMaterialView }[]
}

/** One blueprint; components reference it by its index in `catalog.blueprints`. */
export type FabricatorBlueprintView = {
  tag: string
  productName: string | null
  recipe: number
}

export type FabricatorComponentView = {
  slot: FabricatorArmorSlot | null
  itemName: string | null
  manufacturer: string | null
  subcategory: string | null
  sizeLabel: string | null
  /** Blueprint indexes: one normally; several when the item has more than one blueprint (never auto-selected). */
  blueprints: number[]
  /** F1.1 functional comparison with the same slot of the other variants (never a calculation identity). */
  functional: FabricatorFunctionalClass
}

export type FabricatorVariantView = {
  variantKey: string
  isBase: boolean | null
  /**
   * Short display label of the variant ("Tactical", "Aqua", "Dominion Camo",
   * "Basis", "Standard"), derived only after identity resolution from the
   * product names inside the already resolved family; null when the names do
   * not yield one consistent label. Display only, never identity.
   */
  label: string | null
  components: FabricatorComponentView[]
}

export type FabricatorFamilyKind = FabricatorFamily['kind'] | 'UNRESOLVED_OUTPUT'

export type FabricatorFamilyView = {
  key: string
  kind: FabricatorFamilyKind
  status: 'RESOLVED' | 'REVIEW_REQUIRED'
  reviewReasons: string[]
  title: string
  /** True when SCMDB has no product name and the blueprint tag is shown instead. */
  titleFromTag: boolean
  /**
   * Display-only disambiguation when several families share the same title
   * (e.g. two separate Defiance armor lines): the first component's product
   * name. Never used for identity, grouping or search ranking of the title.
   */
  titleDetail: string | null
  categoryKey: string
  manufacturer: string | null
  sizeLabel: string | null
  subcategories: string[]
  /** Armor slots present in at least one variant, in fixed slot order. */
  slots: FabricatorArmorSlot[]
  variants: FabricatorVariantView[]
}

export type FabricatorCatalog = {
  version: string
  families: FabricatorFamilyView[]
  blueprints: FabricatorBlueprintView[]
  recipes: FabricatorRecipeView[]
}

function recipeView(result: FabricatorRecipeResult): FabricatorRecipeView {
  const recipe = result.recipe
  return {
    status: result.status,
    issues: result.status === 'RESOLVED' ? [] : [...result.issues],
    craftTimeSeconds: recipe?.craftTimeSeconds ?? null,
    slots: (recipe?.slots ?? []).map(slot => ({
      slotKey: slot.slotKey,
      name: slot.name,
      material: {
        kind: slot.material.kind,
        name: slot.material.name,
        unit: slot.material.unit,
        amount: slot.material.amount,
        required: slot.material.unit === 'SCU' ? String(slot.material.amountMicroScu) : String(slot.material.amount),
        minQuality: slot.material.minQuality,
        vocabulary: slot.material.vocabulary,
      },
    })),
  }
}

const same = <T>(values: T[]): T | null => (values.length > 0 && values.every(value => value === values[0]) ? values[0] : null)
const leadingToken = (name: string | null) => (name?.trim().split(/\s+/)[0] ?? null)
const words = (name: string | null) => (name ?? '').trim().split(/\s+/).filter(Boolean)

/**
 * Display-only set title for a resolved armor set: the leading name token used
 * by the most slots (CIG may market one slot, e.g. the helmet, under its own
 * name); ties go to the first slot in slot order. Never identity.
 */
export function armorSetTitle(slotNames: readonly { slot: FabricatorArmorSlot; name: string | null }[]): string | null {
  const slotsByToken = new Map<string, Set<FabricatorArmorSlot>>()
  for (const { slot, name } of slotNames) {
    const token = leadingToken(name)
    if (token) slotsByToken.set(token, (slotsByToken.get(token) ?? new Set()).add(slot))
  }
  let best: string | null = null
  let bestRank = Infinity
  let bestCount = 0
  for (const [token, slots] of slotsByToken) {
    const rank = Math.min(...[...slots].map(slot => ARMOR_SLOT_ORDER.indexOf(slot)))
    if (slots.size > bestCount || (slots.size === bestCount && rank < bestRank)) {
      best = token
      bestCount = slots.size
      bestRank = rank
    }
  }
  return best
}

/**
 * Variant-specific part of each name in one comparison group (same slot or
 * same tag line): the words left after removing the word prefix and suffix
 * shared by all names of the group. Groups with a single name yield ''.
 */
export function variantRemainders(names: readonly (string | null)[]): string[] {
  const split = names.map(words)
  if (split.length < 2) return split.map(() => '')
  const shortest = Math.min(...split.map(parts => parts.length))
  let prefix = 0
  while (prefix < shortest && split.every(parts => parts[prefix] === split[0][prefix])) prefix += 1
  let suffix = 0
  while (suffix < shortest - prefix && split.every(parts => parts[parts.length - 1 - suffix] === split[0][split[0].length - 1 - suffix])) suffix += 1
  return split.map(parts => parts.slice(prefix, parts.length - suffix).join(' ').replace(/^"(.*)"$/, '$1'))
}

/** One label per variant: all non-empty remainders must agree; empty means base / standard. */
export function variantLabel(remainders: readonly string[], isBase: boolean | null): string | null {
  const distinct = [...new Set(remainders.filter(Boolean))]
  if (distinct.length === 1) return distinct[0]
  if (distinct.length === 0) return isBase ? 'Basis' : 'Standard'
  return null
}

export function buildFabricatorCatalog(prepared: FabricatorPreparedSource): FabricatorCatalog {
  const { source, hierarchy } = prepared
  const byGuid = new Map<string, FabricatorBlueprint>(source.blueprints.map(blueprint => [blueprint.sourceGuid, blueprint]))
  const recipes: FabricatorRecipeView[] = []
  const recipeIndex = new Map<string, number>()
  const blueprints: FabricatorBlueprintView[] = []
  const blueprintIndex = new Map<string, number>()

  for (const blueprint of source.blueprints) {
    const view = recipeView(blueprint.recipe)
    const key = JSON.stringify(view)
    let index = recipeIndex.get(key)
    if (index === undefined) {
      index = recipes.length
      recipes.push(view)
      recipeIndex.set(key, index)
    }
    blueprintIndex.set(blueprint.sourceGuid, blueprints.length)
    blueprints.push({ tag: blueprint.sourceTag, productName: blueprint.productName, recipe: index })
  }

  const componentView = (item: FabricatorItem, slot: FabricatorArmorSlot | null, guids: string[], functional: FabricatorFunctionalClass): FabricatorComponentView => {
    const size = normalizeFabricatorSize(item)
    const first = byGuid.get(guids[0])
    return {
      slot,
      itemName: item.name,
      manufacturer: item.manufacturer,
      subcategory: first?.subtype ?? null,
      sizeLabel: size.status === 'RESOLVED' ? size.label : null,
      blueprints: guids.map(guid => blueprintIndex.get(guid)!),
      functional,
    }
  }

  const families: FabricatorFamilyView[] = hierarchy.families.map(family => {
    const sourceComponents = family.variants.flatMap(variant => variant.components)
    const variants: FabricatorVariantView[] = family.variants.map(variant => ({
      variantKey: variant.variantKey,
      isBase: variant.isBase,
      label: null,
      components: variant.components.map(component =>
        componentView(source.items.get(component.itemEntityClass)!, component.slot, component.blueprintGuids, component.functional)),
    }))
    if (variants.length > 1) {
      // Labels are derived per comparison group (slot, or the whole tag line) after identity resolution.
      const remainders = new Map<FabricatorComponentView, string>()
      const groups = new Map<string, FabricatorComponentView[]>()
      for (const component of variants.flatMap(variant => variant.components)) {
        groups.set(component.slot ?? '', [...(groups.get(component.slot ?? '') ?? []), component])
      }
      for (const group of groups.values()) {
        const parts = variantRemainders(group.map(component => blueprints[component.blueprints[0]].productName))
        group.forEach((component, index) => remainders.set(component, parts[index]))
      }
      for (const variant of variants) variant.label = variantLabel(variant.components.map(c => remainders.get(c) ?? ''), variant.isBase)
      // The same source name can occur on two variants; keep labels distinguishable without inventing names.
      const labelCounts = new Map<string, number>()
      for (const variant of variants) if (variant.label) labelCounts.set(variant.label, (labelCounts.get(variant.label) ?? 0) + 1)
      for (const variant of variants) {
        if (variant.label && (labelCounts.get(variant.label) ?? 0) > 1) variant.label = `${variant.label} · ${variant.variantKey}`
      }
    }
    const components = variants.flatMap(variant => variant.components)
    const categoryKeys = sourceComponents.map(component => fabricatorCategoryKey(source.items.get(component.itemEntityClass)!.attachType))
    const firstBlueprint = byGuid.get(sourceComponents[0].blueprintGuids[0])!

    let title: string | null
    if (family.kind === 'ARMOR_SET') {
      title = armorSetTitle(components.map(component => ({ slot: component.slot!, name: blueprints[component.blueprints[0]].productName })))
    }
    else if (family.kind === 'TAG_LINE') title = blueprints[variants.find(v => v.isBase)!.components[0].blueprints[0]].productName
    else if (components[0].blueprints.length > 1) title = components[0].itemName
    else title = firstBlueprint.productName

    const slots = ARMOR_SLOT_ORDER.filter(slot => components.some(component => component.slot === slot))
    return {
      key: family.familyKey,
      kind: family.kind,
      status: family.status,
      reviewReasons: [...family.reviewReasons, ...(title === null ? ['PRODUCT_NAME_MISSING'] : [])],
      title: title ?? firstBlueprint.sourceTag,
      titleFromTag: title === null,
      titleDetail: null,
      categoryKey: same(categoryKeys) ?? 'UNKNOWN',
      manufacturer: same(components.map(component => component.manufacturer)),
      sizeLabel: same(components.map(component => component.sizeLabel)),
      subcategories: [...new Set(components.map(component => component.subcategory).filter((s): s is string => s !== null))],
      slots,
      variants,
    }
  })

  for (const unresolved of hierarchy.unresolvedBlueprints) {
    const blueprint = byGuid.get(unresolved.sourceGuid)!
    families.push({
      key: `BLUEPRINT:${blueprint.sourceGuid}`,
      kind: 'UNRESOLVED_OUTPUT',
      status: 'REVIEW_REQUIRED',
      reviewReasons: ['BLUEPRINT_OUTPUT_UNRESOLVED', ...(blueprint.productName === null ? ['PRODUCT_NAME_MISSING'] : [])],
      title: blueprint.productName ?? blueprint.sourceTag,
      titleFromTag: blueprint.productName === null,
      titleDetail: null,
      categoryKey: 'UNKNOWN',
      manufacturer: blueprint.manufacturer,
      sizeLabel: null,
      subcategories: blueprint.subtype ? [blueprint.subtype] : [],
      slots: [],
      variants: [{
        variantKey: '',
        isBase: null,
        label: null,
        components: [{
          slot: null, itemName: null, manufacturer: blueprint.manufacturer, subcategory: blueprint.subtype,
          sizeLabel: null, blueprints: [blueprintIndex.get(blueprint.sourceGuid)!], functional: 'UNRESOLVED',
        }],
      }],
    })
  }

  const titleCounts = new Map<string, number>()
  for (const family of families) titleCounts.set(family.title, (titleCounts.get(family.title) ?? 0) + 1)
  for (const family of families) {
    if ((titleCounts.get(family.title) ?? 0) < 2) continue
    const components = family.variants[0].components
    const named = components.find(component => leadingToken(blueprints[component.blueprints[0]].productName) === family.title) ?? components[0]
    family.titleDetail = blueprints[named.blueprints[0]].productName ?? named.itemName
  }

  return { version: source.version, families, blueprints, recipes }
}
