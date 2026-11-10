import type { ClassifiedScmdbLocationDataset, NormalizedScmdbLocation } from './location-types'

export type ScmdbPromotabilityDecision =
  | { decision: 'PROMOTABLE'; reason: 'PROMOTABLE_LOCATION_TYPE' }
  | { decision: 'CATALOG_ONLY'; reason: 'NON_VALID_CLASSIFICATION' | 'CATALOG_ONLY_LOCATION_TYPE' | 'DESTINATION_POLICY_DEFERRED' }

export type EvaluatedScmdbLocation = ScmdbPromotabilityDecision & {
  sourceKey: string
  location: NormalizedScmdbLocation
}

export function decideScmdbLocationPromotability(location: NormalizedScmdbLocation): ScmdbPromotabilityDecision {
  switch (location.status) {
    case 'QUARANTINED':
    case 'REJECTED_TECHNICAL':
      return { decision: 'CATALOG_ONLY', reason: 'NON_VALID_CLASSIFICATION' }
    case 'VALID':
      break
    default:
      throw new Error('SCMDB_PROMOTABILITY_INVALID_CLASSIFICATION')
  }

  switch (location.type) {
    case 'LandingZone':
    case 'Station':
    case 'Outpost':
      return { decision: 'PROMOTABLE', reason: 'PROMOTABLE_LOCATION_TYPE' }
    case 'Destination':
      return { decision: 'CATALOG_ONLY', reason: 'DESTINATION_POLICY_DEFERRED' }
    default:
      return { decision: 'CATALOG_ONLY', reason: 'CATALOG_ONLY_LOCATION_TYPE' }
  }
}

export function evaluateScmdbLocationDataset(dataset: ClassifiedScmdbLocationDataset) {
  const promotable: EvaluatedScmdbLocation[] = []
  const catalogOnly: EvaluatedScmdbLocation[] = []
  const keys = new Set<string>()
  const locations = [...dataset.locations].sort((a, b) => a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : 0)

  for (const location of locations) {
    if (typeof location.sourceKey !== 'string' || !location.sourceKey.trim() || keys.has(location.sourceKey)) {
      throw new Error('SCMDB_PROMOTABILITY_INVALID_SOURCE_KEY')
    }
    keys.add(location.sourceKey)
    const result = decideScmdbLocationPromotability(location)
    const evaluated = { ...result, sourceKey: location.sourceKey, location }
    switch (result.decision) {
      case 'PROMOTABLE':
        promotable.push(evaluated)
        break
      case 'CATALOG_ONLY':
        catalogOnly.push(evaluated)
        break
      default:
        throw new Error('SCMDB_PROMOTABILITY_INVALID_DECISION')
    }
  }

  const counts = { total: locations.length, promotable: promotable.length, catalogOnly: catalogOnly.length }
  if (counts.total !== counts.promotable + counts.catalogOnly || keys.size !== counts.total) {
    throw new Error('SCMDB_PROMOTABILITY_ACCOUNTING_MISMATCH')
  }
  return { promotable, catalogOnly, counts }
}
