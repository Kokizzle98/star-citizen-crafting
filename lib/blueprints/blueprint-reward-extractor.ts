import type {
  ScmdbBlueprintRewardDataset,
  ScmdbBlueprintRewardSource,
  ScmdbChannel,
} from './blueprint-types'

type ManifestChannel = {
  version: unknown
  files: {
    merged?: unknown
  }
}

type Manifest = {
  channels?: {
    live?: ManifestChannel
    ptu?: ManifestChannel
  }
}

type PoolEntry = {
  blueprintSourceGuid: string
  weight: number
  hasKnownIssue: boolean
}

type Pool = {
  name: string
  source: string
  hasKnownIssues: boolean
  entries: PoolEntry[]
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (!nonempty(value)) return undefined
  return value
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPools(input: unknown): Map<string, Pool> {
  if (!plainObject(input)) throw new Error('SCMDB_BLUEPRINT_POOLS_INVALID')

  const pools = new Map<string, Pool>()

  for (const [poolGuid, value] of Object.entries(input)) {
    if (!nonempty(poolGuid) || !plainObject(value)) {
      throw new Error('SCMDB_BLUEPRINT_POOL_INVALID')
    }

    if (!nonempty(value.name) || !nonempty(value.source) || !Array.isArray(value.blueprints)) {
      throw new Error('SCMDB_BLUEPRINT_POOL_INVALID')
    }

    const entries: PoolEntry[] = []

    for (const entry of value.blueprints) {
      if (!plainObject(entry) || !nonempty(entry.blueprintRecord) || !finiteNumber(entry.weight)) {
        throw new Error('SCMDB_BLUEPRINT_POOL_INVALID')
      }

      entries.push({
        blueprintSourceGuid: entry.blueprintRecord,
        weight: entry.weight,
        hasKnownIssue: entry.knownIssue !== undefined && entry.knownIssue !== null,
      })
    }

    pools.set(poolGuid, {
      name: value.name,
      source: value.source,
      hasKnownIssues: value.knownIssues !== undefined && value.knownIssues !== null,
      entries,
    })
  }

  return pools
}

/**
 * Normalizes the SCMDB mission reward relations of exactly one channel into
 * flat `contract x pool x blueprint` rows.
 *
 * This is import data only, kept so the relation is not lost. The
 * `where do I get this?` feature is DEFERRED: no runtime surface of the current
 * work package may depend on these rows.
 *
 * An unresolvable pool reference fails closed rather than being dropped,
 * because a relation that cannot be resolved must stay visible instead of
 * quietly disappearing from the import (PERSISTENCE_PROVENANCE_V1 §9).
 */
export function extractScmdbBlueprintRewards(
  manifestInput: unknown,
  mergedInput: unknown,
  channel: ScmdbChannel,
): ScmdbBlueprintRewardDataset {
  if (!plainObject(manifestInput)) {
    throw new Error('SCMDB_BLUEPRINT_REWARD_MANIFEST_INVALID')
  }

  const manifest = manifestInput as Manifest
  const channelKey = channel.toLowerCase() as 'live' | 'ptu'
  const channelManifest = manifest.channels?.[channelKey]

  if (
    !channelManifest ||
    !nonempty(channelManifest.version) ||
    !nonempty(channelManifest.files?.merged)
  ) {
    throw new Error('SCMDB_BLUEPRINT_REWARD_MANIFEST_INVALID')
  }

  if (!plainObject(mergedInput)) {
    throw new Error('SCMDB_BLUEPRINT_REWARD_DATASET_INVALID')
  }

  if (mergedInput.version !== channelManifest.version) {
    throw new Error('SCMDB_BLUEPRINT_REWARD_VERSION_MISMATCH')
  }

  if (!Array.isArray(mergedInput.contracts)) {
    throw new Error('SCMDB_BLUEPRINT_REWARD_DATASET_INVALID')
  }

  const pools = readPools(mergedInput.blueprintPools)
  const rewards: ScmdbBlueprintRewardSource[] = []
  const blueprintGuids = new Set<string>()
  const poolGuids = new Set<string>()
  const contractIds = new Set<string>()

  for (const contract of mergedInput.contracts) {
    if (!plainObject(contract)) throw new Error('SCMDB_BLUEPRINT_REWARD_CONTRACT_INVALID')

    const blueprintRewards = contract.blueprintRewards

    if (blueprintRewards === undefined || blueprintRewards === null) continue
    if (!Array.isArray(blueprintRewards)) {
      throw new Error('SCMDB_BLUEPRINT_REWARD_CONTRACT_INVALID')
    }
    if (blueprintRewards.length === 0) continue

    const category = nullableText(contract.category)
    const missionType = nullableText(contract.missionType)

    if (
      !nonempty(contract.id) ||
      !nonempty(contract.debugName) ||
      category === undefined ||
      missionType === undefined
    ) {
      throw new Error('SCMDB_BLUEPRINT_REWARD_CONTRACT_INVALID')
    }

    for (const reward of blueprintRewards) {
      if (
        !plainObject(reward) ||
        !nonempty(reward.blueprintPool) ||
        !nonempty(reward.trigger) ||
        !finiteNumber(reward.chance)
      ) {
        throw new Error('SCMDB_BLUEPRINT_REWARD_INVALID')
      }

      const pool = pools.get(reward.blueprintPool)

      if (!pool) throw new Error('SCMDB_BLUEPRINT_REWARD_POOL_UNRESOLVED')

      poolGuids.add(reward.blueprintPool)
      contractIds.add(contract.id)

      for (const entry of pool.entries) {
        blueprintGuids.add(entry.blueprintSourceGuid)

        rewards.push({
          blueprintSourceGuid: entry.blueprintSourceGuid,
          poolGuid: reward.blueprintPool,
          poolName: pool.name,
          poolSource: pool.source,
          contractId: contract.id,
          contractDebugName: contract.debugName,
          contractCategory: category,
          contractMissionType: missionType,
          trigger: reward.trigger,
          chance: reward.chance,
          weight: entry.weight,
          hasSourceKnownIssue: pool.hasKnownIssues || entry.hasKnownIssue,
        })
      }
    }
  }

  rewards.sort((a, b) =>
    a.blueprintSourceGuid.localeCompare(b.blueprintSourceGuid) ||
    a.contractId.localeCompare(b.contractId) ||
    a.poolGuid.localeCompare(b.poolGuid),
  )

  const combinations = new Set<string>()
  let duplicateSourceRows = 0

  for (const reward of rewards) {
    const key = `${reward.contractId}|${reward.poolGuid}|${reward.blueprintSourceGuid}`
    if (combinations.has(key)) duplicateSourceRows += 1
    combinations.add(key)
  }

  return {
    channel,
    version: channelManifest.version,
    sourceFile: channelManifest.files.merged,
    rewards,
    counts: {
      rewards: rewards.length,
      blueprints: blueprintGuids.size,
      pools: poolGuids.size,
      contracts: contractIds.size,
      withSourceKnownIssue: rewards.filter((reward) => reward.hasSourceKnownIssue).length,
      duplicateSourceRows,
    },
  }
}

/**
 * Reward blueprint identities that are not present in the given catalog.
 *
 * The import must not create a blueprint identity from a reward relation, so
 * an unresolved identity is reported instead of invented.
 */
export function unresolvedRewardBlueprints(
  rewards: ScmdbBlueprintRewardSource[],
  catalogSourceGuids: Iterable<string>,
): string[] {
  const known = new Set(catalogSourceGuids)
  const unresolved = new Set<string>()

  for (const reward of rewards) {
    if (!known.has(reward.blueprintSourceGuid)) unresolved.add(reward.blueprintSourceGuid)
  }

  return [...unresolved].sort((a, b) => a.localeCompare(b))
}
