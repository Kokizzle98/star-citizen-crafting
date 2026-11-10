import type { ClassifiedScmdbLocationDataset, ScmdbLocationStatus } from './location-types'

export type ScmdbLocationSyncRow = {
  source_key: string
  canonical_name: string
  normalized_name: string
  location_type: string
  system_name: string | null
  planet_name: string | null
  moon_name: string | null
  classification: ScmdbLocationStatus
  issues: string[]
}

export function buildScmdbLocationSyncPayload(dataset: ClassifiedScmdbLocationDataset) {
  const invalid = () => { throw new Error('SCMDB_LOCATION_PAYLOAD_INVALID') }
  const nonempty = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0
  if (!dataset || !['LIVE', 'PTU'].includes(dataset.channel) ||
      !nonempty(dataset.version) || !nonempty(dataset.sourceFile) ||
      !Array.isArray(dataset.locations) || !dataset.counts) invalid()

  const keys = new Set<string>()
  const counts = { total: 0, valid: 0, quarantined: 0, rejectedTechnical: 0 }
  const rows: ScmdbLocationSyncRow[] = dataset.locations.map((location) => {
    if (!location || !nonempty(location.sourceKey) || keys.has(location.sourceKey) ||
        !nonempty(location.canonicalName) || !nonempty(location.normalizedName) ||
        !nonempty(location.type) ||
        ![location.system, location.planet, location.moon].every((v) => v === null || nonempty(v)) ||
        !Array.isArray(location.issues) || !location.issues.every(nonempty)) invalid()
    keys.add(location.sourceKey)
    switch (location.status) {
      case 'VALID':
        if (location.issues.length) invalid()
        counts.valid++
        break
      case 'QUARANTINED':
        if (!location.issues.length || location.issues.includes('TECHNICAL_NAME')) invalid()
        counts.quarantined++
        break
      case 'REJECTED_TECHNICAL':
        if (!location.issues.includes('TECHNICAL_NAME')) invalid()
        counts.rejectedTechnical++
        break
      default: invalid()
    }
    counts.total++
    return {
      source_key: location.sourceKey,
      canonical_name: location.canonicalName,
      normalized_name: location.normalizedName,
      location_type: location.type,
      system_name: location.system,
      planet_name: location.planet,
      moon_name: location.moon,
      classification: location.status,
      issues: [...location.issues],
    }
  })
  if (Object.entries(counts).some(([key, value]) =>
    dataset.counts[key as keyof typeof counts] !== value)) invalid()
  rows.sort((a, b) => a.source_key < b.source_key ? -1 : a.source_key > b.source_key ? 1 : 0)
  return {
    p_source: 'SCMDB' as const,
    p_channel: dataset.channel,
    p_version: dataset.version,
    p_source_file: dataset.sourceFile,
    p_total: counts.total,
    p_valid: counts.valid,
    p_quarantined: counts.quarantined,
    p_rejected_technical: counts.rejectedTechnical,
    p_rows: rows,
  }
}
