export type ScmdbLocationRaw = {
  sourceKey: string
  name: string
  type: string
  system: string | null
  planet: string | null
  moon: string | null
}

export type ScmdbLocationStatus =
  | 'VALID'
  | 'QUARANTINED'
  | 'REJECTED_TECHNICAL'

export type NormalizedScmdbLocation = ScmdbLocationRaw & {
  canonicalName: string
  normalizedName: string
  status: ScmdbLocationStatus
  issues: string[]
}

export type ScmdbLocationDataset = {
  channel: 'LIVE' | 'PTU'
  version: string
  sourceFile: string
  locations: ScmdbLocationRaw[]
}
