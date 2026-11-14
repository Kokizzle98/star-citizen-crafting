import type {
  FabricatorMaterial,
  FabricatorModifierGroup,
  FabricatorModifierSegment,
  FabricatorPropertyDefinition,
  FabricatorRecipe,
  FabricatorRecipeIssue,
  FabricatorRecipeResult,
  FabricatorRecipeSlot,
} from './fabricator-types'

// Strict blueprint -> recipe reader for the Fabricator (F1).
//
// Unlike the catalog reader in lib/blueprints (which deliberately drops
// modifiers for the database catalog), this reader keeps the quality
// modifiers. Every source field is validated explicitly; an unknown shape is
// never interpreted. A blueprint whose recipe cannot be read exactly stays
// visible as REVIEW_REQUIRED with the concrete issues.

export const QUALITY_MIN = 0
export const QUALITY_MAX = 1000

const SLOT_KEYS = new Set(['name', 'options', 'modifiers'])
const OPTION_KEYS = new Set(['type', 'quantity', 'minQuality', 'resourceName', 'itemName', 'modifiers'])
const MODIFIER_KEYS = new Set([
  'startQuality', 'endQuality', 'modifierAtStart', 'modifierAtEnd', 'additive', 'propertyName', 'propertyKey',
])

export type FabricatorRecipeContext = {
  datasetVersion: string
  resources: ReadonlySet<string>
  items: ReadonlySet<string>
  properties: ReadonlyMap<string, FabricatorPropertyDefinition>
}

class RecipeIssue extends Error {
  constructor(readonly issue: FabricatorRecipeIssue) {
    super(issue)
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function qualityBound(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= QUALITY_MIN && (value as number) <= QUALITY_MAX
}

function onlyKeys(input: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(input).every(key => allowed.has(key))
}

/** Exact SCU -> micro-SCU conversion; fails closed when the value is not representable. */
export function scuToMicroScu(amount: number): number | null {
  if (!finite(amount) || amount <= 0) return null
  const micro = Math.round(amount * 1_000_000)
  if (!Number.isSafeInteger(micro) || Math.abs(micro - amount * 1_000_000) > 1e-3) return null
  return micro
}

function readMaterial(input: unknown, context: FabricatorRecipeContext): FabricatorMaterial {
  if (!plainObject(input) || !onlyKeys(input, OPTION_KEYS)) throw new RecipeIssue('RECIPE_MATERIAL_INVALID')
  if (input.modifiers !== undefined && input.modifiers !== null) {
    // Option-level modifiers do not occur in the verified dataset; never guess their meaning.
    throw new RecipeIssue('MODIFIER_SHAPE_INVALID')
  }
  if (!qualityBound(input.minQuality)) throw new RecipeIssue('RECIPE_MATERIAL_INVALID')

  if (input.type === 'resource') {
    if (!nonempty(input.resourceName) || input.itemName !== undefined) throw new RecipeIssue('RECIPE_MATERIAL_INVALID')
    const amount = input.quantity
    if (!finite(amount) || amount <= 0) throw new RecipeIssue('RECIPE_MATERIAL_INVALID')
    const amountMicroScu = scuToMicroScu(amount)
    if (amountMicroScu === null) throw new RecipeIssue('RECIPE_MATERIAL_INVALID')
    return {
      kind: 'RESOURCE', name: input.resourceName, datasetVersion: context.datasetVersion, amount, unit: 'SCU',
      amountMicroScu, minQuality: input.minQuality,
      vocabulary: context.resources.has(input.resourceName) ? 'RESOLVED' : 'UNRESOLVED',
    }
  }

  if (input.type === 'item') {
    if (!nonempty(input.itemName) || input.resourceName !== undefined) throw new RecipeIssue('RECIPE_MATERIAL_INVALID')
    const amount = input.quantity
    if (!Number.isSafeInteger(amount) || (amount as number) <= 0) throw new RecipeIssue('RECIPE_MATERIAL_INVALID')
    return {
      kind: 'ITEM', name: input.itemName, datasetVersion: context.datasetVersion, amount: amount as number,
      unit: 'COUNT', amountMicroScu: null, minQuality: input.minQuality,
      vocabulary: context.items.has(input.itemName) ? 'RESOLVED' : 'UNRESOLVED',
    }
  }

  throw new RecipeIssue('RECIPE_MATERIAL_INVALID')
}

/**
 * Validates the source modifiers of one slot and groups them by property.
 * Fails closed on any unknown field, out-of-range or non-integer quality bound,
 * non-finite modifier value, overlapping segments, mixed additive and
 * multiplicative segments for one property, or an inconsistent point segment.
 */
export function readSlotModifiers(
  input: unknown,
  properties: ReadonlyMap<string, FabricatorPropertyDefinition>,
): FabricatorModifierGroup[] {
  if (input === null || input === undefined) return []
  if (!Array.isArray(input)) throw new RecipeIssue('MODIFIER_SHAPE_INVALID')

  const groups = new Map<string, { additive: boolean; segments: FabricatorModifierSegment[] }>()
  for (const raw of input) {
    if (!plainObject(raw) || !onlyKeys(raw, MODIFIER_KEYS)) throw new RecipeIssue('MODIFIER_SHAPE_INVALID')
    const { startQuality, endQuality, modifierAtStart, modifierAtEnd, propertyKey, propertyName } = raw
    if (!qualityBound(startQuality) || !qualityBound(endQuality) || endQuality < startQuality ||
        !finite(modifierAtStart) || !finite(modifierAtEnd) || !nonempty(propertyKey) || !nonempty(propertyName)) {
      throw new RecipeIssue('MODIFIER_SHAPE_INVALID')
    }
    if (raw.additive !== undefined && typeof raw.additive !== 'boolean') throw new RecipeIssue('MODIFIER_SHAPE_INVALID')
    if (startQuality === endQuality && modifierAtStart !== modifierAtEnd) throw new RecipeIssue('MODIFIER_SHAPE_INVALID')
    if (!properties.has(propertyKey)) throw new RecipeIssue('MODIFIER_PROPERTY_UNKNOWN')

    const additive = raw.additive === true
    const group = groups.get(propertyKey) ?? { additive, segments: [] }
    if (group.additive !== additive) throw new RecipeIssue('MODIFIER_SHAPE_INVALID')
    group.segments.push({ startQuality, endQuality, modifierAtStart, modifierAtEnd })
    groups.set(propertyKey, group)
  }

  return [...groups.entries()].map(([propertyKey, group]) => {
    const segments = [...group.segments].sort((a, b) => a.startQuality - b.startQuality)
    for (let i = 1; i < segments.length; i += 1) {
      if (segments[i].startQuality <= segments[i - 1].endQuality) throw new RecipeIssue('MODIFIER_SHAPE_INVALID')
    }
    const fullCoverage = segments[0].startQuality === QUALITY_MIN &&
      segments[segments.length - 1].endQuality === QUALITY_MAX &&
      segments.every((segment, i) => i === 0 || segment.startQuality === segments[i - 1].endQuality + 1)
    return {
      propertyKey,
      operation: group.additive ? 'ADDITIVE' : 'MULTIPLICATIVE',
      segments,
      fullCoverage,
    } satisfies FabricatorModifierGroup
  })
}

function readSlot(input: unknown, index: number, context: FabricatorRecipeContext): FabricatorRecipeSlot {
  if (!plainObject(input) || !onlyKeys(input, SLOT_KEYS) || !nonempty(input.name) || !Array.isArray(input.options)) {
    throw new RecipeIssue('RECIPE_SHAPE_INVALID')
  }
  if (input.options.length !== 1) throw new RecipeIssue('RECIPE_SLOT_OPTION_COUNT_UNSUPPORTED')
  return {
    slotKey: String(index),
    name: input.name,
    material: readMaterial(input.options[0], context),
    modifiers: readSlotModifiers(input.modifiers, context.properties),
  }
}

/** Reads the recipe of one raw SCMDB blueprint (`tiers`) strictly. Never throws. */
export function readFabricatorRecipe(tiers: unknown, context: FabricatorRecipeContext): FabricatorRecipeResult {
  try {
    if (!Array.isArray(tiers)) throw new RecipeIssue('RECIPE_SHAPE_INVALID')
    if (tiers.length !== 1) throw new RecipeIssue('RECIPE_TIER_COUNT_UNSUPPORTED')
    const tier = tiers[0]
    if (!plainObject(tier) || !Array.isArray(tier.slots) ||
        !finite(tier.craftTimeSeconds) || tier.craftTimeSeconds < 0) {
      throw new RecipeIssue('RECIPE_SHAPE_INVALID')
    }
    if (tier.slots.length === 0) {
      return { status: 'REVIEW_REQUIRED', issues: ['RECIPE_EMPTY'], recipe: null }
    }
    const recipe: FabricatorRecipe = {
      craftTimeSeconds: tier.craftTimeSeconds,
      slots: tier.slots.map((slot, index) => readSlot(slot, index, context)),
    }
    if (recipe.slots.some(slot => slot.material.vocabulary !== 'RESOLVED')) {
      return { status: 'REVIEW_REQUIRED', issues: ['RECIPE_MATERIAL_UNRESOLVED'], recipe }
    }
    return { status: 'RESOLVED', recipe }
  } catch (error) {
    if (error instanceof RecipeIssue) return { status: 'REVIEW_REQUIRED', issues: [error.issue], recipe: null }
    throw error
  }
}
