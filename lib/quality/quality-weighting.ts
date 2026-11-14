// Quantity-weighted quality primitives (Fabricator F3; reusable by inventory).
//
// Contracts:
// - INVENTORY_UX_V1 §5: an aggregated quality is always quantity-weighted;
//   volume uses the canonical internal volume quantity (micro-SCU), COUNT uses
//   pieces. The caller passes quantities of ONE dimension only; volume and
//   count are never weighted against each other.
// - OQ-F3-1 (owner domain evidence, 2026-11-12): the quality of one recipe
//   input is weighted over the quantities actually used; only the used part
//   of a lot counts (0.8 SCU Q900 + 0.2 SCU of a Q600 lot = Q840).
// - D-F3-1: rounding never promises a higher quality than reachable, so every
//   integer result is rounded down.
//
// All quantities are exact integers (bigint). Nothing here reads, reserves,
// consumes or changes inventory.

export const QUALITY_MIN = 0
export const QUALITY_MAX = 1000

/** One quantity of one quality; `ref` identifies the source (e.g. a lot id). */
export type QualityPart<T = string> = {
  ref: T
  quantity: bigint
  quality: number
}

export type QualitySummary = {
  /** Sum of all quantities (same dimension). */
  quantity: bigint
  /** Quantity-weighted quality, rounded down; null when the quantity is zero. */
  weightedQuality: number | null
  minQuality: number | null
  maxQuality: number | null
  partCount: number
}

export class QualityInputError extends Error {
  constructor(readonly code: 'QUANTITY_INVALID' | 'QUALITY_INVALID') {
    super(`QUALITY_${code}`)
  }
}

export const isQuality = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= QUALITY_MIN && (value as number) <= QUALITY_MAX

function assertPart(part: QualityPart<unknown>): void {
  if (typeof part.quantity !== 'bigint' || part.quantity <= 0n) throw new QualityInputError('QUANTITY_INVALID')
  if (!isQuality(part.quality)) throw new QualityInputError('QUALITY_INVALID')
}

/** Integer Q0–1000 from an exact weighted sum, rounded down. */
function floorQuality(weightedSum: bigint, quantity: bigint): number {
  return Number(weightedSum / quantity)
}

/** Level-1 summary: quantity-weighted quality over all given parts (one dimension). */
export function summarizeQuality<T>(parts: readonly QualityPart<T>[]): QualitySummary {
  let quantity = 0n
  let weighted = 0n
  let min: number | null = null
  let max: number | null = null
  for (const part of parts) {
    assertPart(part)
    quantity += part.quantity
    weighted += part.quantity * BigInt(part.quality)
    min = min === null ? part.quality : Math.min(min, part.quality)
    max = max === null ? part.quality : Math.max(max, part.quality)
  }
  return {
    quantity,
    weightedQuality: quantity === 0n ? null : floorQuality(weighted, quantity),
    minQuality: min,
    maxQuality: max,
    partCount: parts.length,
  }
}

/**
 * Quantity-weighted quality rounded to the nearest integer, halves up
 * (INVENTORY_UX_V1_1 section 5.1, display of aggregates). Exact bigint
 * arithmetic; reuses the same validation as `summarizeQuality`. The
 * Fabricator rounds DOWN (D-F3-1) and is not affected by this function.
 */
export function weightedQualityHalfUp<T>(parts: readonly QualityPart<T>[]): number | null {
  let quantity = 0n
  let weighted = 0n
  for (const part of parts) {
    assertPart(part)
    quantity += part.quantity
    weighted += part.quantity * BigInt(part.quality)
  }
  return quantity === 0n ? null : Number((2n * weighted + quantity) / (2n * quantity))
}

export type QualitySelection<T = string> = {
  status: 'COVERED' | 'INSUFFICIENT' | 'NONE'
  required: bigint
  /** Total quantity of all candidate parts. */
  available: bigint
  /**
   * The used parts (partial use of the last part allowed). For COVERED their
   * quantities sum to exactly `required`; otherwise all candidates are listed.
   */
  used: QualityPart<T>[]
  /** Weighted quality of `used`, rounded down; only set for COVERED. */
  quality: number | null
}

/**
 * Best reachable quantity-weighted quality for exactly `required` units.
 *
 * Taking the highest qualities first (and only the needed part of the last
 * one) maximizes the weighted mean for a fixed total, so a small high-quality
 * amount can never raise the result above what the full requirement reaches.
 * Ties are broken deterministically (larger quantity first, then input order).
 * The caller filters candidates (material, dimension, minQuality) beforehand.
 */
export function selectBestQuality<T>(required: bigint, candidates: readonly QualityPart<T>[]): QualitySelection<T> {
  if (typeof required !== 'bigint' || required <= 0n) throw new QualityInputError('QUANTITY_INVALID')
  candidates.forEach(assertPart)
  const ordered = candidates
    .map((part, index) => ({ part, index }))
    .sort((a, b) => b.part.quality - a.part.quality ||
      (a.part.quantity === b.part.quantity ? a.index - b.index : a.part.quantity > b.part.quantity ? -1 : 1))
    .map(entry => entry.part)
  const available = ordered.reduce((sum, part) => sum + part.quantity, 0n)
  if (available === 0n) return { status: 'NONE', required, available, used: [], quality: null }
  if (available < required) return { status: 'INSUFFICIENT', required, available, used: ordered, quality: null }

  const used: QualityPart<T>[] = []
  let remaining = required
  let weighted = 0n
  for (const part of ordered) {
    if (remaining === 0n) break
    const take = part.quantity < remaining ? part.quantity : remaining
    used.push({ ref: part.ref, quantity: take, quality: part.quality })
    weighted += take * BigInt(part.quality)
    remaining -= take
  }
  return { status: 'COVERED', required, available, used, quality: floorQuality(weighted, required) }
}
