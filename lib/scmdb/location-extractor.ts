import type { ScmdbLocationDataset, ScmdbLocationRaw } from './location-types'

type Channel = 'LIVE' | 'PTU'

type ManifestChannel = {
  version: unknown
  files: {
    merged?: unknown
  }
}

type Manifest = {
  channels?: {
    live?: ManifestChannel
    ptu?: ManifestChannel
  }
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null) return null
  if (!nonempty(value)) return undefined
  return value
}

export function extractScmdbLocations(
  manifestInput: unknown,
  mergedInput: unknown,
  channel: Channel,
): ScmdbLocationDataset {
  if (typeof manifestInput !== 'object' || manifestInput === null || Array.isArray(manifestInput)) {
    throw new Error('SCMDB_LOCATION_MANIFEST_INVALID')
  }

  const manifest = manifestInput as Manifest
  const channelKey = channel.toLowerCase() as 'live' | 'ptu'
  const channelManifest = manifest.channels?.[channelKey]

  if (
    !channelManifest ||
    !nonempty(channelManifest.version) ||
    !nonempty(channelManifest.files?.merged)
  ) {
    throw new Error('SCMDB_LOCATION_MANIFEST_INVALID')
  }

  if (typeof mergedInput !== 'object' || mergedInput === null || Array.isArray(mergedInput)) {
    throw new Error('SCMDB_LOCATION_DATASET_INVALID')
  }

  const merged = mergedInput as Record<string, unknown>

  if (merged.version !== channelManifest.version) {
    throw new Error('SCMDB_LOCATION_VERSION_MISMATCH')
  }

  if (
    typeof merged.locationPools !== 'object' ||
    merged.locationPools === null ||
    Array.isArray(merged.locationPools)
  ) {
    throw new Error('SCMDB_LOCATION_POOLS_INVALID')
  }

  const locations: ScmdbLocationRaw[] = []

  for (const [sourceKey, value] of Object.entries(
    merged.locationPools as Record<string, unknown>,
  )) {
    if (!nonempty(sourceKey) || typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('SCMDB_LOCATION_ROW_INVALID')
    }

    const row = value as Record<string, unknown>
    const system = nullableText(row.system)
    const planet = nullableText(row.planet)
    const moon = nullableText(row.moon)

    if (
      !nonempty(row.name) ||
      !nonempty(row.type) ||
      system === undefined ||
      planet === undefined ||
      moon === undefined
    ) {
      throw new Error('SCMDB_LOCATION_ROW_INVALID')
    }

    locations.push({
      sourceKey,
      name: row.name,
      type: row.type,
      system,
      planet,
      moon,
    })
  }

  locations.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))

  return {
    channel,
    version: channelManifest.version,
    sourceFile: channelManifest.files.merged,
    locations,
  }
}
