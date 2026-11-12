import {
  LOADOUT_INDEX_FORMAT_VERSION,
  LOADOUT_SOURCE_NAME,
  type LoadoutComponent,
  type LoadoutIndex,
  type LoadoutPort,
  type LoadoutVehicle,
} from './loadout-source-types'
import {
  evaluateLoadoutFreshness,
  isFullCommit,
  parseGameBuild,
  type LoadoutStaleDetail,
  type LoadoutUnavailableReason,
} from './loadout-source-build'
import { UUID_PATTERN } from './loadout-source-generator'

// Reader of the derived loadout index with the source / build guard.
//
// Pure: it receives the index text and the active SCMDB LIVE version string.
// A missing, unreadable, invalid or wrong-channel index is UNAVAILABLE; it
// never throws, never falls back to names or another source and never turns
// a missing index into "no loadout". STALE is not negative evidence and
// NO_EVIDENCE is not NEGATIVE_EVIDENCE.

export type LoadoutIndexUnavailableReason =
  | 'INDEX_MISSING'
  | 'INDEX_UNREADABLE'
  | 'INDEX_INVALID'
  | LoadoutUnavailableReason

export type LoadoutSourceState =
  | { freshness: 'UNAVAILABLE'; reason: LoadoutIndexUnavailableReason }
  | { freshness: 'EXACT'; index: LoadoutIndex }
  | { freshness: 'STALE'; detail: LoadoutStaleDetail; index: LoadoutIndex }

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function invalid(): never {
  throw new Error('LOADOUT_INDEX_INVALID')
}

function checkPort(value: unknown): LoadoutPort {
  if (!record(value) || !isText(value.portId) || !isText(value.rootPortId) || typeof value.hardpointName !== 'string' ||
      !(value.parentPortId === null || isText(value.parentPortId)) || !isTextList(value.path) ||
      typeof value.editable !== 'boolean' || typeof value.editableChildren !== 'boolean' ||
      typeof value.minSize !== 'number' || typeof value.maxSize !== 'number' ||
      !isTextList(value.requiredTags) || !isTextList(value.portTags) || !Array.isArray(value.compatibleTypes) ||
      !value.compatibleTypes.every(item => record(item) && isText(item.type) && isTextList(item.subTypes))) {
    invalid()
  }
  return value as unknown as LoadoutPort
}

/** Structural validation of a parsed index document. Throws `LOADOUT_INDEX_INVALID`. */
export function validateLoadoutIndex(value: unknown): LoadoutIndex {
  if (!record(value) || value.formatVersion !== LOADOUT_INDEX_FORMAT_VERSION) invalid()
  const { provenance, counts, vehicles, components } = value
  if (!record(provenance) || provenance.source !== LOADOUT_SOURCE_NAME || !isFullCommit(provenance.sourceCommit) ||
      provenance.channel !== 'LIVE' || !isText(provenance.generatorVersion)) invalid()
  const build = parseGameBuild(provenance.gameBuild)
  if (!build || build.gameVersion !== provenance.gameVersion || build.buildNumber !== provenance.buildNumber) invalid()
  if (!record(counts) || !record(vehicles) || !record(components)) invalid()

  for (const [key, vehicle] of Object.entries(vehicles)) {
    if (!record(vehicle) || vehicle.uuid !== key || !UUID_PATTERN.test(key) || !isText(vehicle.className) ||
        typeof vehicle.name !== 'string' || typeof vehicle.isSpaceship !== 'boolean' ||
        typeof vehicle.isVehicle !== 'boolean') invalid()
  }

  let links = 0
  for (const [key, component] of Object.entries(components)) {
    if (!record(component) || component.uuid !== key || !UUID_PATTERN.test(key) ||
        !isTextList(component.classNames) || !isTextList(component.types) || !Array.isArray(component.vehicles) ||
        !record(component.summary)) invalid()
    let portCount = 0
    let editable = 0
    for (const link of component.vehicles as unknown[]) {
      if (!record(link) || !isText(link.vehicleUuid) || !Object.hasOwn(vehicles, link.vehicleUuid) ||
          !Array.isArray(link.ports) || link.ports.length === 0) invalid()
      for (const raw of link.ports) {
        const port = checkPort(raw)
        portCount += 1
        if (port.editable) editable += 1
      }
    }
    const summary = component.summary
    if (summary.vehicleCount !== component.vehicles.length || summary.portCount !== portCount ||
        summary.editablePortCount !== editable || summary.uneditablePortCount !== portCount - editable ||
        summary.onlyOnUneditablePorts !== (portCount > 0 && editable === 0)) invalid()
    links += portCount
  }

  if (!isCount(counts.vehicles) || !isCount(counts.components) || !isCount(counts.componentPortLinks) ||
      !isCount(counts.emptyPorts) || counts.vehicles !== Object.keys(vehicles).length ||
      counts.components !== Object.keys(components).length || counts.componentPortLinks !== links) invalid()

  return value as unknown as LoadoutIndex
}

/**
 * Evaluates the loadout source. `indexText` is the raw index file content, or
 * `null` / `undefined` when the file does not exist (for example on Vercel,
 * where the index is deliberately absent). `readFailed` marks a read error
 * other than "not found". `expectedScmdbVersion` is the active LIVE SCMDB
 * version (for example `4.10.2-live.12913470`).
 */
export function evaluateLoadoutSource(
  indexText: string | null | undefined,
  expectedScmdbVersion: unknown,
  options: { readFailed?: boolean } = {},
): LoadoutSourceState {
  if (options.readFailed) return { freshness: 'UNAVAILABLE', reason: 'INDEX_UNREADABLE' }
  if (indexText === null || indexText === undefined) return { freshness: 'UNAVAILABLE', reason: 'INDEX_MISSING' }

  let index: LoadoutIndex
  try {
    index = validateLoadoutIndex(JSON.parse(indexText))
  } catch {
    return { freshness: 'UNAVAILABLE', reason: 'INDEX_INVALID' }
  }

  const result = evaluateLoadoutFreshness(index.provenance, expectedScmdbVersion)
  if (result.freshness === 'UNAVAILABLE') return { freshness: 'UNAVAILABLE', reason: result.reason }
  if (result.freshness === 'STALE') return { freshness: 'STALE', detail: result.detail, index }
  return { freshness: 'EXACT', index }
}

export type LoadoutVehicleEvidence = { vehicle: LoadoutVehicle; ports: LoadoutPort[] }

export type LoadoutComponentLookup =
  | { evidence: 'UNAVAILABLE'; reason: LoadoutIndexUnavailableReason }
  | { evidence: 'INVALID_UUID'; freshness: 'EXACT' | 'STALE' }
  | { evidence: 'NO_EVIDENCE'; freshness: 'EXACT' | 'STALE' }
  | { evidence: 'FOUND'; freshness: 'EXACT' | 'STALE'; component: LoadoutComponent; vehicles: LoadoutVehicleEvidence[] }

/**
 * Looks a component up by its exact CIG UUID (canonical lower-case form).
 * `NO_EVIDENCE` means this source has no record; it is not negative evidence
 * and never a reason to exclude or hide a component. There is no name lookup.
 */
export function lookupLoadoutComponent(state: LoadoutSourceState, uuid: unknown): LoadoutComponentLookup {
  if (state.freshness === 'UNAVAILABLE') return { evidence: 'UNAVAILABLE', reason: state.reason }
  if (typeof uuid !== 'string' || !UUID_PATTERN.test(uuid)) return { evidence: 'INVALID_UUID', freshness: state.freshness }
  if (!Object.hasOwn(state.index.components, uuid)) return { evidence: 'NO_EVIDENCE', freshness: state.freshness }
  const component = state.index.components[uuid]
  return {
    evidence: 'FOUND',
    freshness: state.freshness,
    component,
    vehicles: component.vehicles.map(link => ({ vehicle: state.index.vehicles[link.vehicleUuid], ports: link.ports })),
  }
}
