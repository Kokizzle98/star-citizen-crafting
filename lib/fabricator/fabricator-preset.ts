import type { FabricatorRecipeCraftability } from './fabricator-craftability'

// Inventory-aware AVAILABLE PRESET and MANUAL quality inputs (Fabricator F3).
//
// Owner decision D-F3-1 (2026-11-12): every recipe slot keeps its own best
// really available input quality (shown per material and used as that
// material's initial individual quality); the common preset is the LOWEST of
// these slot values, the highest common quality all required slots reach
// when the global bulk control sets every material to one value. It is not an
// inventory average, not a slot average and not the crafted item quality.
//
// Owner correction (2026-11-12, acceptance points 3 / 4): every
// quality-relevant material has its own MANUAL quality; the global control is
// only a bulk helper that sets all materials at once and never couples them.
//
// No preset exists when any slot is not covered by the usable personal and
// crew lots, when the recipe or a material is unresolved, or without crew
// inventory. Uncovered materials then start at DEFAULT_MANUAL_QUALITY and the
// UI says that no inventory preset exists. Read-only: nothing is reserved or consumed.

export const DEFAULT_MANUAL_QUALITY = 500

export type FabricatorAvailablePreset =
  | { status: 'AVAILABLE'; quality: number; slotQualities: Record<string, number> }
  | { status: 'NONE'; reason: 'NO_CREW_INVENTORY' | 'NOT_COVERED' | 'UNRESOLVED' }

export function availablePreset(craftability: FabricatorRecipeCraftability | null): FabricatorAvailablePreset {
  if (craftability === null) return { status: 'NONE', reason: 'NO_CREW_INVENTORY' }
  if (craftability.status === 'UNRESOLVED' || craftability.slots.length === 0) return { status: 'NONE', reason: 'UNRESOLVED' }
  if (craftability.status !== 'AVAILABLE' || craftability.slots.some(slot => slot.quality === null)) {
    return { status: 'NONE', reason: 'NOT_COVERED' }
  }
  const slotQualities = Object.fromEntries(craftability.slots.map(slot => [slot.slotKey, slot.quality as number]))
  return { status: 'AVAILABLE', quality: Math.min(...Object.values(slotQualities)), slotQualities }
}

/**
 * Initial individual quality per material (slot) when an item is opened: the
 * slot's own best really available quality (D-F3-1: each slot keeps its own
 * value), otherwise the neutral default. Values stay independent afterwards.
 */
export function initialSlotQualities(
  slots: readonly { slotKey: string }[],
  craftability: FabricatorRecipeCraftability | null,
): Record<string, number> {
  return Object.fromEntries(slots.map((slot, index) =>
    [slot.slotKey, craftability?.slots[index]?.quality ?? DEFAULT_MANUAL_QUALITY]))
}

/** Bulk action: every material to the same value (explicit user action only). */
export function setAllSlotQualities(slots: readonly { slotKey: string }[], quality: number): Record<string, number> {
  return Object.fromEntries(slots.map(slot => [slot.slotKey, quality]))
}

/** The global bulk value when an item is opened: the common available preset, otherwise the neutral default. */
export function initialManualQuality(preset: FabricatorAvailablePreset): number {
  return preset.status === 'AVAILABLE' ? preset.quality : DEFAULT_MANUAL_QUALITY
}

/** Strict MANUAL input parsing: integer Q0–1000, clamped; never NaN, Infinity or blank. */
export function clampManualQuality(input: unknown, fallback: number): number {
  const number = typeof input === 'number' ? input : typeof input === 'string' && input.trim() !== '' ? Number(input) : Number.NaN
  if (!Number.isFinite(number)) return fallback
  return Math.min(1000, Math.max(0, Math.round(number)))
}

/** Keyboard steps of a MANUAL quality slider (Arrow ±1, PageUp/PageDown ±10, Home/End). */
export function manualQualityKeyStep(key: string, current: number): number | null {
  switch (key) {
    case 'ArrowUp': case 'ArrowRight': return clampManualQuality(current + 1, current)
    case 'ArrowDown': case 'ArrowLeft': return clampManualQuality(current - 1, current)
    case 'PageUp': return clampManualQuality(current + 10, current)
    case 'PageDown': return clampManualQuality(current - 10, current)
    case 'Home': return 0
    case 'End': return 1000
    default: return null
  }
}
