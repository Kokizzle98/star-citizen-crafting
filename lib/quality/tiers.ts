// Central quality tier configuration (INVENTORY_UX_V1_1 section 5.1).
//
// Display convention only: tiers never change lot identity (the merge key
// still uses the exact quality value) and never change weighting.
// The tier names and boundaries are a VECTOR presentation decision and are
// NOT official Star Citizen terminology.
//
// This file is the ONLY place for tier boundaries and tier colours.
// Colours are muted and checked for contrast on the dark VECTOR panels
// (>= 6.5:1 against #071b25). Colour is never shown without the tier name.

export type QualityTierId = 'SCRAP' | 'STANDARD' | 'BULK' | 'PRODUCTION' | 'PRIME' | 'PERFECT'

export type QualityTier = {
  id: QualityTierId
  label: string
  /** Inclusive lower bound. */
  min: number
  /** Inclusive upper bound. */
  max: number
  color: string
}

export const QUALITY_TIERS: readonly QualityTier[] = [
  { id: 'SCRAP', label: 'Scrap', min: 0, max: 499, color: '#c9917f' },
  { id: 'STANDARD', label: 'Standard', min: 500, max: 750, color: '#a3b8c2' },
  { id: 'BULK', label: 'Bulk', min: 751, max: 850, color: '#7fb4e0' },
  { id: 'PRODUCTION', label: 'Production', min: 851, max: 950, color: '#6fd1a8' },
  { id: 'PRIME', label: 'Prime', min: 951, max: 999, color: '#d9c46b' },
  { id: 'PERFECT', label: 'Perfect', min: 1000, max: 1000, color: '#d99be0' },
]

export const QUALITY_TIER_DISCLAIMER =
  'Stufennamen und Grenzen sind eine VECTOR-Konvention, keine offiziellen Star-Citizen-Begriffe.'

/** Range text for a tier, e.g. "500–750" or "1000". */
export const tierRangeLabel = (tier: QualityTier): string =>
  tier.min === tier.max ? `${tier.min}` : `${tier.min}–${tier.max}`

/** Tier of an integer quality 0 to 1000. Anything else is a caller bug. */
export function tierFor(quality: number): QualityTier {
  if (!Number.isInteger(quality)) throw new RangeError('QUALITY_NOT_INTEGER')
  const tier = QUALITY_TIERS.find(candidate => quality >= candidate.min && quality <= candidate.max)
  if (!tier) throw new RangeError('QUALITY_OUT_OF_RANGE')
  return tier
}

/** Aggregate average -> nearest integer, halves round up (e.g. 499.5 -> 500). */
export const roundAverageQuality = (average: number): number => Math.floor(average + 0.5)

/** Tier of an aggregate average: round first (halves up), then assign the tier. */
export const tierForAverage = (average: number): QualityTier => tierFor(roundAverageQuality(average))
