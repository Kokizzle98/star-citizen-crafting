// Fabricator F1 – read and domain foundation (types only).
//
// Everything here is derived from the repository-pinned LIVE SCMDB mirror and
// is only valid together with the exact dataset version it was read from
// (owner decision D3 = A). Nothing in this module family reads, writes,
// reserves or consumes inventory.

export type FabricatorChannel = 'LIVE'

/** Stat and relation classification used across the Fabricator foundation. */
export type FabricatorResolution =
  | 'RESOLVED'
  | 'REVIEW_REQUIRED'
  | 'SOURCE_DATA_MISSING'
  | 'UNRESOLVED'

export type FabricatorPropertyDefinition = {
  key: string
  name: string
  /** SCMDB printf-style display format, kept verbatim (may be null). */
  unitFormat: string | null
  category: string
}

/** One SCMDB crafting item (the product a blueprint produces). */
export type FabricatorItem = {
  entityClass: string
  name: string | null
  itemType: string
  attachType: string
  attachSubType: string | null
  /** Raw SCMDB size; see fabricator-size.ts for the normalized display value. */
  size: number | null
  manufacturer: string | null
  manufacturerCode: string | null
  /** The raw source record, kept read-only for the baseline allowlist. */
  source: Readonly<Record<string, unknown>>
}

export type FabricatorModifierSegment = {
  startQuality: number
  endQuality: number
  modifierAtStart: number
  modifierAtEnd: number
}

/** All source modifier segments of one property inside one recipe slot. */
export type FabricatorModifierGroup = {
  propertyKey: string
  operation: 'MULTIPLICATIVE' | 'ADDITIVE'
  /** Sorted by startQuality, non-overlapping, integer bounds within 0..1000. */
  segments: FabricatorModifierSegment[]
  /** True when the segments cover every integer quality 0..1000 without a gap. */
  fullCoverage: boolean
}

export type FabricatorMaterialKind = 'RESOURCE' | 'ITEM'

/**
 * One recipe material. Its identity is the exact SCMDB material name inside
 * one LIVE dataset version (dataset-bound, never matched across versions).
 */
export type FabricatorMaterial = {
  kind: FabricatorMaterialKind
  name: string
  datasetVersion: string
  /** Source quantity as SCMDB reports it (SCU for resources, pieces for items). */
  amount: number
  unit: 'SCU' | 'COUNT'
  /** Resources only: the exact required amount in micro-SCU (inventory unit). */
  amountMicroScu: number | null
  minQuality: number
  /** RESOLVED when the name is in the dataset's material vocabulary of that kind. */
  vocabulary: 'RESOLVED' | 'UNRESOLVED'
}

export type FabricatorRecipeSlot = {
  /** Stable slot key inside the recipe (0-based source position). */
  slotKey: string
  name: string
  /** SCMDB offers exactly one option per slot in the verified dataset. */
  material: FabricatorMaterial
  modifiers: FabricatorModifierGroup[]
}

export type FabricatorRecipe = {
  craftTimeSeconds: number
  slots: FabricatorRecipeSlot[]
}

export type FabricatorRecipeIssue =
  | 'RECIPE_SHAPE_INVALID'
  | 'RECIPE_TIER_COUNT_UNSUPPORTED'
  | 'RECIPE_SLOT_OPTION_COUNT_UNSUPPORTED'
  | 'RECIPE_MATERIAL_INVALID'
  | 'RECIPE_MATERIAL_UNRESOLVED'
  | 'RECIPE_EMPTY'
  | 'MODIFIER_SHAPE_INVALID'
  | 'MODIFIER_PROPERTY_UNKNOWN'

export type FabricatorRecipeResult =
  | { status: 'RESOLVED'; recipe: FabricatorRecipe }
  | { status: 'REVIEW_REQUIRED'; issues: FabricatorRecipeIssue[]; recipe: FabricatorRecipe | null }

export type FabricatorBlueprint = {
  sourceGuid: string
  sourceTag: string
  productEntityClass: string
  productName: string | null
  manufacturer: string | null
  gear: string
  type: string | null
  subtype: string | null
  recipe: FabricatorRecipeResult
}

export type FabricatorLiveSource = {
  channel: FabricatorChannel
  version: string
  blueprintFile: string
  itemFile: string
  blueprints: FabricatorBlueprint[]
  items: Map<string, FabricatorItem>
  properties: Map<string, FabricatorPropertyDefinition>
  vocabulary: { resources: ReadonlySet<string>; items: ReadonlySet<string> }
}
