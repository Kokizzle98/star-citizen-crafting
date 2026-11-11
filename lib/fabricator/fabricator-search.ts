import type { FabricatorFamilyView } from './fabricator-catalog'

// Fabricator product search, ranking and filters (F2). Pure functions.
//
// Search only orders and narrows what is shown; it never creates, merges or
// changes a product family or variant (owner decision D1 = A). Ranking:
//   0 exact name > 1 name starts with > 2 a word of the name starts with
//   > 3 name contains > 4 another searchable field contains.
// Ties are broken by name (German collation) and then by the stable family key.

export type FabricatorCraftabilityFilterValue = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'UNRESOLVED' | 'CREW_UNAVAILABLE'

export type FabricatorSearchRow = {
  key: string
  name: string
  categoryKey: string
  categoryLabel: string
  sizeLabel: string | null
  craftability: FabricatorCraftabilityFilterValue
  nameText: string
  otherTexts: string[]
}

export type FabricatorFilters = { query: string; category: string; size: string; craftability: string }

export const EMPTY_FABRICATOR_FILTERS: FabricatorFilters = Object.freeze({ query: '', category: '', size: '', craftability: '' })
export const FABRICATOR_NO_SIZE = 'NONE'

export const normalizeSearchText = (value: string) => value.toLocaleLowerCase('de').normalize('NFC').trim()

export function toFabricatorSearchRow(
  family: FabricatorFamilyView,
  categoryLabel: string,
  craftability: FabricatorCraftabilityFilterValue,
  blueprintNames: readonly (string | null)[],
): FabricatorSearchRow {
  const others = [
    family.manufacturer, categoryLabel, family.categoryKey, ...family.subcategories, family.sizeLabel,
    ...family.variants.flatMap(variant => variant.components.map(component => component.itemName)),
    ...blueprintNames,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
  return {
    key: family.key,
    name: family.title,
    categoryKey: family.categoryKey,
    categoryLabel,
    sizeLabel: family.sizeLabel,
    craftability,
    nameText: normalizeSearchText(family.title),
    otherTexts: [...new Set(others.map(normalizeSearchText))],
  }
}

const BOUNDARY = /[^\p{L}\p{N}]/u

/** Match tier of one row for a normalized, non-empty query; null = no match. */
export function fabricatorMatchTier(row: Pick<FabricatorSearchRow, 'nameText' | 'otherTexts'>, query: string): number | null {
  const name = row.nameText
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  let index = name.indexOf(query)
  if (index >= 0) {
    while (index >= 0) {
      if (index > 0 && BOUNDARY.test(name[index - 1])) return 2
      index = name.indexOf(query, index + 1)
    }
    return 3
  }
  return row.otherTexts.some(text => text.includes(query)) ? 4 : null
}

const byName = (a: FabricatorSearchRow, b: FabricatorSearchRow) =>
  a.name.localeCompare(b.name, 'de', { sensitivity: 'base', numeric: true }) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

export function filterAndRankFabricatorRows(rows: readonly FabricatorSearchRow[], filters: FabricatorFilters): FabricatorSearchRow[] {
  const query = normalizeSearchText(filters.query)
  const ranked: { row: FabricatorSearchRow; tier: number }[] = []
  for (const row of rows) {
    if (filters.category && row.categoryKey !== filters.category) continue
    if (filters.size && (filters.size === FABRICATOR_NO_SIZE ? row.sizeLabel !== null : row.sizeLabel !== filters.size)) continue
    if (filters.craftability && row.craftability !== filters.craftability) continue
    const tier = query ? fabricatorMatchTier(row, query) : 0
    if (tier !== null) ranked.push({ row, tier })
  }
  return ranked.sort((a, b) => a.tier - b.tier || byName(a.row, b.row)).map(entry => entry.row)
}

export type FabricatorFilterOptions = {
  categories: { value: string; label: string }[]
  sizes: { value: string; label: string }[]
  craftability: FabricatorCraftabilityFilterValue[]
}

const CRAFTABILITY_ORDER: FabricatorCraftabilityFilterValue[] = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE', 'UNRESOLVED', 'CREW_UNAVAILABLE']

/** Filter options derived from the actual rows only. */
export function fabricatorFilterOptions(rows: readonly FabricatorSearchRow[]): FabricatorFilterOptions {
  const categories = new Map<string, string>()
  const sizes = new Set<string>()
  let withoutSize = false
  const craftability = new Set<FabricatorCraftabilityFilterValue>()
  for (const row of rows) {
    categories.set(row.categoryKey, row.categoryLabel)
    if (row.sizeLabel === null) withoutSize = true
    else sizes.add(row.sizeLabel)
    craftability.add(row.craftability)
  }
  return {
    categories: [...categories].map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de') || a.value.localeCompare(b.value)),
    sizes: [
      ...[...sizes].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(value => ({ value, label: value })),
      ...(withoutSize ? [{ value: FABRICATOR_NO_SIZE, label: 'Ohne Größe' }] : []),
    ],
    craftability: CRAFTABILITY_ORDER.filter(value => craftability.has(value)),
  }
}

export const FABRICATOR_DISPLAY_STEP = 100

/** Index after a keyboard step inside the shown results; clamps at both ends. */
export function nextActiveIndex(current: number, count: number, key: string): number {
  if (count === 0) return -1
  switch (key) {
    case 'ArrowDown': return current < 0 ? 0 : Math.min(current + 1, count - 1)
    case 'ArrowUp': return current < 0 ? 0 : Math.max(current - 1, 0)
    case 'Home': return 0
    case 'End': return count - 1
    default: return current
  }
}
