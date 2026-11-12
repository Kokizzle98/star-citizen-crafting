import {
  LOADOUT_INDEX_GENERATOR_VERSION,
  LOADOUT_SOURCE_NAME,
  type LoadoutSourceProvenance,
} from './loadout-source-types'

// Game build parsing and freshness of the loadout source against the active
// SCMDB build. EXACT / STALE / UNAVAILABLE are freshness states, never
// negative evidence (docs/frozen/VECTOR_SOURCE_AUTHORITY_V1.md).

const BUILD = /^(\d+\.\d+\.\d+)-([A-Za-z]+)\.(\d+)$/
const COMMIT = /^[0-9a-f]{40}$/

export type ParsedGameBuild = { gameVersion: string; channel: string; buildNumber: number }

/** Accepts `4.10.2-LIVE.12881860` (scunpacked) and `4.10.2-live.12913470` (SCMDB). */
export function parseGameBuild(value: unknown): ParsedGameBuild | null {
  if (typeof value !== 'string') return null
  const match = BUILD.exec(value)
  if (!match) return null
  const buildNumber = Number(match[3])
  if (!Number.isSafeInteger(buildNumber)) return null
  return { gameVersion: match[1], channel: match[2].toUpperCase(), buildNumber }
}

export function isFullCommit(value: unknown): value is string {
  return typeof value === 'string' && COMMIT.test(value)
}

/**
 * Provenance from the source commit. The scunpacked-data commit subject is
 * the build (e.g. `4.10.2-LIVE.12881860`). Anything that is not a parseable
 * LIVE build fails closed; there is no guessing and no PTU path.
 */
export function createLoadoutProvenance(sourceCommit: unknown, commitSubject: unknown): LoadoutSourceProvenance {
  if (!isFullCommit(sourceCommit)) throw new Error('LOADOUT_SOURCE_COMMIT_INVALID')
  const subject = typeof commitSubject === 'string' ? commitSubject.trim() : ''
  const build = parseGameBuild(subject)
  if (!build) throw new Error('LOADOUT_SOURCE_BUILD_UNREADABLE')
  if (build.channel !== 'LIVE') throw new Error('LOADOUT_SOURCE_CHANNEL_NOT_LIVE')
  return {
    source: LOADOUT_SOURCE_NAME,
    sourceCommit,
    gameBuild: subject,
    gameVersion: build.gameVersion,
    buildNumber: build.buildNumber,
    channel: 'LIVE',
    generatorVersion: LOADOUT_INDEX_GENERATOR_VERSION,
  }
}

export type LoadoutStaleDetail = 'BUILD_OLDER' | 'BUILD_NEWER' | 'VERSION_DIFFERENT'
export type LoadoutUnavailableReason = 'EXPECTED_BUILD_INVALID' | 'CHANNEL_MISMATCH'

export type LoadoutFreshness =
  | { freshness: 'EXACT' }
  | { freshness: 'STALE'; detail: LoadoutStaleDetail }
  | { freshness: 'UNAVAILABLE'; reason: LoadoutUnavailableReason }

/**
 * Compares the index provenance with the active SCMDB LIVE version string
 * (e.g. `4.10.2-live.12913470`). Only the same channel is comparable: LIVE
 * evidence is never judged against PTU and vice versa.
 */
export function evaluateLoadoutFreshness(
  provenance: Pick<LoadoutSourceProvenance, 'channel' | 'gameVersion' | 'buildNumber'>,
  expectedScmdbVersion: unknown,
): LoadoutFreshness {
  const expected = parseGameBuild(expectedScmdbVersion)
  if (!expected) return { freshness: 'UNAVAILABLE', reason: 'EXPECTED_BUILD_INVALID' }
  if (expected.channel !== 'LIVE' || provenance.channel !== 'LIVE') {
    return { freshness: 'UNAVAILABLE', reason: 'CHANNEL_MISMATCH' }
  }
  if (expected.gameVersion !== provenance.gameVersion) return { freshness: 'STALE', detail: 'VERSION_DIFFERENT' }
  if (expected.buildNumber === provenance.buildNumber) return { freshness: 'EXACT' }
  return { freshness: 'STALE', detail: provenance.buildNumber < expected.buildNumber ? 'BUILD_OLDER' : 'BUILD_NEWER' }
}
