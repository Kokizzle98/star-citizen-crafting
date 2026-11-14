import { extractScmdbBlueprints } from './blueprint-extractor'
import { classifyScmdbBlueprints } from './blueprint-normalizer'
import type {
  ClassifiedScmdbBlueprint,
  ClassifiedScmdbBlueprintDataset,
  ScmdbChannel,
} from './blueprint-types'

/**
 * Prepares one channel's blueprint catalog for import: extract, classify and
 * verify that the classification is complete and consistent.
 *
 * This is catalog data only. Nothing here reads, writes or implies personal
 * blueprint ownership.
 */
export function prepareScmdbBlueprintDataset(
  manifestInput: unknown,
  datasetInput: unknown,
  channel: ScmdbChannel,
): ClassifiedScmdbBlueprintDataset {
  const extracted = extractScmdbBlueprints(manifestInput, datasetInput, channel)
  const blueprints = classifyScmdbBlueprints(extracted.blueprints)

  if (blueprints.length !== extracted.blueprints.length) {
    throw new Error('SCMDB_BLUEPRINT_CLASSIFICATION_INVALID')
  }

  const valid: ClassifiedScmdbBlueprint[] = []
  const reviewRequired: ClassifiedScmdbBlueprint[] = []

  for (const [index, blueprint] of blueprints.entries()) {
    if (
      blueprint.sourceGuid !== extracted.blueprints[index].sourceGuid ||
      !Array.isArray(blueprint.issues)
    ) {
      throw new Error('SCMDB_BLUEPRINT_CLASSIFICATION_INVALID')
    }

    switch (blueprint.reviewState) {
      case 'VALID':
        if (blueprint.issues.length !== 0) {
          throw new Error('SCMDB_BLUEPRINT_CLASSIFICATION_INVALID')
        }
        valid.push(blueprint)
        break
      case 'REVIEW_REQUIRED':
        if (blueprint.issues.length === 0) {
          throw new Error('SCMDB_BLUEPRINT_CLASSIFICATION_INVALID')
        }
        reviewRequired.push(blueprint)
        break
      default:
        throw new Error('SCMDB_BLUEPRINT_CLASSIFICATION_INVALID')
    }
  }

  const counts = {
    total: blueprints.length,
    valid: valid.length,
    reviewRequired: reviewRequired.length,
  }

  if (counts.total !== counts.valid + counts.reviewRequired) {
    throw new Error('SCMDB_BLUEPRINT_CLASSIFICATION_INVALID')
  }

  return { ...extracted, blueprints, valid, reviewRequired, counts }
}
