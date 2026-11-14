import { readFabricatorRecipe } from './fabricator-recipe'
import type {
  FabricatorBlueprint,
  FabricatorItem,
  FabricatorLiveSource,
  FabricatorPropertyDefinition,
} from './fabricator-types'

// Pure preparation of the repository-pinned LIVE SCMDB mirror for the
// Fabricator (owner decision D3 = A). LIVE only: there is no PTU path and no
// cross-channel fallback. Dataset-level problems fail closed with an error
// code; problems inside one blueprint recipe stay visible as REVIEW_REQUIRED.

export const FABRICATOR_CHANNEL = 'LIVE' as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const VERSION = /^\d+\.\d+\.\d+-live\.\d+$/

function fail(code: string): never {
  throw new Error(`FABRICATOR_SOURCE_${code}`)
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableText(value: unknown, code: string): string | null {
  if (value === null || value === undefined) return null
  if (!nonempty(value)) fail(code)
  return value
}

export type FabricatorLiveFiles = { version: string; blueprintFile: string; itemFile: string }

/** Reads the LIVE file names from `data/scmdb/latest.json`; PTU is never consulted. */
export function liveFilesFromManifest(manifest: unknown): FabricatorLiveFiles {
  if (!plainObject(manifest) || !plainObject(manifest.channels)) fail('MANIFEST_INVALID')
  const live = manifest.channels.live
  if (!plainObject(live) || !plainObject(live.files)) fail('MANIFEST_LIVE_MISSING')
  const version = live.version
  if (!nonempty(version) || !VERSION.test(version)) fail('MANIFEST_LIVE_VERSION_INVALID')
  const blueprintFile = live.files.crafting_blueprints
  const itemFile = live.files.crafting_items
  if (blueprintFile !== `crafting_blueprints-${version}.json` || itemFile !== `crafting_items-${version}.json`) {
    fail('MANIFEST_LIVE_FILES_INVALID')
  }
  return { version, blueprintFile, itemFile }
}

function readProperties(input: unknown): Map<string, FabricatorPropertyDefinition> {
  if (!plainObject(input)) fail('PROPERTIES_INVALID')
  const properties = new Map<string, FabricatorPropertyDefinition>()
  for (const [key, value] of Object.entries(input)) {
    if (!nonempty(key) || !plainObject(value) || !nonempty(value.name) || !nonempty(value.category)) {
      fail('PROPERTIES_INVALID')
    }
    properties.set(key, {
      key,
      name: value.name,
      unitFormat: nullableText(value.unit, 'PROPERTIES_INVALID'),
      category: value.category,
    })
  }
  return properties
}

function readNameSet(input: unknown, code: string): Set<string> {
  if (!Array.isArray(input) || !input.every(nonempty)) fail(code)
  const names = new Set<string>(input)
  if (names.size !== input.length) fail(code)
  return names
}

/** `<name>Pools` arrays of the item document, keyed by the item field `<name>Index`. */
function readPools(itemDocument: Record<string, unknown>): Map<string, readonly unknown[]> {
  const pools = new Map<string, readonly unknown[]>()
  for (const [key, value] of Object.entries(itemDocument)) {
    if (!key.endsWith('Pools')) continue
    if (!Array.isArray(value)) fail('POOLS_INVALID')
    pools.set(`${key.slice(0, -'Pools'.length)}Index`, Object.freeze([...value]))
  }
  return pools
}

function readItems(input: unknown): Map<string, FabricatorItem> {
  if (!Array.isArray(input)) fail('ITEMS_INVALID')
  const items = new Map<string, FabricatorItem>()
  for (const raw of input) {
    if (!plainObject(raw) || !nonempty(raw.entityClass) || !UUID.test(raw.entityClass) ||
        !nonempty(raw.itemType) || !nonempty(raw.attachType)) {
      fail('ITEMS_INVALID')
    }
    if (items.has(raw.entityClass)) fail('ITEMS_DUPLICATE_ENTITY_CLASS')
    const size = raw.size
    if (size !== null && size !== undefined && !(Number.isInteger(size) && (size as number) >= 0)) fail('ITEMS_INVALID')
    items.set(raw.entityClass, Object.freeze({
      entityClass: raw.entityClass,
      name: nullableText(raw.name, 'ITEMS_INVALID'),
      itemType: raw.itemType,
      attachType: raw.attachType,
      attachSubType: nullableText(raw.attachSubType, 'ITEMS_INVALID'),
      size: (size ?? null) as number | null,
      manufacturer: nullableText(raw.manufacturer, 'ITEMS_INVALID'),
      manufacturerCode: nullableText(raw.manufacturerCode, 'ITEMS_INVALID'),
      source: Object.freeze({ ...raw }),
    }))
  }
  return items
}

/**
 * Prepares the LIVE Fabricator source from the parsed manifest, blueprint and
 * item documents. Both documents must carry exactly the manifest's LIVE
 * version; the material vocabulary is the one the inventory uses
 * (lib/inventory/material-units.ts) and is valid only for this version.
 */
export function prepareFabricatorLiveSource(
  manifest: unknown,
  blueprintDocument: unknown,
  itemDocument: unknown,
): FabricatorLiveSource {
  const files = liveFilesFromManifest(manifest)
  if (!plainObject(blueprintDocument) || !plainObject(itemDocument)) fail('DOCUMENT_INVALID')
  if (blueprintDocument.version !== files.version || itemDocument.version !== files.version) {
    fail('DOCUMENT_VERSION_MISMATCH')
  }

  const properties = readProperties(blueprintDocument.properties)
  const resources = readNameSet(blueprintDocument.resources, 'VOCABULARY_INVALID')
  const itemNames = readNameSet(blueprintDocument.items, 'VOCABULARY_INVALID')
  for (const name of resources) if (itemNames.has(name)) fail('VOCABULARY_AMBIGUOUS')
  const items = readItems(itemDocument.items)

  if (!Array.isArray(blueprintDocument.blueprints)) fail('BLUEPRINTS_INVALID')
  const context = { datasetVersion: files.version, resources, items: itemNames, properties }
  const guids = new Set<string>()
  const blueprints: FabricatorBlueprint[] = blueprintDocument.blueprints.map(raw => {
    if (!plainObject(raw) || !nonempty(raw.guid) || !UUID.test(raw.guid) || !nonempty(raw.tag) ||
        !nonempty(raw.productEntityClass) || !nonempty(raw.gear)) {
      fail('BLUEPRINTS_INVALID')
    }
    if (guids.has(raw.guid)) fail('BLUEPRINTS_DUPLICATE_GUID')
    guids.add(raw.guid)
    return {
      sourceGuid: raw.guid,
      sourceTag: raw.tag,
      productEntityClass: raw.productEntityClass,
      productName: nullableText(raw.productName, 'BLUEPRINTS_INVALID'),
      manufacturer: nullableText(raw.manufacturer, 'BLUEPRINTS_INVALID'),
      gear: raw.gear,
      type: nullableText(raw.type, 'BLUEPRINTS_INVALID'),
      subtype: nullableText(raw.subtype, 'BLUEPRINTS_INVALID'),
      recipe: readFabricatorRecipe(raw.tiers, context),
    }
  })

  return {
    channel: FABRICATOR_CHANNEL,
    version: files.version,
    blueprintFile: files.blueprintFile,
    itemFile: files.itemFile,
    blueprints,
    items,
    properties,
    vocabulary: { resources, items: itemNames },
    pools: readPools(itemDocument),
  }
}
