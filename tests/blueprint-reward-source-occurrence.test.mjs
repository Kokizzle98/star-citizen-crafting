import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

// Blueprint PR 2: the reward extractor emits the owner-approved source-occurrence
// indices. A reward row is one concrete occurrence inside one dataset, identified
// by contract + source_reward_index + pool + source_pool_entry_index; the
// blueprint is deliberately not part of that identity.

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [rewardSource, manifestText] = await Promise.all([
  read('lib/blueprints/blueprint-reward-extractor.ts'),
  read('data/scmdb/latest.json'),
])
const moduleUrl = source => {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
}
const { extractScmdbBlueprintRewards } = await import(moduleUrl(rewardSource))
const manifest = JSON.parse(manifestText)

const occurrence = reward =>
  `${reward.contractId}|${reward.sourceRewardIndex}|${reward.poolGuid}|${reward.sourcePoolEntryIndex}`
const business = reward => `${reward.contractId}|${reward.poolGuid}|${reward.blueprintSourceGuid}`

// The two SCMDB pools that reference one blueprint twice, and the 0-based pool
// positions of the repeated entry (verified for LIVE and PTU).
const duplicatePools = {
  BP_MISSIONREWARD_VaughnGenerator_EliminateBoss: [7, 8],
  BP_MISSIONREWARD_NorthRockFPSKill_EliminateBoss: [10, 11],
}

for (const channel of ['LIVE', 'PTU']) {
  test(`${channel}: every reward row has a unique, positional source occurrence`, async () => {
    const metadata = manifest.channels[channel.toLowerCase()]
    const data = JSON.parse(await read(`data/scmdb/${metadata.files.merged}`))
    const result = extractScmdbBlueprintRewards(manifest, data, channel)

    const keys = result.rewards.map(occurrence)
    assert.equal(new Set(keys).size, result.rewards.length)

    // Indices are the real array positions in the SCMDB source.
    const contracts = new Map(data.contracts.map(contract => [contract.id, contract]))
    for (const reward of result.rewards) {
      assert.ok(Number.isInteger(reward.sourceRewardIndex) && reward.sourceRewardIndex >= 0)
      assert.ok(Number.isInteger(reward.sourcePoolEntryIndex) && reward.sourcePoolEntryIndex >= 0)
      const sourceReward = contracts.get(reward.contractId).blueprintRewards[reward.sourceRewardIndex]
      assert.equal(sourceReward.blueprintPool, reward.poolGuid)
      const entry = data.blueprintPools[reward.poolGuid].blueprints[reward.sourcePoolEntryIndex]
      assert.equal(entry.blueprintRecord, reward.blueprintSourceGuid)
    }

    // The business duplicates stay separate source rows and are exactly the
    // repeated entries of the two documented pools.
    const seen = new Map()
    const duplicates = []
    for (const reward of result.rewards) {
      const key = business(reward)
      if (seen.has(key)) duplicates.push([seen.get(key), reward])
      else seen.set(key, reward)
    }
    assert.equal(duplicates.length, result.counts.duplicateSourceRows)
    assert.equal(duplicates.length, 4)
    for (const [first, second] of duplicates) {
      assert.deepEqual(
        [first.sourcePoolEntryIndex, second.sourcePoolEntryIndex].sort((a, b) => a - b),
        duplicatePools[first.poolName],
      )
      assert.equal(first.sourceRewardIndex, second.sourceRewardIndex)
      assert.notEqual(occurrence(first), occurrence(second))
    }
  })
}

const minimalManifest = {
  channels: { live: { version: '1', files: { merged: 'merged-1.json' } } },
}
const minimalMerged = () => ({
  version: '1',
  blueprintPools: {
    'pool-1': {
      name: 'BP_POOL_ONE',
      source: 'example',
      blueprints: [
        { blueprintRecord: 'bp-1', weight: 1 },
        { blueprintRecord: 'bp-2', weight: 1 },
        { blueprintRecord: 'bp-1', weight: 1 },
      ],
    },
  },
  contracts: [
    {
      id: 'contract-1',
      debugName: 'Example',
      blueprintRewards: [
        { blueprintPool: 'pool-1', chance: 1, trigger: 'complete' },
        { blueprintPool: 'pool-1', chance: 0.5, trigger: 'fail' },
      ],
    },
  ],
})

test('derives both indices from 0-based array positions', () => {
  const result = extractScmdbBlueprintRewards(minimalManifest, minimalMerged(), 'LIVE')

  assert.equal(result.rewards.length, 6)
  assert.deepEqual(
    result.rewards.map(occurrence),
    [
      'contract-1|0|pool-1|0',
      'contract-1|0|pool-1|2',
      'contract-1|1|pool-1|0',
      'contract-1|1|pool-1|2',
      'contract-1|0|pool-1|1',
      'contract-1|1|pool-1|1',
    ],
  )
  // Same pool used twice by one contract and a repeated pool entry: all rows
  // stay distinct occurrences, while the business duplicates are counted.
  assert.equal(new Set(result.rewards.map(occurrence)).size, 6)
  assert.equal(result.counts.duplicateSourceRows, 4)
})

test('occurrence order is deterministic across repeated extraction', () => {
  const first = extractScmdbBlueprintRewards(minimalManifest, minimalMerged(), 'LIVE')
  const second = extractScmdbBlueprintRewards(minimalManifest, minimalMerged(), 'LIVE')
  assert.deepEqual(first.rewards, second.rewards)
})
