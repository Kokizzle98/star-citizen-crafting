import type { BlueprintCatalogRow, BlueprintOwnershipStatus } from './blueprint-catalog-result'

// Pure, client-side search, filter, sort and display limit for the fully
// loaded LIVE catalog (owner decision PR4-OD-02 = A).

export const BLUEPRINT_DISPLAY_STEP = 100

/** Filter value for rows whose field is empty in the source. */
export const BLUEPRINT_FILTER_NONE = '__NONE__'

export type BlueprintSort = 'NAME_ASC' | 'NAME_DESC' | 'MANUFACTURER_ASC' | 'TYPE_ASC'

export type BlueprintFilters = {
  query: string
  gear: string
  type: string
  manufacturer: string
  ownership: '' | BlueprintOwnershipStatus
  review: '' | 'REVIEW_REQUIRED'
}

export const EMPTY_BLUEPRINT_FILTERS: BlueprintFilters = {
  query: '', gear: '', type: '', manufacturer: '', ownership: '', review: '',
}

export type BlueprintListRow = BlueprintCatalogRow & {
  displayName: string
  gearLabel: string
  typeLabel: string
  searchText: string
}

export type BlueprintStatusLookup = (blueprintId: string) => BlueprintOwnershipStatus

function lower(value: string) {
  return value.toLocaleLowerCase('de')
}

function textCompare(a: string, b: string) {
  return a.localeCompare(b, 'de', { sensitivity: 'base' })
}

/** The SCMDB product name, or the source tag when SCMDB has no name. */
export function blueprintDisplayName(row: Pick<BlueprintCatalogRow, 'product_name' | 'source_tag'>) {
  return row.product_name ?? row.source_tag
}

export function toBlueprintListRows(
  rows: BlueprintCatalogRow[],
  gearLabel: (gear: string) => string,
  typeLabel: (type: string | null) => string,
): BlueprintListRow[] {
  return rows.map((row) => {
    const displayName = blueprintDisplayName(row)
    const labels = { gearLabel: gearLabel(row.gear), typeLabel: typeLabel(row.type) }
    const searchText = lower([
      displayName, row.source_tag, row.manufacturer ?? '', row.subtype ?? '', row.type ?? '',
      labels.typeLabel, labels.gearLabel,
    ].join('\n'))
    return { ...row, displayName, ...labels, searchText }
  })
}

function matchesNullable(value: string | null, filter: string) {
  if (!filter) return true
  if (filter === BLUEPRINT_FILTER_NONE) return value === null
  return value === filter
}

export function filterBlueprintRows(
  rows: BlueprintListRow[],
  filters: BlueprintFilters,
  statusOf: BlueprintStatusLookup,
) {
  const query = lower(filters.query.trim())
  return rows.filter((row) => {
    if (query && !row.searchText.includes(query)) return false
    if (filters.gear && row.gear !== filters.gear) return false
    if (!matchesNullable(row.type, filters.type)) return false
    if (!matchesNullable(row.manufacturer, filters.manufacturer)) return false
    if (filters.review && row.review_state !== filters.review) return false
    if (filters.ownership && statusOf(row.blueprint_id) !== filters.ownership) return false
    return true
  })
}

/** Empty values sort last in every direction; ties are broken by the stable blueprint id. */
function nullableCompare(a: string | null, b: string | null, descending = false) {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  return descending ? textCompare(b, a) : textCompare(a, b)
}

export function sortBlueprintRows(rows: BlueprintListRow[], sort: BlueprintSort) {
  return [...rows].sort((a, b) => {
    let result = 0
    switch (sort) {
      case 'NAME_ASC': result = nullableCompare(a.product_name, b.product_name); break
      case 'NAME_DESC': result = nullableCompare(a.product_name, b.product_name, true); break
      case 'MANUFACTURER_ASC': result = nullableCompare(a.manufacturer, b.manufacturer); break
      case 'TYPE_ASC': result = nullableCompare(a.type === null ? null : a.typeLabel, b.type === null ? null : b.typeLabel); break
    }
    if (!result && sort !== 'NAME_ASC' && sort !== 'NAME_DESC') result = nullableCompare(a.product_name, b.product_name)
    if (!result) result = textCompare(a.displayName, b.displayName)
    return result || (a.blueprint_id < b.blueprint_id ? -1 : a.blueprint_id > b.blueprint_id ? 1 : 0)
  })
}

export type BlueprintFilterOption = { value: string; label: string }

/** Filter options come from the loaded data, never from a hard-coded list. */
export function blueprintFilterOptions(rows: BlueprintListRow[], noTypeLabel: string, noManufacturerLabel: string) {
  const gears = new Map<string, string>()
  const types = new Map<string, string>()
  const manufacturers = new Set<string>()
  let typeNone = false
  let manufacturerNone = false
  for (const row of rows) {
    gears.set(row.gear, row.gearLabel)
    if (row.type === null) typeNone = true
    else types.set(row.type, row.typeLabel)
    if (row.manufacturer === null) manufacturerNone = true
    else manufacturers.add(row.manufacturer)
  }
  const byLabel = (a: BlueprintFilterOption, b: BlueprintFilterOption) => textCompare(a.label, b.label)
  return {
    gears: [...gears].map(([value, label]) => ({ value, label })).sort(byLabel),
    types: [
      ...[...types].map(([value, label]) => ({ value, label })).sort(byLabel),
      ...(typeNone ? [{ value: BLUEPRINT_FILTER_NONE, label: noTypeLabel }] : []),
    ],
    manufacturers: [
      ...[...manufacturers].map((value) => ({ value, label: value })).sort(byLabel),
      ...(manufacturerNone ? [{ value: BLUEPRINT_FILTER_NONE, label: noManufacturerLabel }] : []),
    ],
  }
}

/** Number of further rows the "show more" control adds (at most one step). */
export function nextBlueprintStep(total: number, limit: number) {
  return Math.max(0, Math.min(BLUEPRINT_DISPLAY_STEP, total - limit))
}
