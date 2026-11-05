import type { InventoryRow } from './inventory-result'

export type InventorySort =
  | 'MATERIAL_ASC'
  | 'MATERIAL_DESC'
  | 'LOCATION_ASC'
  | 'LOCATION_DESC'
  | 'QUALITY_ASC'
  | 'QUALITY_DESC'
  | 'UPDATED_DESC'
  | 'UPDATED_ASC'

export type InventoryFilters = {
  query: string
  player: string
  locationId: string
  qualityMin: number | null
  qualityMax: number | null
}

function textCompare(a: string, b: string) {
  return a.localeCompare(b, 'de', { sensitivity: 'base' })
}

function lotIdCompare(a: InventoryRow, b: InventoryRow) {
  return BigInt(a.inventory_id) < BigInt(b.inventory_id) ? -1
    : BigInt(a.inventory_id) > BigInt(b.inventory_id) ? 1
    : 0
}

export function filterInventoryRows(rows: InventoryRow[], filters: InventoryFilters) {
  const query = filters.query.trim().toLocaleLowerCase('de')

  return rows.filter((row) => {
    if (query && ![row.material, row.player_name, row.location_name]
      .some((value) => value.toLocaleLowerCase('de').includes(query))) return false
    if (filters.player && row.player_name !== filters.player) return false
    if (filters.locationId && row.location_id !== filters.locationId) return false
    if (filters.qualityMin !== null && row.quality < filters.qualityMin) return false
    if (filters.qualityMax !== null && row.quality > filters.qualityMax) return false
    return true
  })
}

export function sortInventoryRows(rows: InventoryRow[], sort: InventorySort) {
  return [...rows].sort((a, b) => {
    let result = 0

    switch (sort) {
      case 'MATERIAL_ASC': result = textCompare(a.material, b.material); break
      case 'MATERIAL_DESC': result = textCompare(b.material, a.material); break
      case 'LOCATION_ASC': result = textCompare(a.location_name, b.location_name); break
      case 'LOCATION_DESC': result = textCompare(b.location_name, a.location_name); break
      case 'QUALITY_ASC': result = a.quality - b.quality; break
      case 'QUALITY_DESC': result = b.quality - a.quality; break
      case 'UPDATED_ASC': result = a.updated_at.localeCompare(b.updated_at); break
      case 'UPDATED_DESC': result = b.updated_at.localeCompare(a.updated_at); break
    }

    return result || lotIdCompare(a, b)
  })
}
