import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [rewardSource, extractorSource, manifestText] = await Promise.all([
  read('lib/blueprints/blueprint-reward-extractor.ts'),
  read('lib/blueprints/blueprint-extractor.ts'),
  read('data/scmdb/latest.json'),
])

const moduleUrl = source => {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
}

const { extractScmdbBlueprintRewards, unresolvedRewardBlueprints } = await import(
  moduleUrl(rewardSource)
)
const { extractScmdbBlueprints } = await import(moduleUrl(extractorSource))
const manifest = JSON.parse(manifestText)

// Both channels contain the same two SCMDB pools that reference one blueprint
// twice; SCMDB documents both as probable CIG copy-paste errors. That yields
// two duplicate rows per channel, which are kept and counted rather than
// collapsed.
const expected = {
  LIVE: {
    rewards: 7480,
    blueprints: 678,
    pools: 110,
    contracts: 672,
    knownIssue: 86,
    duplicates: 4,
  },
  PTU: {
    rewards: 7502,
    blueprints: 693,
    pools: 125,
    contracts: 680,
    knownIssue: 86,
    duplicates: 4,
  },
}

// The PTU merged dataset references blueprint identities that the PTU blueprint
// catalog of the same revision does not contain. This is a source-side
// referential gap: it is reported, never invented, and never completed from the
// LIVE catalog.
const unresolvedPtuRewardBlueprints = [
  '018a29dc-d128-4697-b181-a885c60ee29c',
  '04fa9b45-45a6-4dae-a21d-7a865053fccc',
  '06e3f3bc-a75b-4d12-8dd6-fadc0184b88e',
  '41f5d2b5-3bbe-42d7-bce6-6c5a4662e51f',
  '4394e0c5-8ffc-47aa-be0c-062f3213aa89',
  '4454b4bc-fc57-4421-a689-cd4ac8599649',
  '61666d7d-06ca-48d2-8dbd-9e245cc129a3',
  '62646684-53f5-4ef3-95f8-2022da314aaf',
  '98ef4a00-9d0b-4504-8246-178440327138',
  'b33bdfb5-6d25-4a7a-86f6-fdf6da4362bb',
  'b356eedd-43f0-4c0e-9797-2a864da94735',
  'd5737fc2-fd2e-42d4-8246-76bc624c390e',
  'e6234718-dfc7-45c5-968e-c8dd1b390caa',
  'f43fcac4-3bb2-4cb4-bd01-2768b585209d',
]

for (const channel of ['LIVE', 'PTU']) {
  const metadata = () => manifest.channels[channel.toLowerCase()]

  test(`normalizes the real ${channel} mission reward relations`, async () => {
    const data = JSON.parse(await read(`data/scmdb/${metadata().files.merged}`))
    const result = extractScmdbBlueprintRewards(manifest, data, channel)

    assert.equal(result.channel, channel)
    assert.equal(result.version, metadata().version)
    assert.equal(result.sourceFile, metadata().files.merged)

    assert.equal(result.counts.rewards, expected[channel].rewards)
    assert.equal(result.counts.blueprints, expected[channel].blueprints)
    assert.equal(result.counts.pools, expected[channel].pools)
    assert.equal(result.counts.contracts, expected[channel].contracts)
    assert.equal(result.counts.withSourceKnownIssue, expected[channel].knownIssue)
    assert.equal(result.counts.duplicateSourceRows, expected[channel].duplicates)
    assert.equal(result.rewards.length, result.counts.rewards)

    for (const reward of result.rewards) {
      assert.ok(reward.blueprintSourceGuid.length > 0)
      assert.ok(reward.poolGuid.length > 0)
      assert.ok(reward.poolName.length > 0)
      assert.ok(reward.poolSource.length > 0)
      assert.ok(reward.contractId.length > 0)
      assert.ok(reward.contractDebugName.length > 0)
      assert.ok(reward.contractCategory === null || reward.contractCategory.length > 0)
      assert.ok(reward.contractMissionType === null || reward.contractMissionType.length > 0)
      assert.ok(reward.trigger.length > 0)
      assert.ok(Number.isFinite(reward.chance))
      assert.ok(Number.isFinite(reward.weight))
      assert.equal(typeof reward.hasSourceKnownIssue, 'boolean')
    }

    // Deterministic order, so a re-import produces the same rows.
    const keys = result.rewards.map(
      reward => `${reward.contractId}|${reward.poolGuid}|${reward.blueprintSourceGuid}`,
    )
    const sortKeys = result.rewards.map(
      reward => `${reward.blueprintSourceGuid}|${reward.contractId}|${reward.poolGuid}`,
    )
    assert.deepEqual(sortKeys, [...sortKeys].sort((a, b) => a.localeCompare(b)))

    // The relation is not unique per combination: every repeated combination is
    // accounted for by the duplicate counter instead of being dropped.
    assert.equal(keys.length - new Set(keys).size, result.counts.duplicateSourceRows)

    // Every duplicated row is one SCMDB itself flags as a known source issue.
    const combinations = new Set()
    for (const reward of result.rewards) {
      const key = `${reward.contractId}|${reward.poolGuid}|${reward.blueprintSourceGuid}`
      if (combinations.has(key)) assert.equal(reward.hasSourceKnownIssue, true)
      combinations.add(key)
    }
  })
}

test('LIVE reward identities all resolve against the LIVE catalog', async () => {
  const live = manifest.channels.live
  const merged = JSON.parse(await read(`data/scmdb/${live.files.merged}`))
  const catalogData = JSON.parse(await read(`data/scmdb/${live.files.crafting_blueprints}`))

  const rewards = extractScmdbBlueprintRewards(manifest, merged, 'LIVE')
  const catalog = extractScmdbBlueprints(manifest, catalogData, 'LIVE')
  const guids = catalog.blueprints.map(blueprint => blueprint.sourceGuid)

  assert.deepEqual(unresolvedRewardBlueprints(rewards.rewards, guids), [])
})

test('reports the PTU reward identities the PTU catalog does not contain', async () => {
  const ptu = manifest.channels.ptu
  const merged = JSON.parse(await read(`data/scmdb/${ptu.files.merged}`))
  const ptuCatalogData = JSON.parse(await read(`data/scmdb/${ptu.files.crafting_blueprints}`))
  const liveCatalogData = JSON.parse(
    await read(`data/scmdb/${manifest.channels.live.files.crafting_blueprints}`),
  )

  const rewards = extractScmdbBlueprintRewards(manifest, merged, 'PTU')
  const ptuCatalog = extractScmdbBlueprints(manifest, ptuCatalogData, 'PTU')
  const liveCatalog = extractScmdbBlueprints(manifest, liveCatalogData, 'LIVE')

  const unresolved = unresolvedRewardBlueprints(
    rewards.rewards,
    ptuCatalog.blueprints.map(blueprint => blueprint.sourceGuid),
  )
  assert.deepEqual(unresolved, unresolvedPtuRewardBlueprints)

  // The gap stays a gap. The LIVE catalog is not consulted to close it, and
  // these identities are absent there too.
  const liveGuids = new Set(liveCatalog.blueprints.map(blueprint => blueprint.sourceGuid))
  assert.ok(unresolved.every(guid => !liveGuids.has(guid)))
})

test('reports an unresolved reward identity instead of inventing one', () => {
  const rewards = [
    { blueprintSourceGuid: 'known' },
    { blueprintSourceGuid: 'missing-b' },
    { blueprintSourceGuid: 'missing-a' },
    { blueprintSourceGuid: 'missing-a' },
  ]

  assert.deepEqual(unresolvedRewardBlueprints(rewards, ['known']), ['missing-a', 'missing-b'])
  assert.deepEqual(unresolvedRewardBlueprints([], ['known']), [])
})

test('LIVE and PTU reward relations stay separate', async () => {
  const liveData = JSON.parse(await read(`data/scmdb/${manifest.channels.live.files.merged}`))
  const ptuData = JSON.parse(await read(`data/scmdb/${manifest.channels.ptu.files.merged}`))

  assert.throws(
    () => extractScmdbBlueprintRewards(manifest, ptuData, 'LIVE'),
    /SCMDB_BLUEPRINT_REWARD_VERSION_MISMATCH/,
  )
  assert.throws(
    () => extractScmdbBlueprintRewards(manifest, liveData, 'PTU'),
    /SCMDB_BLUEPRINT_REWARD_VERSION_MISMATCH/,
  )
})

const minimalManifest = {
  channels: { live: { version: '1', files: { merged: 'merged.json' } } },
}

const minimalMerged = (overrides = {}) => ({
  version: '1',
  blueprintPools: {
    'pool-1': {
      name: 'BP_REWARDS_Example',
      source: 'example',
      blueprints: [
        { blueprintRecord: 'bp-1', weight: 1, entityClass: 'c1', name: 'One' },
        { blueprintRecord: 'bp-2', weight: 3, entityClass: 'c2', name: 'Two' },
      ],
    },
  },
  contracts: [
    {
      id: 'contract-1',
      debugName: 'Example contract',
      category: 'Delivery',
      missionType: 'Hauling',
      blueprintRewards: [
        { blueprintPool: 'pool-1', chance: 0.25, poolName: 'BP_REWARDS_Example', trigger: 'complete' },
      ],
    },
  ],
  ...overrides,
})

test('expands one reward into one row per pool blueprint', () => {
  const result = extractScmdbBlueprintRewards(minimalManifest, minimalMerged(), 'LIVE')

  assert.equal(result.rewards.length, 2)
  assert.deepEqual(
    result.rewards.map(reward => reward.blueprintSourceGuid),
    ['bp-1', 'bp-2'],
  )
  assert.deepEqual(result.rewards.map(reward => reward.weight), [1, 3])
  assert.ok(result.rewards.every(reward => reward.chance === 0.25))
  assert.ok(result.rewards.every(reward => reward.trigger === 'complete'))
  assert.ok(result.rewards.every(reward => reward.contractId === 'contract-1'))
  assert.ok(result.rewards.every(reward => reward.hasSourceKnownIssue === false))
  assert.deepEqual(result.counts, {
    rewards: 2,
    blueprints: 2,
    pools: 1,
    contracts: 1,
    withSourceKnownIssue: 0,
    duplicateSourceRows: 0,
  })
})

test('keeps and counts a repeated pool entry instead of collapsing it', () => {
  const merged = minimalMerged()
  merged.blueprintPools['pool-1'].blueprints.push({
    blueprintRecord: 'bp-1',
    weight: 1,
    entityClass: 'c1',
    name: 'One',
  })

  const result = extractScmdbBlueprintRewards(minimalManifest, merged, 'LIVE')

  assert.equal(result.rewards.length, 3)
  assert.equal(result.counts.duplicateSourceRows, 1)
  assert.equal(result.counts.blueprints, 2)
  assert.equal(
    result.rewards.filter(reward => reward.blueprintSourceGuid === 'bp-1').length,
    2,
  )
})

test('carries a source known issue without resolving it', () => {
  const poolIssue = minimalMerged()
  poolIssue.blueprintPools['pool-1'].knownIssues = { duplicateReferences: [] }
  const withPoolIssue = extractScmdbBlueprintRewards(minimalManifest, poolIssue, 'LIVE')
  assert.equal(withPoolIssue.counts.withSourceKnownIssue, 2)
  assert.ok(withPoolIssue.rewards.every(reward => reward.hasSourceKnownIssue === true))

  const rowIssue = minimalMerged()
  rowIssue.blueprintPools['pool-1'].blueprints[1].knownIssue = { expected: { name: 'Other' } }
  const withRowIssue = extractScmdbBlueprintRewards(minimalManifest, rowIssue, 'LIVE')
  assert.equal(withRowIssue.counts.withSourceKnownIssue, 1)
  assert.equal(withRowIssue.rewards[0].hasSourceKnownIssue, false)
  assert.equal(withRowIssue.rewards[1].hasSourceKnownIssue, true)
  // The flagged row keeps the name SCMDB actually ships.
  assert.equal(withRowIssue.rewards[1].blueprintSourceGuid, 'bp-2')
})

test('ignores contracts without blueprint rewards', () => {
  const merged = minimalMerged()
  merged.contracts.push({ id: 'contract-2', debugName: 'No rewards' })
  merged.contracts.push({ id: 'contract-3', debugName: 'Empty', blueprintRewards: [] })
  merged.contracts.push({ id: 'contract-4', debugName: 'Null', blueprintRewards: null })

  const result = extractScmdbBlueprintRewards(minimalManifest, merged, 'LIVE')

  assert.equal(result.counts.contracts, 1)
  assert.equal(result.rewards.length, 2)
})

test('fails closed on an unresolvable pool reference', () => {
  const merged = minimalMerged()
  merged.contracts[0].blueprintRewards[0].blueprintPool = 'pool-missing'

  assert.throws(
    () => extractScmdbBlueprintRewards(minimalManifest, merged, 'LIVE'),
    /SCMDB_BLUEPRINT_REWARD_POOL_UNRESOLVED/,
  )
})

test('rejects a structurally invalid reward dataset', () => {
  assert.throws(
    () => extractScmdbBlueprintRewards(null, {}, 'LIVE'),
    /SCMDB_BLUEPRINT_REWARD_MANIFEST_INVALID/,
  )
  assert.throws(
    () => extractScmdbBlueprintRewards(minimalManifest, { version: '1' }, 'LIVE'),
    /SCMDB_BLUEPRINT_REWARD_DATASET_INVALID/,
  )
  assert.throws(
    () =>
      extractScmdbBlueprintRewards(
        minimalManifest,
        minimalMerged({ blueprintPools: [] }),
        'LIVE',
      ),
    /SCMDB_BLUEPRINT_POOLS_INVALID/,
  )

  const badPool = minimalMerged()
  delete badPool.blueprintPools['pool-1'].source
  assert.throws(
    () => extractScmdbBlueprintRewards(minimalManifest, badPool, 'LIVE'),
    /SCMDB_BLUEPRINT_POOL_INVALID/,
  )

  const badEntry = minimalMerged()
  badEntry.blueprintPools['pool-1'].blueprints[0].blueprintRecord = '  '
  assert.throws(
    () => extractScmdbBlueprintRewards(minimalManifest, badEntry, 'LIVE'),
    /SCMDB_BLUEPRINT_POOL_INVALID/,
  )

  const badContract = minimalMerged()
  badContract.contracts[0].debugName = '  '
  assert.throws(
    () => extractScmdbBlueprintRewards(minimalManifest, badContract, 'LIVE'),
    /SCMDB_BLUEPRINT_REWARD_CONTRACT_INVALID/,
  )

  const badReward = minimalMerged()
  delete badReward.contracts[0].blueprintRewards[0].trigger
  assert.throws(
    () => extractScmdbBlueprintRewards(minimalManifest, badReward, 'LIVE'),
    /SCMDB_BLUEPRINT_REWARD_INVALID/,
  )
})

test('exposes no ownership concept at all', async () => {
  const data = JSON.parse(await read(`data/scmdb/${manifest.channels.live.files.merged}`))
  const result = extractScmdbBlueprintRewards(manifest, data, 'LIVE')

  // Reward relations describe where a blueprint can come from in the game.
  // They never describe whether a VECTOR user owns it.
  const forbidden = /^(owned|isOwned|ownership|owner|userId|user|crew|crewId|profile)$/i

  for (const reward of result.rewards.slice(0, 50)) {
    for (const key of Object.keys(reward)) {
      assert.ok(!forbidden.test(key), `unexpected ownership field ${key}`)
    }
  }
})
