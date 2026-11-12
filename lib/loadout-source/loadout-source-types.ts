// Vehicle loadout source foundation (F4-S, owner decision: Option B).
//
// Types of the derived, component-UUID-centred loadout index built from a
// locally checked-out, commit-pinned scunpacked-data tree. The index is
// read-only evidence: component -> vehicle(s) -> port(s). It classifies
// nothing, hides nothing and excludes nothing (that is F4-B). Identity is the
// exact CIG UUID only; ClassName, Name and Type are descriptive source values
// and never an identity (docs/frozen/VECTOR_SOURCE_AUTHORITY_V1.md).
//
// The index is generated locally and is never committed (the licence and the
// redistribution status of scunpacked-data are unresolved).

export const LOADOUT_INDEX_FORMAT_VERSION = 1
export const LOADOUT_INDEX_GENERATOR_VERSION = '1.0.0'
export const LOADOUT_SOURCE_NAME = 'scunpacked-data'

export type LoadoutSourceProvenance = {
  source: typeof LOADOUT_SOURCE_NAME
  /** Full 40-character commit of the scunpacked-data checkout the index was derived from. */
  sourceCommit: string
  /** Game build exactly as the source commit states it, e.g. `4.10.2-LIVE.12881860`. */
  gameBuild: string
  gameVersion: string
  buildNumber: number
  /** LIVE only. PTU evidence is never produced here and never substituted for LIVE. */
  channel: 'LIVE'
  generatorVersion: string
}

export type LoadoutCompatibleType = { type: string; subTypes: string[] }

/** One port of one vehicle that holds the component. All values are source evidence. */
export type LoadoutPort = {
  /** Source-local relation key (scunpacked PortId); never a VECTOR identity. */
  portId: string
  rootPortId: string
  /** PortId of the parent port when the port sits below another installed item, else null. */
  parentPortId: string | null
  hardpointName: string
  path: string[]
  /** Source `Editable`. `false` is evidence only, never an exclusion criterion. */
  editable: boolean
  editableChildren: boolean
  minSize: number
  maxSize: number
  compatibleTypes: LoadoutCompatibleType[]
  requiredTags: string[]
  portTags: string[]
}

export type LoadoutVehicleLink = { vehicleUuid: string; ports: LoadoutPort[] }

/**
 * Additional signals only. They never replace the full vehicle / port
 * relations and `onlyOnUneditablePorts` is not an irrelevance verdict.
 */
export type LoadoutComponentSummary = {
  vehicleCount: number
  portCount: number
  editablePortCount: number
  uneditablePortCount: number
  onlyOnUneditablePorts: boolean
}

export type LoadoutComponent = {
  uuid: string
  /** Descriptive source values, sorted, de-duplicated. Not identity. */
  classNames: string[]
  types: string[]
  vehicles: LoadoutVehicleLink[]
  summary: LoadoutComponentSummary
}

export type LoadoutVehicle = {
  uuid: string
  className: string
  name: string
  isSpaceship: boolean
  isVehicle: boolean
}

export type LoadoutIndexCounts = {
  vehicles: number
  components: number
  componentPortLinks: number
  /** Ports without an installed item. Counted for transparency; not part of the component relations. */
  emptyPorts: number
}

export type LoadoutIndex = {
  formatVersion: typeof LOADOUT_INDEX_FORMAT_VERSION
  provenance: LoadoutSourceProvenance
  counts: LoadoutIndexCounts
  vehicles: Record<string, LoadoutVehicle>
  components: Record<string, LoadoutComponent>
}
