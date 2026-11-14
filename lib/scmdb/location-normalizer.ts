import type {
  NormalizedScmdbLocation,
  ScmdbLocationRaw,
  ScmdbLocationStatus,
} from './location-types'

const TECHNICAL_NAME_PATTERNS = [
  /^@/,
  /UNINITIALIZED/i,
  /blank/i,
  /placeholder/i,
]

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase('de')
}

function isTechnicalName(name: string) {
  return TECHNICAL_NAME_PATTERNS.some((pattern) => pattern.test(name))
}

export function normalizeScmdbLocation(
  row: ScmdbLocationRaw,
  knownSystems: ReadonlySet<string>,
  knownPlanets: ReadonlySet<string>,
  knownMoons: ReadonlySet<string>,
): NormalizedScmdbLocation {
  const canonicalName = row.name.trim()
  const normalizedName = normalizeText(canonicalName)
  const issues: string[] = []

  let status: ScmdbLocationStatus = 'VALID'

  if (isTechnicalName(canonicalName)) {
    status = 'REJECTED_TECHNICAL'
    issues.push('TECHNICAL_NAME')
  }

  if (row.system !== null && !knownSystems.has(row.system)) {
    issues.push('UNKNOWN_SYSTEM')
  }

  if (row.planet !== null && !knownPlanets.has(row.planet)) {
    issues.push('UNKNOWN_PLANET')
  }

  if (row.moon !== null && !knownMoons.has(row.moon)) {
    issues.push('UNKNOWN_MOON')
  }

  if (row.type === 'Planet' && row.planet !== null) {
    issues.push('PLANET_HAS_PLANET_PARENT')
  }

  if (
    status !== 'REJECTED_TECHNICAL' &&
    issues.length > 0
  ) {
    status = 'QUARANTINED'
  }

  return {
    ...row,
    canonicalName,
    normalizedName,
    status,
    issues,
  }
}

export function normalizeScmdbLocations(
  rows: ScmdbLocationRaw[],
): NormalizedScmdbLocation[] {
  const knownSystems = new Set(
    rows
      .filter((row) => row.type === 'Star')
      .map((row) => row.name),
  )

  const knownPlanets = new Set(
    rows
      .filter((row) => row.type === 'Planet')
      .map((row) => row.name),
  )

  const knownMoons = new Set(
    rows
      .filter((row) => row.type === 'Moon')
      .map((row) => row.name),
  )

  return rows.map((row) =>
    normalizeScmdbLocation(
      row,
      knownSystems,
      knownPlanets,
      knownMoons,
    ),
  )
}
