import { unresolvedRewardBlueprints } from './blueprint-reward-extractor'
import type {
  ClassifiedScmdbBlueprintDataset,
  ScmdbBlueprintRecipe,
  ScmdbBlueprintRewardDataset,
} from './blueprint-types'

/**
 * Builds the parameters of `public.sync_scmdb_blueprint_catalog()` from the
 * PR 1 readers' output.
 *
 * This is the only production mapping from the camelCase reader types to the
 * snake_case database payload. It is pure: no network, no environment, no
 * Supabase client. Every check fails closed before anything could be sent;
 * the database function repeats its own checks independently.
 *
 * Catalog data only. `scmdb_is_default` is passed through as a raw SCMDB value
 * and never becomes ownership; the payload carries no ownership field.
 */

/** The repository-pinned dataset a sync is allowed to send. LIVE only. */
export type ScmdbBlueprintSyncPin = {
  channel: 'LIVE'
  version: string
  blueprintTotal: number
  blueprintValid: number
  blueprintReviewRequired: number
  rewardTotal: number
  duplicateSourceRows: number
}

/**
 * Owner decision 2026-11-11: PR 3 syncs exactly the mirrored and tested LIVE
 * dataset. A newer SCMDB dataset is a separate data work package and changes
 * this pin together with the mirror and its tests. The pin is frozen and is
 * not a builder parameter: no caller can substitute another dataset.
 */
export const SCMDB_BLUEPRINT_LIVE_SYNC_PIN: Readonly<ScmdbBlueprintSyncPin> = Object.freeze({
  channel: 'LIVE',
  version: '4.10.2-live.12913470',
  blueprintTotal: 1618,
  blueprintValid: 1610,
  blueprintReviewRequired: 8,
  rewardTotal: 7480,
  duplicateSourceRows: 4,
})

export type ScmdbBlueprintSyncBlueprintRow = {
  source_guid: string
  source_tag: string
  product_entity_class: string
  product_name: string | null
  gear: string
  type: string | null
  subtype: string | null
  manufacturer: string | null
  recipe: ScmdbBlueprintRecipe
  scmdb_is_default: boolean
  cig_data_error: boolean
  scmdb_suggested_name: string | null
  review_state: 'VALID' | 'REVIEW_REQUIRED'
  issues: string[]
}

export type ScmdbBlueprintSyncRewardRow = {
  source_contract_id: string
  source_reward_index: number
  source_pool_guid: string
  source_pool_entry_index: number
  blueprint_source_guid: string
  pool_name: string
  pool_source: string
  contract_debug_name: string
  contract_category: string | null
  contract_mission_type: string | null
  trigger: string
  chance: number
  weight: number
  has_source_known_issue: boolean
}

/** Named RPC parameters, exactly as `sync_scmdb_blueprint_catalog()` declares them. */
export type ScmdbBlueprintSyncPayload = {
  p_source: 'SCMDB'
  p_channel: 'LIVE'
  p_version: string
  p_catalog_source_file: string
  p_reward_source_file: string
  p_blueprint_total: number
  p_blueprint_valid: number
  p_blueprint_review_required: number
  p_reward_total: number
  p_duplicate_source_rows: number
  p_blueprints: ScmdbBlueprintSyncBlueprintRow[]
  p_rewards: ScmdbBlueprintSyncRewardRow[]
}

function fail(code: string): never {
  throw new Error(`SCMDB_BLUEPRINT_PAYLOAD_${code}`)
}
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const index = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
const byCodepoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The database contract for SCMDB blueprint identities (`blueprints.source_guid`
 * CHECK and the sync function): a canonical lowercase UUID. Values are checked
 * as they are, never trimmed, lowercased or otherwise corrected.
 */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const canonicalUuid = (value: unknown): value is string =>
  typeof value === 'string' && CANONICAL_UUID.test(value)

/**
 * The field mapping only: reader rows to snake_case RPC rows, in a
 * deterministic order. It applies no policy (no channel, count, pin or
 * reference check) and must never be sent on its own; the sync path calls it
 * only through `buildScmdbBlueprintSyncPayload`. It exists separately so that
 * database contract tests can build a real PTU payload to prove that the SQL
 * function itself rejects PTU, without a second mapping implementation.
 *
 * Explicit field lists: nothing from a reader object is passed through
 * implicitly, so no ownership or other foreign field can reach the RPC.
 */
export function mapScmdbBlueprintSyncRows(
  catalog: Pick<ClassifiedScmdbBlueprintDataset, 'blueprints'>,
  rewards: Pick<ScmdbBlueprintRewardDataset, 'rewards'>,
): { blueprints: ScmdbBlueprintSyncBlueprintRow[]; rewards: ScmdbBlueprintSyncRewardRow[] } {
  const blueprints = catalog.blueprints.map((b): ScmdbBlueprintSyncBlueprintRow => ({
    source_guid: b.sourceGuid,
    source_tag: b.sourceTag,
    product_entity_class: b.productEntityClass,
    product_name: b.productName,
    gear: b.gear,
    type: b.type,
    subtype: b.subtype,
    manufacturer: b.manufacturer,
    recipe: structuredClone(b.recipe),
    scmdb_is_default: b.scmdbIsDefault,
    cig_data_error: b.scmdbCigDataError,
    scmdb_suggested_name: b.scmdbSuggestedName,
    review_state: b.reviewState,
    issues: [...b.issues],
  }))
  const rewardRows = rewards.rewards.map((r): ScmdbBlueprintSyncRewardRow => ({
    source_contract_id: r.contractId,
    source_reward_index: r.sourceRewardIndex,
    source_pool_guid: r.poolGuid,
    source_pool_entry_index: r.sourcePoolEntryIndex,
    blueprint_source_guid: r.blueprintSourceGuid,
    pool_name: r.poolName,
    pool_source: r.poolSource,
    contract_debug_name: r.contractDebugName,
    contract_category: r.contractCategory,
    contract_mission_type: r.contractMissionType,
    trigger: r.trigger,
    chance: r.chance,
    weight: r.weight,
    has_source_known_issue: r.hasSourceKnownIssue,
  }))

  // Deterministic order, independent of the reader's input order.
  blueprints.sort((a, b) => byCodepoint(a.source_guid, b.source_guid))
  rewardRows.sort((a, b) =>
    byCodepoint(a.source_contract_id, b.source_contract_id) ||
    a.source_reward_index - b.source_reward_index ||
    byCodepoint(a.source_pool_guid, b.source_pool_guid) ||
    a.source_pool_entry_index - b.source_pool_entry_index)
  return { blueprints, rewards: rewardRows }
}

export function buildScmdbBlueprintSyncPayload(
  catalog: ClassifiedScmdbBlueprintDataset,
  rewards: ScmdbBlueprintRewardDataset,
): ScmdbBlueprintSyncPayload {
  const pin = SCMDB_BLUEPRINT_LIVE_SYNC_PIN
  if (!catalog || !rewards) fail('INVALID')

  // LIVE only: PTU and anything else are rejected before any other check.
  if (catalog.channel !== 'LIVE' || rewards.channel !== 'LIVE') {
    fail('CHANNEL_UNSUPPORTED')
  }

  // Catalog and rewards must come from the same dataset.
  if (!nonempty(catalog.version) || catalog.version !== rewards.version ||
      !nonempty(catalog.sourceFile) || !nonempty(rewards.sourceFile)) {
    fail('DATASET_MISMATCH')
  }

  if (!Array.isArray(catalog.blueprints) || !catalog.counts ||
      !Array.isArray(rewards.rewards) || !rewards.counts) {
    fail('INVALID')
  }

  // Blueprints: stable source GUIDs unique, classification recounted.
  const guids = new Set<string>()
  let valid = 0
  let reviewRequired = 0
  for (const b of catalog.blueprints) {
    if (!b || typeof b.scmdbIsDefault !== 'boolean' ||
        typeof b.scmdbCigDataError !== 'boolean' || !Array.isArray(b.issues) || !b.recipe) {
      fail('INVALID')
    }
    if (!canonicalUuid(b.sourceGuid)) fail('INVALID_GUID')
    if (guids.has(b.sourceGuid)) fail('DUPLICATE_GUID')
    guids.add(b.sourceGuid)
    if (b.reviewState === 'VALID' && b.issues.length === 0) valid++
    else if (b.reviewState === 'REVIEW_REQUIRED' && b.issues.length > 0) reviewRequired++
    else fail('INVALID')
  }
  const blueprintTotal = catalog.blueprints.length
  if (blueprintTotal !== catalog.counts.total || valid !== catalog.counts.valid ||
      reviewRequired !== catalog.counts.reviewRequired) {
    fail('COUNT_MISMATCH')
  }

  // Rewards: every reference resolves inside this catalog (no fallback, no
  // synthetic blueprint), every source occurrence is unique.
  for (const r of rewards.rewards) {
    if (!r || !nonempty(r.contractId) || !nonempty(r.poolGuid) ||
        !index(r.sourceRewardIndex) || !index(r.sourcePoolEntryIndex)) {
      fail('INVALID')
    }
    // Checked before resolution, so a malformed reference is reported as
    // such and never matched against a corrected form.
    if (!canonicalUuid(r.blueprintSourceGuid)) fail('INVALID_GUID')
  }
  if (unresolvedRewardBlueprints(rewards.rewards, guids).length > 0) fail('UNRESOLVED_REFERENCE')

  const occurrences = new Set<string>()
  const businessReferences = new Set<string>()
  for (const r of rewards.rewards) {
    const occurrence = JSON.stringify([r.contractId, r.sourceRewardIndex, r.poolGuid, r.sourcePoolEntryIndex])
    if (occurrences.has(occurrence)) fail('DUPLICATE_OCCURRENCE')
    occurrences.add(occurrence)
    businessReferences.add(JSON.stringify([r.contractId, r.poolGuid, r.blueprintSourceGuid]))
  }
  const rewardTotal = rewards.rewards.length
  if (rewardTotal !== rewards.counts.rewards) fail('COUNT_MISMATCH')

  // Duplicate business references are real source rows and stay separate;
  // their number is recomputed and must match what the reader declared.
  const duplicateSourceRows = rewardTotal - businessReferences.size
  if (duplicateSourceRows !== rewards.counts.duplicateSourceRows) fail('DUPLICATE_COUNT_MISMATCH')

  // Only the repository-pinned dataset may be sent.
  if (catalog.version !== pin.version || blueprintTotal !== pin.blueprintTotal ||
      valid !== pin.blueprintValid || reviewRequired !== pin.blueprintReviewRequired ||
      rewardTotal !== pin.rewardTotal || duplicateSourceRows !== pin.duplicateSourceRows) {
    fail('PIN_MISMATCH')
  }

  const rows = mapScmdbBlueprintSyncRows(catalog, rewards)
  return {
    p_source: 'SCMDB',
    p_channel: 'LIVE',
    p_version: catalog.version,
    p_catalog_source_file: catalog.sourceFile,
    p_reward_source_file: rewards.sourceFile,
    p_blueprint_total: blueprintTotal,
    p_blueprint_valid: valid,
    p_blueprint_review_required: reviewRequired,
    p_reward_total: rewardTotal,
    p_duplicate_source_rows: duplicateSourceRows,
    p_blueprints: rows.blueprints,
    p_rewards: rows.rewards,
  }
}
