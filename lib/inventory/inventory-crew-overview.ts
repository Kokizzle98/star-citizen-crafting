// Pure derivations for the Crew Inventory overview (UX-4, INVENTORY_UX_V1_1
// sections 2, 8.3, 9, 16). Everything is computed from the rows the list
// shows (after filtering); nothing is read or written here. There is no
// player level in the tree: the player stays a column and a filter.
//
// - Player count per material: distinct `owner_user_id` of its lots.
// - Quality distribution: how many materials sit in which tier, by the
//   rounded weighted average of the material. Only VOLUME materials count;
//   COUNT and unknown-unit materials are reported separately and never mixed.
// - Player overview: one entry per `owner_user_id` (never grouped by name).

import type { InventoryRow } from './inventory-result'
import { materialAverageQuality, materialKindOf, type MaterialUnitsLike } from './inventory-summary'
import { QUALITY_TIERS, tierFor, type QualityTier } from '../quality/tiers'

/** Number of distinct owners among the lots of one material. */
export function materialPlayerCount(rows: readonly InventoryRow[]): number {
  return new Set(rows.map(row => row.owner_user_id)).size
}

/** "1 Spieler" / "n Spieler". */
export const playerCountLabel = (count: number): string => `${count} Spieler`

function groupByMaterial(rows: readonly InventoryRow[]): Map<string, InventoryRow[]> {
  const groups = new Map<string, InventoryRow[]>()
  for (const row of rows) {
    const group = groups.get(row.material)
    if (group) group.push(row)
    else groups.set(row.material, [row])
  }
  return groups
}

export type QualityDistribution = {
  /** Every tier in configured order, also with 0 materials. */
  tiers: { tier: QualityTier; materials: number }[]
  /** VOLUME materials with an average (= sum of `tiers`). */
  counted: number
  /** COUNT (piece) materials: not part of the distribution. */
  countMaterials: number
  /** Materials with an unknown unit: not part of the distribution. */
  unknownUnitMaterials: number
  /** VOLUME materials without a usable average (e.g. zero quantity). */
  withoutAverage: number
}

export function qualityDistribution(rows: readonly InventoryRow[], units: MaterialUnitsLike): QualityDistribution {
  const counts = new Map<string, number>(QUALITY_TIERS.map(tier => [tier.id, 0]))
  let counted = 0
  let countMaterials = 0
  let unknownUnitMaterials = 0
  let withoutAverage = 0
  for (const [material, materialRows] of groupByMaterial(rows)) {
    const kind = materialKindOf(units, material)
    if (kind === 'count') { countMaterials += 1; continue }
    if (kind !== 'volume') { unknownUnitMaterials += 1; continue }
    const average = materialAverageQuality(materialRows, kind)
    if (average === null) { withoutAverage += 1; continue }
    const tier = tierFor(average)
    counts.set(tier.id, (counts.get(tier.id) ?? 0) + 1)
    counted += 1
  }
  return {
    tiers: QUALITY_TIERS.map(tier => ({ tier, materials: counts.get(tier.id) ?? 0 })),
    counted, countMaterials, unknownUnitMaterials, withoutAverage,
  }
}

export type PlayerOverviewEntry = {
  ownerUserId: string
  playerName: string
  lots: number
  materials: number
}

/** One entry per owner (`owner_user_id`), sorted by name, then by id. */
export function playerOverview(rows: readonly InventoryRow[]): PlayerOverviewEntry[] {
  const owners = new Map<string, { name: string; lots: number; materials: Set<string> }>()
  for (const row of rows) {
    const owner = owners.get(row.owner_user_id)
    if (owner) {
      owner.lots += 1
      owner.materials.add(row.material)
    } else {
      owners.set(row.owner_user_id, { name: row.player_name, lots: 1, materials: new Set([row.material]) })
    }
  }
  return [...owners.entries()]
    .map(([ownerUserId, owner]) => ({ ownerUserId, playerName: owner.name, lots: owner.lots, materials: owner.materials.size }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName, 'de', { sensitivity: 'base' }) || a.ownerUserId.localeCompare(b.ownerUserId))
}
