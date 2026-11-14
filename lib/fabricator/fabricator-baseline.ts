import type { FabricatorItem, FabricatorPropertyDefinition, FabricatorResolution } from './fabricator-types'

// Baseline resolver for crafted stats (Fabricator F1).
//
// Only explicitly allowlisted, evidence-based source fields count as a
// baseline. The allowlist was verified against the LIVE mirror
// 4.10.2-live.12913470 in the Fabricator inventory (2026-11-11) and, for
// semantics, against SCMDB itself (scmdb.net and its shipped code, the
// preferred source semantic reference for SCMDB-derived data); historical
// audit outputs (data/audit*, VECTOR_RESOLVER_MAPPING_V2.csv) are not used as
// authority. Anything else stays REVIEW_REQUIRED, SOURCE_DATA_MISSING or
// UNRESOLVED and is never calculated as an absolute value.

const ARMOR_ATTACH_TYPES = [
  'Char_Armor_Helmet', 'Char_Armor_Torso', 'Char_Armor_Arms', 'Char_Armor_Legs',
  'Char_Armor_Backpack', 'Char_Armor_Undersuit',
] as const

type BaselineRule = {
  /** Path inside the SCMDB item record; a single scalar leaf. */
  path: readonly string[]
  /** The item's attachType must be one of these. */
  attachTypes: readonly string[]
  /**
   * Raw unit of the source value when SCMDB evidence establishes it (display
   * conversion: fabricator-units.ts); null when the SCMDB unit format applies
   * to the raw value as is.
   */
  sourceUnit: 'm/s' | null
}

export const FABRICATOR_BASELINE_RULES: Readonly<Record<string, BaselineRule>> = Object.freeze({
  health_maxhealth: {
    path: ['health'],
    attachTypes: ['PowerPlant', 'Cooler', 'Shield', 'Radar', 'QuantumDrive', 'WeaponGun', 'WeaponMining',
      'DockingCollar', 'TractorBeam', 'SalvageHead'],
    sourceUnit: null,
  },
  itemresource_powergeneration: { path: ['powerOutput'], attachTypes: ['PowerPlant'], sourceUnit: null },
  itemresource_coolantgeneration: { path: ['coolingRate'], attachTypes: ['Cooler'], sourceUnit: null },
  shield_maxhealth: { path: ['shieldHealth'], attachTypes: ['Shield'], sourceUnit: null },
  radar_minaimassistdistance: { path: ['minAimAssistRange'], attachTypes: ['Radar'], sourceUnit: null },
  radar_maxaimassistdistance: { path: ['maxAimAssistRange'], attachTypes: ['Radar'], sourceUnit: null },
  // SCMDB evidence: raw m/s, crafted = driveSpeed * modifier, displayed as Mm/s (see fabricator-units.ts).
  quantum_speed: { path: ['driveSpeed'], attachTypes: ['QuantumDrive'], sourceUnit: 'm/s' },
  weapon_tractor_maxdist: { path: ['maxDistance'], attachTypes: ['TractorBeam', 'SalvageHead'], sourceUnit: null },
  weapon_tractor_fullstrengthdist: { path: ['fullStrengthDistance'], attachTypes: ['TractorBeam', 'SalvageHead'], sourceUnit: null },
  weapon_tractor_maxvolume: { path: ['maxVolume'], attachTypes: ['TractorBeam', 'SalvageHead'], sourceUnit: null },
  weapon_hullscraping_speed: { path: ['salvageSpeedMultiplier'], attachTypes: ['SalvageModifier'], sourceUnit: null },
  weapon_hullscraping_radius: { path: ['radiusMultiplier'], attachTypes: ['SalvageModifier'], sourceUnit: null },
  weapon_hullscraping_efficiency: { path: ['extractionEfficiency'], attachTypes: ['SalvageModifier'], sourceUnit: null },
  armor_radiationdissipation: { path: ['radiationResistance', 'dissipationRate'], attachTypes: ARMOR_ATTACH_TYPES, sourceUnit: null },
  // F3 SCMDB reconciliation (scmdb.net LIVE 4.10.2-live.12913470, shipped code and Fabricator view):
  // crafted = temperatureResistance.min / .max * modifier, a plain multiplication of the signed value
  // (TrueDef-Pro Arms at Q750: min -75.0 °C -> -82.5 °C shown as -10.00 %, max 75.0 °C -> 82.5 °C +10.00 %;
  // the percent is relative to |base|, exactly as VECTOR_CRAFT_CALC_V1).
  armor_temperaturemin: { path: ['temperatureResistance', 'min'], attachTypes: ARMOR_ATTACH_TYPES, sourceUnit: null },
  armor_temperaturemax: { path: ['temperatureResistance', 'max'], attachTypes: ARMOR_ATTACH_TYPES, sourceUnit: null },
})

export type FabricatorBaselineReviewReason =
  | 'UNIT_UNVERIFIED'
  | 'MULTI_CHANNEL_SOURCE'
  | 'MULTI_MODE_SOURCE'
  | 'PERCENT_SEMANTICS_UNVERIFIED'
  | 'AMBIGUOUS_MIN_MAX_SOURCE'
  | 'NO_VERIFIED_SOURCE_FIELD'

/** Known properties whose baseline is deliberately not resolved yet, with the reason. */
export const FABRICATOR_BASELINE_REVIEW: Readonly<Record<string, FabricatorBaselineReviewReason>> = Object.freeze({
  quantum_fuelrequirement: 'UNIT_UNVERIFIED',
  // SCMDB (F3): each of the six damage channels becomes 1 - (1 - multiplier) * modifier; one
  // property yields six values, so it stays out of the single-value stat model for now.
  armor_damagemitigation: 'MULTI_CHANNEL_SOURCE',
  weapon_damage: 'MULTI_CHANNEL_SOURCE',
  weapon_firerate: 'MULTI_MODE_SOURCE',
  weapon_recoil_handling: 'PERCENT_SEMANTICS_UNVERIFIED',
  weapon_recoil_smoothness: 'PERCENT_SEMANTICS_UNVERIFIED',
  weapon_recoil_kick: 'PERCENT_SEMANTICS_UNVERIFIED',
  weapon_tractor_force: 'AMBIGUOUS_MIN_MAX_SOURCE',
  armor_radiationcapacity: 'NO_VERIFIED_SOURCE_FIELD',
  weapon_reloadspeed: 'NO_VERIFIED_SOURCE_FIELD',
  weapon_spread: 'NO_VERIFIED_SOURCE_FIELD',
  crafter_craftspeed: 'NO_VERIFIED_SOURCE_FIELD',
  crafter_dismantleefficiency: 'NO_VERIFIED_SOURCE_FIELD',
})

export type FabricatorBaseline = {
  propertyKey: string
  status: FabricatorResolution
  /** Only set for RESOLVED. */
  value: number | null
  sourcePath: string | null
  unitFormat: string | null
  sourceUnit: 'm/s' | null
  reason:
    | FabricatorBaselineReviewReason
    | 'FIELD_MISSING'
    | 'ITEM_UNRESOLVED'
    | 'PROPERTY_UNKNOWN'
    | 'SCOPE_NOT_ALLOWLISTED'
    | null
}

function readPath(source: Readonly<Record<string, unknown>>, path: readonly string[]): unknown {
  let current: unknown = source
  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Resolves the baseline of one property for one item (null item = blueprint output unresolved). */
export function resolveFabricatorBaseline(
  propertyKey: string,
  item: FabricatorItem | null,
  properties: ReadonlyMap<string, FabricatorPropertyDefinition>,
): FabricatorBaseline {
  const unitFormat = properties.get(propertyKey)?.unitFormat ?? null
  const result = (status: FabricatorResolution, reason: FabricatorBaseline['reason']): FabricatorBaseline =>
    ({ propertyKey, status, value: null, sourcePath: null, unitFormat, sourceUnit: null, reason })

  if (!properties.has(propertyKey)) return result('UNRESOLVED', 'PROPERTY_UNKNOWN')
  if (item === null) return result('UNRESOLVED', 'ITEM_UNRESOLVED')

  const review = FABRICATOR_BASELINE_REVIEW[propertyKey]
  if (review) return result('REVIEW_REQUIRED', review)

  const rule = FABRICATOR_BASELINE_RULES[propertyKey]
  if (!rule) return result('UNRESOLVED', 'PROPERTY_UNKNOWN')
  if (!rule.attachTypes.includes(item.attachType)) return result('UNRESOLVED', 'SCOPE_NOT_ALLOWLISTED')

  const value = readPath(item.source, rule.path)
  if (typeof value !== 'number' || !Number.isFinite(value)) return result('SOURCE_DATA_MISSING', 'FIELD_MISSING')
  return {
    propertyKey,
    status: 'RESOLVED',
    value,
    sourcePath: rule.path.join('.'),
    unitFormat,
    sourceUnit: rule.sourceUnit,
    reason: null,
  }
}
