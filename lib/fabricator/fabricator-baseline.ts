import type { FabricatorItem, FabricatorPropertyDefinition, FabricatorResolution } from './fabricator-types'

// Baseline resolver for crafted stats (Fabricator F1).
//
// Only explicitly allowlisted, evidence-based source fields count as a
// baseline. The allowlist was verified against the LIVE mirror
// 4.10.2-live.12913470 in the Fabricator inventory (2026-11-11); historical
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
   * IDENTITY: the source value is used as is. UNVERIFIED: the value is exact,
   * but its relation to the SCMDB display unit is not verified yet; display
   * code must not convert it.
   */
  unitConversion: 'IDENTITY' | 'UNVERIFIED'
}

export const FABRICATOR_BASELINE_RULES: Readonly<Record<string, BaselineRule>> = Object.freeze({
  health_maxhealth: {
    path: ['health'],
    attachTypes: ['PowerPlant', 'Cooler', 'Shield', 'Radar', 'QuantumDrive', 'WeaponGun', 'WeaponMining',
      'DockingCollar', 'TractorBeam', 'SalvageHead'],
    unitConversion: 'IDENTITY',
  },
  itemresource_powergeneration: { path: ['powerOutput'], attachTypes: ['PowerPlant'], unitConversion: 'IDENTITY' },
  itemresource_coolantgeneration: { path: ['coolingRate'], attachTypes: ['Cooler'], unitConversion: 'IDENTITY' },
  shield_maxhealth: { path: ['shieldHealth'], attachTypes: ['Shield'], unitConversion: 'IDENTITY' },
  radar_minaimassistdistance: { path: ['minAimAssistRange'], attachTypes: ['Radar'], unitConversion: 'IDENTITY' },
  radar_maxaimassistdistance: { path: ['maxAimAssistRange'], attachTypes: ['Radar'], unitConversion: 'IDENTITY' },
  quantum_speed: { path: ['driveSpeed'], attachTypes: ['QuantumDrive'], unitConversion: 'UNVERIFIED' },
  weapon_tractor_maxdist: { path: ['maxDistance'], attachTypes: ['TractorBeam', 'SalvageHead'], unitConversion: 'IDENTITY' },
  weapon_tractor_fullstrengthdist: { path: ['fullStrengthDistance'], attachTypes: ['TractorBeam', 'SalvageHead'], unitConversion: 'IDENTITY' },
  weapon_tractor_maxvolume: { path: ['maxVolume'], attachTypes: ['TractorBeam', 'SalvageHead'], unitConversion: 'IDENTITY' },
  weapon_hullscraping_speed: { path: ['salvageSpeedMultiplier'], attachTypes: ['SalvageModifier'], unitConversion: 'IDENTITY' },
  weapon_hullscraping_radius: { path: ['radiusMultiplier'], attachTypes: ['SalvageModifier'], unitConversion: 'IDENTITY' },
  weapon_hullscraping_efficiency: { path: ['extractionEfficiency'], attachTypes: ['SalvageModifier'], unitConversion: 'IDENTITY' },
  armor_radiationdissipation: { path: ['radiationResistance', 'dissipationRate'], attachTypes: ARMOR_ATTACH_TYPES, unitConversion: 'IDENTITY' },
})

export type FabricatorBaselineReviewReason =
  | 'SIGNED_VALUE_MULTIPLIER_SEMANTICS_UNVERIFIED'
  | 'UNIT_UNVERIFIED'
  | 'MULTI_CHANNEL_SOURCE'
  | 'MULTI_MODE_SOURCE'
  | 'PERCENT_SEMANTICS_UNVERIFIED'
  | 'AMBIGUOUS_MIN_MAX_SOURCE'
  | 'NO_VERIFIED_SOURCE_FIELD'

/** Known properties whose baseline is deliberately not resolved yet, with the reason. */
export const FABRICATOR_BASELINE_REVIEW: Readonly<Record<string, FabricatorBaselineReviewReason>> = Object.freeze({
  armor_temperaturemin: 'SIGNED_VALUE_MULTIPLIER_SEMANTICS_UNVERIFIED',
  armor_temperaturemax: 'SIGNED_VALUE_MULTIPLIER_SEMANTICS_UNVERIFIED',
  quantum_fuelrequirement: 'UNIT_UNVERIFIED',
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
  unitConversion: 'IDENTITY' | 'UNVERIFIED' | null
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
    ({ propertyKey, status, value: null, sourcePath: null, unitFormat, unitConversion: null, reason })

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
    unitConversion: rule.unitConversion,
    reason: null,
  }
}
