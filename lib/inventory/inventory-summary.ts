// Pure presentation helpers for the inventory pages (INVENTORY_UX_V1_1 sections 5, 8.3, 9).
//
// - Material / location summary: quantity-weighted average quality (rounded to
//   the nearest integer, halves up, section 5.1) and the quality range.
// - KPI strip figures (UX-3b): distinct materials, volume lots, count lots,
//   lot count and the newest `updated_at`. Volume and count are never summed
//   together and there is no average across different materials.
// - Depth indicator text ("Ebene n von 2" / "Ebene n von 3", section 8.3).
//
// Nothing here reads or writes data. Rows passed in are the rows the list
// shows, i.e. after filtering (section 18, criterion 6).

import type { MaterialKind } from './inventory-display'
import type { InventoryRow } from './inventory-result'
import { QualityInputError, weightedQualityHalfUp, type QualityPart } from '../quality/quality-weighting'

export type MaterialUnitsLike = Readonly<Record<string, 'count' | 'volume'>>

export function materialKindOf(units: MaterialUnitsLike, material: string): MaterialKind {
  return Object.hasOwn(units, material) ? units[material] : undefined
}

/** Exact integer from a decimal text, scaled so that all rows share the same scale. */
function scaledDecimal(value: string, scale: number): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole + fraction.padEnd(scale, '0'))
}

/**
 * Weighting quantities of ONE dimension: micro-SCU for VOLUME, pieces for
 * COUNT (section 5). Unknown unit kind -> null (nothing is guessed).
 */
function qualityParts(rows: readonly InventoryRow[], kind: MaterialKind): QualityPart<string>[] | null {
  if (kind === 'volume') {
    return rows.map(row => ({ ref: row.inventory_id, quantity: BigInt(row.amount_micro_scu), quality: row.quality }))
  }
  if (kind === 'count') {
    const scale = Math.max(0, ...rows.map(row => (row.amount.split('.')[1] ?? '').length))
    return rows.map(row => ({ ref: row.inventory_id, quantity: scaledDecimal(row.amount, scale), quality: row.quality }))
  }
  return null
}

/**
 * Quantity-weighted average quality of the rows of ONE material, rounded to
 * the nearest integer (halves up). `null` when the unit kind is unknown, the
 * rows are empty or the total quantity is zero: the UI then shows "–".
 */
export function materialAverageQuality(rows: readonly InventoryRow[], kind: MaterialKind): number | null {
  const parts = qualityParts(rows, kind)
  if (parts === null || parts.length === 0) return null
  try {
    return weightedQualityHalfUp(parts)
  } catch (error) {
    if (error instanceof QualityInputError) return null
    throw error
  }
}

/** Minimum and maximum quality of the included lots; `null` for no lots. */
export function qualityRange(rows: readonly InventoryRow[]): { min: number; max: number } | null {
  if (rows.length === 0) return null
  let min = rows[0].quality
  let max = rows[0].quality
  for (const row of rows) {
    if (row.quality < min) min = row.quality
    if (row.quality > max) max = row.quality
  }
  return { min, max }
}

export type InventoryKpis = {
  /** Number of distinct materials. */
  materials: number
  /** Lots of volume materials (their sum is shown as SCU). */
  volumeRows: InventoryRow[]
  /** Lots of count materials (their sum is shown as pieces). */
  countRows: InventoryRow[]
  /** Lots whose material has no known unit; they are in neither sum. */
  unknownUnitLots: number
  /** Number of lots. */
  lots: number
  /** Newest `updated_at` (original text), `null` without lots. */
  latestUpdatedAt: string | null
}

export function inventoryKpis(rows: readonly InventoryRow[], units: MaterialUnitsLike): InventoryKpis {
  const volumeRows: InventoryRow[] = []
  const countRows: InventoryRow[] = []
  let unknownUnitLots = 0
  let latest: { time: number; text: string } | null = null
  for (const row of rows) {
    const kind = materialKindOf(units, row.material)
    if (kind === 'volume') volumeRows.push(row)
    else if (kind === 'count') countRows.push(row)
    else unknownUnitLots += 1
    const time = Date.parse(row.updated_at)
    if (Number.isFinite(time) && (latest === null || time > latest.time)) latest = { time, text: row.updated_at }
  }
  return {
    materials: new Set(rows.map(row => row.material)).size,
    volumeRows,
    countRows,
    unknownUnitLots,
    lots: rows.length,
    latestUpdatedAt: latest?.text ?? null,
  }
}

const DISPLAY_TIME_ZONE = 'Europe/Berlin'
const berlinFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function berlinParts(date: Date) {
  const parts = berlinFormat.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return { day: get('day'), month: get('month'), year: get('year'), hour: get('hour'), minute: get('minute') }
}

/**
 * "Zuletzt geändert": "heute, HH:mm" when the timestamp lies on the same
 * calendar day as `now` (Europe/Berlin), otherwise "TT.MM.JJJJ". Without
 * `now` (server render, first client render) it is always the date, so
 * server and client markup stay identical. No timestamp -> "–".
 */
export function formatLastChanged(iso: string | null, now: Date | null): string {
  if (iso === null) return '–'
  const changed = new Date(iso)
  if (Number.isNaN(changed.getTime())) return '–'
  const a = berlinParts(changed)
  const date = `${a.day}.${a.month}.${a.year}`
  if (now !== null) {
    const b = berlinParts(now)
    if (a.day === b.day && a.month === b.month && a.year === b.year) return `heute, ${a.hour}:${a.minute}`
  }
  return date
}

export type InventoryViewMode = 'GLOBAL' | 'LOCATION'

/**
 * Depth indicator text. Level = deepest currently expanded level:
 * everything collapsed = 1, an open material = 2, in LOCATION an open
 * location below an open material = 3.
 */
export function depthLabel(view: InventoryViewMode, materialOpen: boolean, locationOpen: boolean): string {
  const total = view === 'GLOBAL' ? 2 : 3
  const level = !materialOpen ? 1 : view === 'LOCATION' && locationOpen ? 3 : 2
  return `Ebene ${level} von ${total}`
}
