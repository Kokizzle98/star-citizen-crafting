import type { FabricatorModifierGroup, FabricatorRecipe } from './fabricator-types'

// Adapter: validated SCMDB recipe modifiers -> input contract of the existing
// calculation engine `VECTOR_CRAFT_CALC_V1` (src/calculation). The engine is
// used unchanged; this file only maps field names and fails closed on any
// shape the engine contract does not describe.
//
//   SCMDB                        engine
//   modifierAtStart           -> segments[].modifierStart
//   modifierAtEnd             -> segments[].modifierEnd
//   additive: true            -> operation: 'ADDITIVE'
//   additive absent / false   -> operation: 'MULTIPLICATIVE'
//
// Quality is supplied per slot key. F3 starts with one global MANUAL quality
// (owner decision D2 = C); per-slot overrides are NEXT and already fit this
// input shape.

export class FabricatorAdapterError extends Error {
  constructor(readonly code: string) {
    super(`FABRICATOR_ADAPTER_${code}`)
  }
}

export type CraftCalculationSegment = {
  startQuality: number
  endQuality: number
  modifierStart: number
  modifierEnd: number
}

export type CraftCalculationModifier = {
  propertyKey: string
  slotKey: string
  operation: 'MULTIPLICATIVE' | 'ADDITIVE'
  segments: CraftCalculationSegment[]
}

export type FabricatorQualityInput = {
  globalQuality: number
  /** Optional per-slot overrides (NEXT); keys must be recipe slot keys. */
  slotOverrides?: Readonly<Record<string, number>>
}

const integerQuality = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1000

function adaptGroup(group: FabricatorModifierGroup, slotKey: string): CraftCalculationModifier {
  if (group.operation !== 'MULTIPLICATIVE' && group.operation !== 'ADDITIVE') throw new FabricatorAdapterError('OPERATION_INVALID')
  if (!Array.isArray(group.segments) || group.segments.length === 0) throw new FabricatorAdapterError('SEGMENTS_INVALID')
  let previousEnd = -1
  const segments = group.segments.map(segment => {
    const { startQuality, endQuality, modifierAtStart, modifierAtEnd } = segment
    if (!integerQuality(startQuality) || !integerQuality(endQuality) || endQuality < startQuality ||
        startQuality <= previousEnd || !Number.isFinite(modifierAtStart) || !Number.isFinite(modifierAtEnd) ||
        (startQuality === endQuality && modifierAtStart !== modifierAtEnd)) {
      throw new FabricatorAdapterError('SEGMENTS_INVALID')
    }
    previousEnd = endQuality
    return { startQuality, endQuality, modifierStart: modifierAtStart, modifierEnd: modifierAtEnd }
  })
  return { propertyKey: group.propertyKey, slotKey, operation: group.operation, segments }
}

/** All recipe modifiers in the engine's input shape. */
export function toCraftCalculationModifiers(recipe: FabricatorRecipe): CraftCalculationModifier[] {
  return recipe.slots.flatMap(slot => slot.modifiers.map(group => adaptGroup(group, slot.slotKey)))
}

/** Per-slot quality map for the engine; fails closed on invalid or unknown input. */
export function toCraftCalculationQualities(
  recipe: FabricatorRecipe,
  input: FabricatorQualityInput,
): Record<string, number> {
  if (!integerQuality(input.globalQuality)) throw new FabricatorAdapterError('QUALITY_INVALID')
  const slotKeys = new Set(recipe.slots.map(slot => slot.slotKey))
  const overrides = input.slotOverrides ?? {}
  for (const [slotKey, quality] of Object.entries(overrides)) {
    if (!slotKeys.has(slotKey)) throw new FabricatorAdapterError('QUALITY_SLOT_UNKNOWN')
    if (!integerQuality(quality)) throw new FabricatorAdapterError('QUALITY_INVALID')
  }
  return Object.fromEntries(recipe.slots.map(slot => [slot.slotKey, overrides[slot.slotKey] ?? input.globalQuality]))
}

/**
 * Modifier groups whose source segments do not cover the requested quality.
 * The source states no effect there, so the affected stat must stay
 * unavailable for that quality instead of assuming a neutral modifier.
 */
export function uncoveredModifiers(
  recipe: FabricatorRecipe,
  qualities: Readonly<Record<string, number>>,
): { slotKey: string; propertyKey: string }[] {
  return recipe.slots.flatMap(slot => slot.modifiers
    .filter(group => !group.segments.some(segment =>
      qualities[slot.slotKey] >= segment.startQuality && qualities[slot.slotKey] <= segment.endQuality))
    .map(group => ({ slotKey: slot.slotKey, propertyKey: group.propertyKey })))
}
