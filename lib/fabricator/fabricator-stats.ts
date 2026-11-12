// @ts-expect-error -- plain ES module of the unchanged engine VECTOR_CRAFT_CALC_V1 (allowJs = false); its shape is pinned by the local types below and by tests.
import { calculateCraft, combineEffects, interpolateModifier } from '../../src/calculation/craft-calculation-engine.js'
import type { FabricatorBaselineView, FabricatorPropertyView, FabricatorRecipeView, FabricatorSegmentView } from './fabricator-catalog'
import type { FabricatorResolution } from './fabricator-types'
import { speedFromMetresPerSecond } from './fabricator-units'

// Product stats per CONCRETE item (Fabricator F3). Pure and client-safe, so
// the MANUAL sliders update live without a server roundtrip. Every recipe
// material (slot) has its own input quality (as in SCMDB, which keys quality
// per slot); materials affecting the same stat stay separate inputs and only
// their effects combine, through the unchanged engine.
//
// Calculation identity: concrete item -> blueprint -> recipe -> per-slot input
// quality -> baseline of exactly this item -> SCMDB modifiers. Never a family
// value, never the functional fingerprint (OD-FAB-GROUP-03).
//
// Rules:
// - Only a RESOLVED baseline yields absolute base / crafted / delta values,
//   computed by the unchanged engine in source units; formatting comes later.
// - D4: a multiplicative effect without a RESOLVED baseline shows only the
//   relative crafting effect; no synthetic base or crafted value.
// - A quality outside every source segment of a modifier group makes the stat
//   unavailable for that quality (REVIEW_REQUIRED, QUALITY_OUTSIDE_SEGMENT);
//   there is no neutral fallback. (SCMDB itself falls back to its last
//   segment; VECTOR deliberately keeps the stricter F1 contract.)
// - Additive effects are exact only for constant integer segments (the only
//   shape in the LIVE dataset; SCMDB rounds additive values); anything else
//   stays REVIEW_REQUIRED.

type EngineStat = {
  propertyKey: string
  status: string
  baseValue: number | null
  craftedValue: number | null
  absoluteDelta: number | null
  percentDelta: number | null
}
type EngineEffect = { operation: 'MULTIPLICATIVE' | 'ADDITIVE'; value: number }
const engine = {
  calculateCraft: calculateCraft as (request: unknown) => { stats: EngineStat[] },
  combineEffects: combineEffects as (base: number, effects: EngineEffect[]) => { combinedMultiplier: number },
  interpolateModifier: interpolateModifier as (segment: unknown, quality: number) => number,
}

export type FabricatorStatReason = string | 'QUALITY_OUTSIDE_SEGMENT' | 'ADDITIVE_SHAPE_UNVERIFIED'

export type FabricatorStatRow = {
  propertyKey: string
  name: string
  unitFormat: string | null
  sourceUnit: 'm/s' | null
  operation: 'MULTIPLICATIVE' | 'ADDITIVE' | 'MIXED'
  /** Recipe slots whose material influences this stat (evidenced by the slot's modifiers only). */
  slotKeys: string[]
  status: FabricatorResolution
  /** Baseline reason, or why the stat is unavailable at this quality. */
  reason: FabricatorStatReason | null
  baseValue: number | null
  craftedValue: number | null
  absoluteDelta: number | null
  /** Relative to |base|; null for base 0 (never invented). */
  percentDelta: number | null
  /** D4 only: exact relative crafting effect in percent when no absolute baseline exists. */
  relativeEffectPercent: number | null
  /**
   * Per-material effect: the source modifier each slot contributes at its own
   * quality (multiplier for MULTIPLICATIVE, added value for ADDITIVE); null
   * when that slot's quality lies outside every source segment.
   */
  contributions: { slotKey: string; operation: 'MULTIPLICATIVE' | 'ADDITIVE'; quality: number; value: number | null }[]
}

/** Per-slot qualities from one value plus optional per-slot values (individual material qualities win). */
export function slotQualities(
  recipe: Pick<FabricatorRecipeView, 'slots'>,
  globalQuality: number,
  overrides: Readonly<Record<string, number>> = {},
): Record<string, number> {
  return Object.fromEntries(recipe.slots.map(slot => [slot.slotKey, overrides[slot.slotKey] ?? globalQuality]))
}

/** Material -> stat relation: the property keys each slot's modifiers affect (source order). */
export function affectedProperties(recipe: Pick<FabricatorRecipeView, 'slots'>): Record<string, string[]> {
  return Object.fromEntries(recipe.slots.map(slot => [slot.slotKey, slot.modifiers.map(group => group.propertyKey)]))
}

const constantInteger = ([, , atStart, atEnd]: FabricatorSegmentView) => atStart === atEnd && Number.isInteger(atStart)
const engineSegment = ([startQuality, endQuality, modifierStart, modifierEnd]: FabricatorSegmentView) =>
  ({ startQuality, endQuality, modifierStart, modifierEnd })

export function fabricatorStats(
  recipe: FabricatorRecipeView,
  baselines: Readonly<Record<string, FabricatorBaselineView>>,
  qualities: Readonly<Record<string, number>>,
  properties: Readonly<Record<string, FabricatorPropertyView>>,
): FabricatorStatRow[] {
  if (recipe.status !== 'RESOLVED') return []
  const order: string[] = []
  const groups = new Map<string, { slotKey: string; group: FabricatorRecipeView['slots'][number]['modifiers'][number] }[]>()
  for (const slot of recipe.slots) {
    for (const group of slot.modifiers) {
      if (!groups.has(group.propertyKey)) order.push(group.propertyKey)
      groups.set(group.propertyKey, [...(groups.get(group.propertyKey) ?? []), { slotKey: slot.slotKey, group }])
    }
  }

  return order.map(propertyKey => {
    const entries = groups.get(propertyKey)!
    const operations = new Set(entries.map(entry => entry.group.operation))
    const baseline: FabricatorBaselineView = baselines[propertyKey] ?? { status: 'UNRESOLVED', reason: 'PROPERTY_UNKNOWN' }
    const row: FabricatorStatRow = {
      propertyKey,
      name: properties[propertyKey]?.name ?? propertyKey,
      unitFormat: properties[propertyKey]?.unitFormat ?? null,
      sourceUnit: baseline.sourceUnit ?? null,
      operation: operations.size > 1 ? 'MIXED' : [...operations][0],
      slotKeys: [...new Set(entries.map(entry => entry.slotKey))],
      status: baseline.status,
      reason: baseline.reason ?? null,
      baseValue: null,
      craftedValue: null,
      absoluteDelta: null,
      percentDelta: null,
      relativeEffectPercent: null,
      contributions: [],
    }

    // Effective segment per slot at that slot's own quality; none = no source effect stated.
    const contributions = entries.map(({ slotKey, group }) => {
      const quality = qualities[slotKey]
      const segment = group.segments.find(([start, end]) => quality >= start && quality <= end)
      return {
        slotKey,
        operation: group.operation,
        quality,
        value: segment === undefined ? null : engine.interpolateModifier(engineSegment(segment), quality),
      }
    })
    row.contributions = contributions
    if (contributions.some(contribution => contribution.value === null)) {
      return { ...row, status: 'REVIEW_REQUIRED', reason: 'QUALITY_OUTSIDE_SEGMENT' }
    }
    if (entries.some(({ group }) => group.operation === 'ADDITIVE' && !group.segments.every(constantInteger))) {
      return { ...row, status: 'REVIEW_REQUIRED', reason: 'ADDITIVE_SHAPE_UNVERIFIED' }
    }
    const effects: EngineEffect[] = contributions.map(({ operation, value }) => ({ operation, value: value as number }))

    if (baseline.status === 'RESOLVED' && baseline.value !== undefined) {
      const result = engine.calculateCraft({
        baselines: { [propertyKey]: { status: 'RESOLVED', value: baseline.value } },
        modifiers: entries.map(({ slotKey, group }) => ({
          propertyKey,
          slotKey,
          operation: group.operation,
          segments: group.segments.map(engineSegment),
        })),
        qualities,
      }).stats[0]
      return {
        ...row,
        status: 'RESOLVED',
        reason: null,
        baseValue: result.baseValue,
        craftedValue: result.craftedValue,
        absoluteDelta: result.absoluteDelta,
        percentDelta: result.percentDelta,
      }
    }

    // D4: multiplicative only, exactly determined by the recipe, without an absolute value.
    if (row.operation === 'MULTIPLICATIVE') {
      const { combinedMultiplier } = engine.combineEffects(1, effects)
      return { ...row, relativeEffectPercent: (combinedMultiplier - 1) * 100 }
    }
    return row
  })
}

/** Parsed SCMDB printf display format ("%.2f M", "%+.2f ºC"); null when no number spec exists. */
export function parseUnitFormat(format: string | null): { decimals: number; signed: boolean; suffix: string } | null {
  if (!format) return null
  const match = /^%(\+?)\.(\d)f(.*)$/.exec(format)
  if (!match) return null
  return { signed: match[1] === '+', decimals: Number(match[2]), suffix: match[3].replace(/%%/g, '%').trimEnd() }
}

const formatNumber = (value: number, decimals: number, signed: boolean) => {
  const text = value.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return signed && value > 0 ? `+${text}` : text
}

/**
 * Display of a stat value in source semantics; calculation always happened
 * before, in source units. Quantum speed (raw m/s) is shown in SCMDB's Mm/s;
 * a SCMDB printf format supplies decimals and unit; without one the plain
 * number is shown (up to 2 decimals) and no unit is invented.
 */
export function formatStatValue(row: Pick<FabricatorStatRow, 'unitFormat' | 'sourceUnit'>, value: number, kind: 'value' | 'delta' = 'value'): string {
  const signed = kind === 'delta'
  if (row.sourceUnit === 'm/s') {
    const speed = speedFromMetresPerSecond(value)
    return `${formatNumber(speed.value, speed.decimals, signed)} ${speed.unit}`
  }
  const format = parseUnitFormat(row.unitFormat)
  if (format) return `${formatNumber(value, format.decimals, signed)}${format.suffix ? ` ${format.suffix.trim()}` : ''}`
  const text = value.toLocaleString('de-DE', { maximumFractionDigits: 2 })
  return signed && value > 0 ? `+${text}` : text
}

/** Percent display (2 decimals, always signed); null stays "—", never invented. */
export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${formatNumber(value, 2, true)} %`
}
