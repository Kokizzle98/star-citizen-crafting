import { extractScmdbLocations } from './location-extractor'
import { normalizeScmdbLocations } from './location-normalizer'
import type { ClassifiedScmdbLocationDataset, NormalizedScmdbLocation } from './location-types'

export function prepareScmdbLocationDataset(
  manifestInput: unknown,
  mergedInput: unknown,
  channel: 'LIVE' | 'PTU',
): ClassifiedScmdbLocationDataset {
  const extracted = extractScmdbLocations(manifestInput, mergedInput, channel)
  const locations = normalizeScmdbLocations(extracted.locations)
  const valid: NormalizedScmdbLocation[] = []
  const quarantined: NormalizedScmdbLocation[] = []
  const rejectedTechnical: NormalizedScmdbLocation[] = []

  if (locations.length !== extracted.locations.length) {
    throw new Error('SCMDB_LOCATION_CLASSIFICATION_INVALID')
  }

  for (const [index, location] of locations.entries()) {
    if (
      location.sourceKey !== extracted.locations[index].sourceKey ||
      !Array.isArray(location.issues)
    ) {
      throw new Error('SCMDB_LOCATION_CLASSIFICATION_INVALID')
    }

    switch (location.status) {
      case 'VALID':
        if (location.issues.length !== 0) throw new Error('SCMDB_LOCATION_CLASSIFICATION_INVALID')
        valid.push(location)
        break
      case 'QUARANTINED':
        if (location.issues.length === 0 || location.issues.includes('TECHNICAL_NAME')) {
          throw new Error('SCMDB_LOCATION_CLASSIFICATION_INVALID')
        }
        quarantined.push(location)
        break
      case 'REJECTED_TECHNICAL':
        if (!location.issues.includes('TECHNICAL_NAME')) {
          throw new Error('SCMDB_LOCATION_CLASSIFICATION_INVALID')
        }
        rejectedTechnical.push(location)
        break
      default:
        throw new Error('SCMDB_LOCATION_CLASSIFICATION_INVALID')
    }
  }

  const counts = {
    total: locations.length,
    valid: valid.length,
    quarantined: quarantined.length,
    rejectedTechnical: rejectedTechnical.length,
  }
  if (counts.total !== counts.valid + counts.quarantined + counts.rejectedTechnical) {
    throw new Error('SCMDB_LOCATION_CLASSIFICATION_INVALID')
  }

  return { ...extracted, locations, valid, quarantined, rejectedTechnical, counts }
}
