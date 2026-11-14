// Version guard between the repository-pinned LIVE SCMDB mirror and the
// ACTIVE LIVE blueprint dataset in the database (owner decision D3 = A).
//
// This is a correctness and security contract, not a convenience check:
// recipe material identity is the exact SCMDB name and is only valid inside
// one dataset version. Any mismatch fails closed; there is no fallback to
// another channel, another mirror or another version.

export type ActiveBlueprintDatasetRow = {
  id: unknown
  source: unknown
  channel: unknown
  version: unknown
  status: unknown
  blueprint_total: unknown
}

export type FabricatorMirrorIdentity = {
  channel: 'LIVE'
  version: string
  blueprintTotal: number
}

export type FabricatorDatasetGuardResult =
  | { status: 'MATCH'; datasetId: string; version: string }
  | { status: 'DATASET_UNAVAILABLE' }
  | { status: 'DATASET_AMBIGUOUS' }
  | { status: 'CHANNEL_MISMATCH' }
  | { status: 'VERSION_MISMATCH'; mirrorVersion: string; databaseVersion: string }
  | { status: 'BLUEPRINT_TOTAL_MISMATCH'; mirrorTotal: number; databaseTotal: number }

/**
 * Compares the mirror with the ACTIVE database dataset rows. `rows` must be
 * the result of selecting ACTIVE SCMDB LIVE datasets; anything other than
 * exactly one valid row fails closed.
 */
export function guardFabricatorDataset(
  mirror: FabricatorMirrorIdentity,
  rows: readonly ActiveBlueprintDatasetRow[] | null | undefined,
): FabricatorDatasetGuardResult {
  if (mirror.channel !== 'LIVE') return { status: 'CHANNEL_MISMATCH' }
  if (!Array.isArray(rows) || rows.length === 0) return { status: 'DATASET_UNAVAILABLE' }
  if (rows.length > 1) return { status: 'DATASET_AMBIGUOUS' }

  const row = rows[0]
  if (typeof row.id !== 'string' || row.source !== 'SCMDB' || row.status !== 'ACTIVE' ||
      typeof row.version !== 'string' || typeof row.blueprint_total !== 'number') {
    return { status: 'DATASET_UNAVAILABLE' }
  }
  if (row.channel !== 'LIVE') return { status: 'CHANNEL_MISMATCH' }
  if (row.version !== mirror.version) {
    return { status: 'VERSION_MISMATCH', mirrorVersion: mirror.version, databaseVersion: row.version }
  }
  if (row.blueprint_total !== mirror.blueprintTotal) {
    return { status: 'BLUEPRINT_TOTAL_MISMATCH', mirrorTotal: mirror.blueprintTotal, databaseTotal: row.blueprint_total }
  }
  return { status: 'MATCH', datasetId: row.id, version: row.version }
}
