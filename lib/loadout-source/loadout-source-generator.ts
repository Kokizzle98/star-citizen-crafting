import {
  LOADOUT_INDEX_FORMAT_VERSION,
  type LoadoutComponent,
  type LoadoutCompatibleType,
  type LoadoutIndex,
  type LoadoutPort,
  type LoadoutSourceProvenance,
  type LoadoutVehicle,
  type LoadoutVehicleLink,
} from './loadout-source-types'
import { isFullCommit, parseGameBuild } from './loadout-source-build'

// Pure generator: scunpacked-data vehicle documents (`ships/*.json`) ->
// component-UUID-centred loadout index. No file system, no network, no clock,
// so the same documents and provenance always produce the same bytes.
//
// The generator copies source evidence and nothing else: no classification,
// no filter, no hide, no exclusion (F4-B), no name or fuzzy matching, no
// cross-source join. Multi-vehicle and multi-port relations stay complete.

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function fail(code: string, detail?: string): never {
  throw new Error(`LOADOUT_SOURCE_${code}${detail ? ` (${detail})` : ''}`)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function textList(value: unknown, where: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) fail('PORT_INVALID', where)
  return [...(value as string[])]
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function validateProvenance(provenance: LoadoutSourceProvenance) {
  const build = parseGameBuild(provenance?.gameBuild)
  if (!provenance || !isFullCommit(provenance.sourceCommit) || !build || provenance.channel !== 'LIVE' ||
      build.channel !== 'LIVE' || build.gameVersion !== provenance.gameVersion ||
      build.buildNumber !== provenance.buildNumber) {
    fail('PROVENANCE_INVALID')
  }
}

function readPort(entry: Record<string, unknown>, parentPortId: string | null, where: string): LoadoutPort {
  const { HardpointName, PortId, RootPortId, Editable, EditableChildren, MinSize, MaxSize, CompatibleTypes } = entry
  if (typeof HardpointName !== 'string' || !text(PortId) || !text(RootPortId) || typeof Editable !== 'boolean' ||
      typeof EditableChildren !== 'boolean' || typeof MinSize !== 'number' || typeof MaxSize !== 'number' ||
      !Number.isFinite(MinSize) || !Number.isFinite(MaxSize) || !Array.isArray(CompatibleTypes)) {
    fail('PORT_INVALID', where)
  }
  const compatibleTypes: LoadoutCompatibleType[] = (CompatibleTypes as unknown[]).map(item => {
    if (!record(item) || !text(item.Type)) fail('PORT_INVALID', `${where} CompatibleTypes`)
    return { type: item.Type as string, subTypes: textList(item.SubTypes, `${where} SubTypes`) }
  })
  return {
    portId: PortId as string,
    rootPortId: RootPortId as string,
    parentPortId,
    // May be an empty string in the source; kept as evidence, never repaired or guessed.
    hardpointName: HardpointName as string,
    path: textList(entry.Path, `${where} Path`),
    editable: Editable as boolean,
    editableChildren: EditableChildren as boolean,
    minSize: MinSize as number,
    maxSize: MaxSize as number,
    compatibleTypes,
    requiredTags: textList(entry.RequiredTags, `${where} RequiredTags`),
    portTags: textList(entry.PortTags, `${where} PortTags`),
  }
}

type ComponentAccumulator = {
  classNames: Set<string>
  types: Set<string>
  vehicles: Map<string, LoadoutPort[]>
}

export function buildLoadoutIndex(
  vehicleDocuments: readonly unknown[],
  provenance: LoadoutSourceProvenance,
): LoadoutIndex {
  validateProvenance(provenance)
  if (!Array.isArray(vehicleDocuments)) fail('DOCUMENTS_INVALID')

  const vehicles = new Map<string, LoadoutVehicle>()
  const components = new Map<string, ComponentAccumulator>()
  let emptyPorts = 0

  for (const document of vehicleDocuments) {
    if (!record(document) || !text(document.UUID) || !UUID_PATTERN.test(document.UUID) ||
        !text(document.ClassName) || typeof document.Name !== 'string' || !Array.isArray(document.Loadout)) {
      fail('VEHICLE_INVALID', record(document) && text(document.ClassName) ? document.ClassName : undefined)
    }
    const vehicleUuid = document.UUID as string
    const className = document.ClassName as string
    if (vehicles.has(vehicleUuid)) fail('VEHICLE_DUPLICATE', vehicleUuid)
    vehicles.set(vehicleUuid, {
      uuid: vehicleUuid,
      className,
      name: document.Name as string,
      isSpaceship: document.IsSpaceship === true,
      isVehicle: document.IsVehicle === true,
    })

    const seenPortIds = new Set<string>()
    const walk = (entries: unknown[], parentPortId: string | null) => {
      for (const entry of entries) {
        if (!record(entry)) fail('PORT_INVALID', className)
        const port = readPort(entry, parentPortId, `${className} ${typeof entry.PortId === 'string' ? entry.PortId : '?'}`)
        if (seenPortIds.has(port.portId)) fail('PORT_DUPLICATE', `${className} ${port.portId}`)
        seenPortIds.add(port.portId)

        const installed = entry.UUID
        if (installed === undefined || installed === null || installed === '') {
          emptyPorts += 1
        } else {
          if (!text(installed) || !UUID_PATTERN.test(installed)) fail('COMPONENT_UUID_INVALID', `${className} ${port.portId}`)
          let accumulator = components.get(installed)
          if (!accumulator) {
            accumulator = { classNames: new Set(), types: new Set(), vehicles: new Map() }
            components.set(installed, accumulator)
          }
          if (text(entry.ClassName)) accumulator.classNames.add(entry.ClassName)
          if (text(entry.Type)) accumulator.types.add(entry.Type)
          const ports = accumulator.vehicles.get(vehicleUuid) ?? []
          ports.push(port)
          accumulator.vehicles.set(vehicleUuid, ports)
        }

        const children = entry.Loadout
        if (children !== undefined && children !== null) {
          if (!Array.isArray(children)) fail('PORT_INVALID', `${className} ${port.portId} Loadout`)
          walk(children, port.portId)
        }
      }
    }
    walk(document.Loadout as unknown[], null)
  }

  const sortedVehicles: Record<string, LoadoutVehicle> = {}
  for (const uuid of [...vehicles.keys()].sort(compare)) sortedVehicles[uuid] = vehicles.get(uuid) as LoadoutVehicle

  const sortedComponents: Record<string, LoadoutComponent> = {}
  let componentPortLinks = 0
  for (const uuid of [...components.keys()].sort(compare)) {
    const accumulator = components.get(uuid) as ComponentAccumulator
    const links: LoadoutVehicleLink[] = [...accumulator.vehicles.keys()].sort(compare).map(vehicleUuid => ({
      vehicleUuid,
      ports: (accumulator.vehicles.get(vehicleUuid) as LoadoutPort[]).slice().sort((a, b) => compare(a.portId, b.portId)),
    }))
    const portCount = links.reduce((sum, link) => sum + link.ports.length, 0)
    const editablePortCount = links.reduce((sum, link) => sum + link.ports.filter(port => port.editable).length, 0)
    componentPortLinks += portCount
    sortedComponents[uuid] = {
      uuid,
      classNames: [...accumulator.classNames].sort(compare),
      types: [...accumulator.types].sort(compare),
      vehicles: links,
      summary: {
        vehicleCount: links.length,
        portCount,
        editablePortCount,
        uneditablePortCount: portCount - editablePortCount,
        onlyOnUneditablePorts: portCount > 0 && editablePortCount === 0,
      },
    }
  }

  return {
    formatVersion: LOADOUT_INDEX_FORMAT_VERSION,
    provenance: { ...provenance },
    counts: {
      vehicles: vehicles.size,
      components: components.size,
      componentPortLinks,
      emptyPorts,
    },
    vehicles: sortedVehicles,
    components: sortedComponents,
  }
}

/** Canonical bytes of the index: compact JSON, stable key order, one trailing newline, no timestamp. */
export function serializeLoadoutIndex(index: LoadoutIndex): string {
  return `${JSON.stringify(index)}\n`
}
