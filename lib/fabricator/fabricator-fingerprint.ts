import type { FabricatorBlueprint, FabricatorItem, FabricatorLiveSource } from './fabricator-types'

// Functional Crafting Fingerprint (Fabricator F1.1, owner decision OD-FAB-GROUP-02).
//
// A canonical, deterministic description of what an item IS functionally when
// crafted: slot, recipe structure, material identities, exact quantities and
// units, minQuality, quality modifier curves and its functional base stats.
//
// Contract:
// - verification / classification ONLY: it may confirm functional equality,
//   make a functional deviation visible and provide review evidence;
// - it NEVER creates a product family, never joins two products without a
//   structural source relation and never overrides a structural relation;
// - it contains no display names, no tags, no manufacturer and no entity id;
// - it is not a calculation identity: calculation stays per concrete item.

export const FABRICATOR_FINGERPRINT_VERSION = 'FCF1'

/** Item fields that identify or label an item rather than describe its function. */
const NON_FUNCTIONAL_ITEM_FIELDS: ReadonlySet<string> = new Set([
  'entityClass', 'name', 'correctedName', 'tags', 'knownIssue', 'manufacturer', 'manufacturerCode',
])

/** Canonical JSON: object keys sorted recursively, arrays kept in source order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
}

/**
 * Functional base stats: every source field except the identity / label
 * fields; pooled stats (`xIndex`) are resolved to the pool entry they point to,
 * so two items with equal pooled values compare equal. An index that does not
 * resolve makes the stats unresolvable (null).
 */
export function functionalBaseStats(
  item: FabricatorItem,
  pools: ReadonlyMap<string, readonly unknown[]>,
): Record<string, unknown> | null {
  const stats: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item.source)) {
    if (NON_FUNCTIONAL_ITEM_FIELDS.has(key)) continue
    const pool = pools.get(key)
    if (pool) {
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= pool.length) return null
      stats[`${key.slice(0, -'Index'.length)}`] = pool[value as number]
      continue
    }
    stats[key] = value
  }
  return stats
}

/**
 * The fingerprint of one concrete item produced by one blueprint, or null when
 * no reliable comparison is possible (recipe not RESOLVED, or pooled stats
 * not resolvable).
 */
export function functionalFingerprint(
  source: Pick<FabricatorLiveSource, 'version' | 'pools'>,
  blueprint: FabricatorBlueprint,
  item: FabricatorItem,
): string | null {
  if (blueprint.recipe.status !== 'RESOLVED') return null
  const stats = functionalBaseStats(item, source.pools)
  if (stats === null) return null
  return canonicalJson({
    version: FABRICATOR_FINGERPRINT_VERSION,
    dataset: source.version,
    slot: item.attachType,
    recipe: blueprint.recipe.recipe.slots.map(slot => ({
      slot: slot.name,
      kind: slot.material.kind,
      material: slot.material.name,
      unit: slot.material.unit,
      amount: slot.material.unit === 'SCU' ? slot.material.amountMicroScu : slot.material.amount,
      minQuality: slot.material.minQuality,
      modifiers: slot.modifiers.map(group => ({
        property: group.propertyKey,
        operation: group.operation,
        segments: group.segments.map(segment =>
          [segment.startQuality, segment.endQuality, segment.modifierAtStart, segment.modifierAtEnd]),
      })),
    })),
    stats,
  })
}

export type FabricatorFunctionalClass = 'FUNCTIONALLY_EQUIVALENT' | 'FUNCTIONALLY_DIFFERENT' | 'UNRESOLVED'

/**
 * Classifies the members of ONE structurally established comparison group
 * (same family, same slot, different variants). Never forms a group itself.
 *
 * - fewer than two comparable members: UNRESOLVED (nothing to compare with);
 * - all comparable members equal: FUNCTIONALLY_EQUIVALENT;
 * - otherwise the fingerprint held by a strict majority is the reference:
 *   members with it are FUNCTIONALLY_EQUIVALENT, the others
 *   FUNCTIONALLY_DIFFERENT; without a strict majority every comparable member
 *   is FUNCTIONALLY_DIFFERENT;
 * - members without a fingerprint: UNRESOLVED.
 */
export function classifyFunctionalGroup(fingerprints: readonly (string | null)[]): FabricatorFunctionalClass[] {
  const comparable = fingerprints.filter((fingerprint): fingerprint is string => fingerprint !== null)
  if (comparable.length < 2) return fingerprints.map(() => 'UNRESOLVED')
  const counts = new Map<string, number>()
  for (const fingerprint of comparable) counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1)
  let reference: string | null = null
  for (const [fingerprint, count] of counts) if (count * 2 > comparable.length) reference = fingerprint
  return fingerprints.map(fingerprint => {
    if (fingerprint === null) return 'UNRESOLVED'
    return fingerprint === reference ? 'FUNCTIONALLY_EQUIVALENT' : 'FUNCTIONALLY_DIFFERENT'
  })
}
