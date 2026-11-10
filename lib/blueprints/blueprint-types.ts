export type ScmdbChannel = 'LIVE' | 'PTU'

export type ScmdbBlueprintRecipeOption = {
  kind: 'RESOURCE' | 'ITEM'
  name: string
  quantity: number
  minQuality: number
}

export type ScmdbBlueprintRecipeSlot = {
  name: string
  options: ScmdbBlueprintRecipeOption[]
}

export type ScmdbBlueprintRecipe = {
  craftTimeSeconds: number
  slots: ScmdbBlueprintRecipeSlot[]
}

/**
 * One blueprint exactly as SCMDB reports it, without interpretation.
 *
 * `sourceGuid` is the SCMDB identity and never the VECTOR identity: a VECTOR
 * blueprint id is assigned by the database and is stable across dataset
 * revisions (PERSISTENCE_PROVENANCE_V1 §3).
 *
 * `scmdbIsDefault` is a raw source value only. SCMDB marks a small number of
 * blueprints this way and calls them starter blueprints in its own changelog.
 * That is a source statement and not a rule derived from CIG data, so it must
 * never be turned into personal ownership or into UI ownership logic.
 */
export type ScmdbBlueprintRaw = {
  sourceGuid: string
  sourceTag: string
  productEntityClass: string
  productName: string | null
  gear: string
  type: string | null
  subtype: string | null
  manufacturer: string | null
  recipe: ScmdbBlueprintRecipe
  scmdbIsDefault: boolean
  scmdbCigDataError: boolean
  scmdbSuggestedName: string | null
}

export type ScmdbBlueprintReviewState = 'VALID' | 'REVIEW_REQUIRED'

/**
 * Review issues are observations, never corrections. SCMDB may ship a
 * suggested replacement name; VECTOR records that such a suggestion exists but
 * does not adopt it, because uncertain source data is not guessed
 * (AGENTS.md working rules, PERSISTENCE_PROVENANCE_V1 §16).
 */
export type ScmdbBlueprintIssue =
  | 'PRODUCT_NAME_MISSING'
  | 'CIG_DATA_ERROR'
  | 'SOURCE_SUGGESTED_NAME'
  | 'RECIPE_MISSING'

export type ClassifiedScmdbBlueprint = ScmdbBlueprintRaw & {
  reviewState: ScmdbBlueprintReviewState
  issues: ScmdbBlueprintIssue[]
}

export type ScmdbBlueprintDataset = {
  channel: ScmdbChannel
  version: string
  sourceFile: string
  blueprints: ScmdbBlueprintRaw[]
}

export type ClassifiedScmdbBlueprintDataset = Omit<ScmdbBlueprintDataset, 'blueprints'> & {
  blueprints: ClassifiedScmdbBlueprint[]
  valid: ClassifiedScmdbBlueprint[]
  reviewRequired: ClassifiedScmdbBlueprint[]
  counts: {
    total: number
    valid: number
    reviewRequired: number
  }
}

/**
 * A normalized mission reward relation: one contract offers one blueprint
 * through one SCMDB blueprint pool.
 *
 * This is import data only. The `where do I get this?` feature is DEFERRED and
 * no runtime surface may depend on these rows in the current work package.
 */
export type ScmdbBlueprintRewardSource = {
  blueprintSourceGuid: string
  poolGuid: string
  poolName: string
  poolSource: string
  contractId: string
  contractDebugName: string
  contractCategory: string | null
  contractMissionType: string | null
  trigger: string
  chance: number
  weight: number
  /** True when SCMDB records a known data issue for this pool or pool entry. */
  hasSourceKnownIssue: boolean
}

export type ScmdbBlueprintRewardDataset = {
  channel: ScmdbChannel
  version: string
  sourceFile: string
  rewards: ScmdbBlueprintRewardSource[]
  counts: {
    rewards: number
    blueprints: number
    pools: number
    contracts: number
    withSourceKnownIssue: number
    /**
     * Rows that repeat an existing `contract + pool + blueprint` combination.
     *
     * SCMDB ships pools that reference the same blueprint twice and documents
     * them as probable CIG copy-paste errors. Such a row is kept and counted
     * rather than collapsed, because collapsing it would silently decide that
     * the source is wrong. A consumer must therefore not assume the relation is
     * unique per combination.
     */
    duplicateSourceRows: number
  }
}
