import type {
  ClassifiedScmdbBlueprint,
  ScmdbBlueprintIssue,
  ScmdbBlueprintRaw,
} from './blueprint-types'

/**
 * Classifies a blueprint without correcting it.
 *
 * A blueprint with issues stays in the catalog and becomes visible as
 * `REVIEW_REQUIRED`. Nothing is dropped, renamed or completed from another
 * source: missing or uncertain source data remains an explicit review state
 * (AGENTS.md working rules, PERSISTENCE_PROVENANCE_V1 §16).
 */
export function classifyScmdbBlueprint(blueprint: ScmdbBlueprintRaw): ClassifiedScmdbBlueprint {
  const issues: ScmdbBlueprintIssue[] = []

  if (blueprint.productName === null) issues.push('PRODUCT_NAME_MISSING')
  if (blueprint.scmdbCigDataError) issues.push('CIG_DATA_ERROR')
  if (blueprint.scmdbSuggestedName !== null) issues.push('SOURCE_SUGGESTED_NAME')
  if (blueprint.recipe.slots.length === 0) issues.push('RECIPE_MISSING')

  return {
    ...blueprint,
    reviewState: issues.length === 0 ? 'VALID' : 'REVIEW_REQUIRED',
    issues,
  }
}

export function classifyScmdbBlueprints(
  blueprints: ScmdbBlueprintRaw[],
): ClassifiedScmdbBlueprint[] {
  return blueprints.map(classifyScmdbBlueprint)
}
