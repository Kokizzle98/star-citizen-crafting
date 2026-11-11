// Display units reconstructed from SCMDB itself (owner decision 2026-11-11:
// SCMDB is the preferred source semantic reference for SCMDB-derived data).
//
// Quantum drive speed (`quantum_speed`, item field `driveSpeed`):
// - raw unit is m/s: scmdb.net (LIVE 4.10.2-live.12913470) shows the Agni raw
//   value 585715600 as "585715600 m/s" in its m/s view and as "585.72 Mm/s";
//   TS-2 509717800 is shown as "509.72 Mm/s";
// - the shipped scmdb.net code divides `driveSpeed` by a fixed factor per unit:
//   m/s = 1 (0 decimals), km/s = 1e3 (1), Mm/s = 1e6 (2), Gm/s = 1e9 (3);
// - the crafted value is `driveSpeed * quantum_speed modifier`, i.e. the same
//   multiplicative semantics as VECTOR_CRAFT_CALC_V1.
// The conversion is display only; calculations always use the raw m/s value.

export type FabricatorSpeedUnit = 'm/s' | 'km/s' | 'Mm/s' | 'Gm/s'

export const SCMDB_SPEED_UNITS: Readonly<Record<FabricatorSpeedUnit, { factor: number; decimals: number }>> =
  Object.freeze({
    'm/s': { factor: 1, decimals: 0 },
    'km/s': { factor: 1e3, decimals: 1 },
    'Mm/s': { factor: 1e6, decimals: 2 },
    'Gm/s': { factor: 1e9, decimals: 3 },
  })

/** SCMDB's default quantum speed display unit. */
export const DEFAULT_SPEED_UNIT: FabricatorSpeedUnit = 'Mm/s'

/** Converts a raw m/s value into a display value; fails closed on non-finite input. */
export function speedFromMetresPerSecond(valueMs: number, unit: FabricatorSpeedUnit = DEFAULT_SPEED_UNIT) {
  const definition = SCMDB_SPEED_UNITS[unit]
  if (!definition || !Number.isFinite(valueMs)) throw new Error('FABRICATOR_UNIT_INVALID')
  return { value: valueMs / definition.factor, decimals: definition.decimals, unit }
}
