import { decideScmdbLocationPromotability } from './location-promotability'
import type { EvaluatedScmdbLocation } from './location-promotability'

type Channel = 'LIVE' | 'PTU'
type Mapping = { channel: Channel; sourceKey: string; inventoryLocationId: string; isActive: boolean }
type InventoryLocation = { id: string; normalizedName: string; isSystem: boolean; isArchived: boolean }
type Evaluation = {
  promotable: EvaluatedScmdbLocation[]
  catalogOnly: EvaluatedScmdbLocation[]
  counts: { total: number; promotable: number; catalogOnly: number }
}
type ConflictReason = 'EXISTING_VECTOR_NAME' | 'DUPLICATE_SCMDB_NAME'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const conflictName = (canonicalName: string) => canonicalName.replace(/^ +| +$/g, '').toLowerCase()
const invalid = (): never => { throw new Error('SCMDB_PROMOTION_PLAN_INVALID') }
const keyOrder = (a: { sourceKey: string }, b: { sourceKey: string }) =>
  a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : 0

export function planScmdbLocationPromotion(
  channel: Channel,
  evaluation: Evaluation,
  mappings: readonly Mapping[],
  inventoryLocations: readonly InventoryLocation[],
) {
  if (channel !== 'LIVE' && channel !== 'PTU') invalid()
  const locationsById = new Map<string, InventoryLocation>()
  const existingNames = new Set<string>()
  for (const location of inventoryLocations) {
    if (!uuid.test(location.id) || !nonempty(location.normalizedName) ||
      typeof location.isSystem !== 'boolean' || typeof location.isArchived !== 'boolean' ||
      locationsById.has(location.id.toLowerCase())) invalid()
    locationsById.set(location.id.toLowerCase(), location)
    existingNames.add(location.normalizedName)
  }
  const bySource = new Map<string, Mapping>()
  const mappingIds = new Set<string>()
  for (const mapping of mappings) {
    if ((mapping.channel !== 'LIVE' && mapping.channel !== 'PTU') ||
      !nonempty(mapping.sourceKey) || !uuid.test(mapping.inventoryLocationId) ||
      typeof mapping.isActive !== 'boolean') invalid()
    const sourceIdentity = JSON.stringify([mapping.channel, mapping.sourceKey])
    const locationIdentity = JSON.stringify([mapping.channel, mapping.inventoryLocationId.toLowerCase()])
    if (bySource.has(sourceIdentity) || mappingIds.has(locationIdentity)) invalid()
    const target = locationsById.get(mapping.inventoryLocationId.toLowerCase())
    if (!target || target.isSystem) invalid()
    bySource.set(sourceIdentity, mapping)
    mappingIds.add(locationIdentity)
  }
  const seen = new Set<string>()
  for (const [part, expected] of [[evaluation.promotable, 'PROMOTABLE'], [evaluation.catalogOnly, 'CATALOG_ONLY']] as const) {
    for (const item of part) {
      if (!nonempty(item.sourceKey) || seen.has(item.sourceKey) || item.sourceKey !== item.location.sourceKey ||
        !nonempty(item.location.canonicalName) || !nonempty(item.location.normalizedName)) invalid()
      const actual = decideScmdbLocationPromotability(item.location)
      if (item.decision !== expected || actual.decision !== expected || item.reason !== actual.reason) invalid()
      seen.add(item.sourceKey)
    }
  }
  if (evaluation.counts.total !== seen.size || evaluation.counts.promotable !== evaluation.promotable.length ||
    evaluation.counts.catalogOnly !== evaluation.catalogOnly.length ||
    evaluation.counts.total !== evaluation.counts.promotable + evaluation.counts.catalogOnly) invalid()

  const rows = [...evaluation.promotable].sort(keyOrder)
  const unmappedNameCounts = new Map<string, number>()
  for (const item of rows) {
    if (!bySource.has(JSON.stringify([channel, item.sourceKey]))) {
      const name = conflictName(item.location.canonicalName)
      unmappedNameCounts.set(name, (unmappedNameCounts.get(name) ?? 0) + 1)
    }
  }
  const alreadyMapped: { sourceKey: string; inventoryLocationId: string }[] = []
  const safeNew: { sourceKey: string; canonicalName: string; normalizedName: string }[] = []
  const conflicts: { sourceKey: string; reason: ConflictReason }[] = []
  for (const item of rows) {
    const mapping = bySource.get(JSON.stringify([channel, item.sourceKey]))
    const name = conflictName(item.location.canonicalName)
    if (mapping) {
      alreadyMapped.push({ sourceKey: item.sourceKey, inventoryLocationId: mapping.inventoryLocationId })
    } else if ((unmappedNameCounts.get(name) ?? 0) > 1) {
      conflicts.push({ sourceKey: item.sourceKey, reason: 'DUPLICATE_SCMDB_NAME' })
    } else if (name === 'unbekannt' || existingNames.has(name)) {
      conflicts.push({ sourceKey: item.sourceKey, reason: 'EXISTING_VECTOR_NAME' })
    } else {
      safeNew.push({ sourceKey: item.sourceKey, canonicalName: item.location.canonicalName, normalizedName: name })
    }
  }
  const counts = { promotable: rows.length, alreadyMapped: alreadyMapped.length, safeNew: safeNew.length, conflicts: conflicts.length }
  if (counts.promotable !== counts.alreadyMapped + counts.safeNew + counts.conflicts) invalid()
  return { alreadyMapped, safeNew, conflicts, counts }
}
