import assert from 'node:assert/strict'
import test from 'node:test'
import { addUser, as, createDb, realPayload, sync, syncParams, syncSql, uuid } from './blueprint-db-fixture.mjs'

// Blueprint PR 2, contract group F: sync_scmdb_blueprint_catalog and the
// owner-approved reward source-occurrence identity, exercised with the real
// mirrored LIVE dataset through the PR 1 readers. No Production access; the
// function is created and executed in PGlite only.

const live = await realPayload('LIVE')
const clone = payload => structuredClone(payload)

const counts = async db => {
  const { rows } = await db.query(`SELECT
    (SELECT count(*)::int FROM public.scmdb_blueprint_datasets) AS datasets,
    (SELECT count(*)::int FROM public.blueprints) AS blueprints,
    (SELECT count(*)::int FROM public.scmdb_blueprint_catalog) AS catalog,
    (SELECT count(*)::int FROM public.scmdb_blueprint_reward_sources) AS rewards`)
  return rows[0]
}

const empty = { datasets: 0, blueprints: 0, catalog: 0, rewards: 0 }

async function rejectsWithoutWrite(db, payload, code) {
  await assert.rejects(sync(db, payload), new RegExp(code))
  assert.deepEqual(await counts(db), empty)
}

test('F: the real LIVE dataset syncs completely and becomes the active dataset', async () => {
  const db = await createDb()
  const id = await sync(db, live)

  const { rows: [dataset] } = await db.query('SELECT * FROM public.scmdb_blueprint_datasets WHERE id = $1', [id])
  assert.equal(dataset.channel, 'LIVE')
  assert.equal(dataset.version, live.version)
  assert.equal(dataset.status, 'ACTIVE')
  assert.equal(dataset.blueprint_total, live.blueprintTotal)
  assert.equal(dataset.reward_total, live.rewardTotal)
  assert.equal(dataset.duplicate_source_rows, 4)
  assert.deepEqual(await counts(db), {
    datasets: 1, blueprints: live.blueprintTotal, catalog: live.blueprintTotal, rewards: live.rewardTotal,
  })
})

test('F: duplicate source rows are kept as separate rows and recomputed in SQL', async () => {
  const db = await createDb()
  const id = await sync(db, live)

  const { rows } = await db.query(`
    SELECT pool_name, source_pool_entry_index
    FROM public.scmdb_blueprint_reward_sources r
    WHERE dataset_id = $1 AND (source_contract_id, source_pool_guid, blueprint_id) IN (
      SELECT source_contract_id, source_pool_guid, blueprint_id
      FROM public.scmdb_blueprint_reward_sources WHERE dataset_id = $1
      GROUP BY 1, 2, 3 HAVING count(*) > 1)
    ORDER BY pool_name, source_contract_id, source_pool_entry_index`, [id])
  // Two contracts per pool, two positions per contract: 8 rows, 4 of them repeats.
  assert.equal(rows.length, 8)
  assert.deepEqual([...new Set(rows.map(r => r.pool_name))], [
    'BP_MISSIONREWARD_NorthRockFPSKill_EliminateBoss',
    'BP_MISSIONREWARD_VaughnGenerator_EliminateBoss',
  ])
  assert.deepEqual(rows.filter(r => r.pool_name.includes('Vaughn')).map(r => r.source_pool_entry_index).sort(),
    [7, 7, 8, 8])
  assert.deepEqual(rows.filter(r => r.pool_name.includes('NorthRock')).map(r => r.source_pool_entry_index).sort(),
    [10, 10, 11, 11])

  for (const declared of [3, 5, 0]) {
    const fresh = await createDb()
    await rejectsWithoutWrite(fresh, { ...clone(live), duplicateSourceRows: declared },
      'SCMDB_BLUEPRINT_SYNC_DUPLICATE_COUNT_MISMATCH')
  }
})

test('F: a repeated sync of the same dataset is idempotent', async () => {
  const db = await createDb()
  const snapshot = async () => (await db.query(`
    SELECT d.id AS dataset_id, d.status, d.updated_at,
      (SELECT array_agg(b.id || ':' || b.source_guid ORDER BY b.source_guid) FROM public.blueprints b) AS blueprints,
      (SELECT array_agg(r.id ORDER BY r.id) FROM public.scmdb_blueprint_reward_sources r) AS rewards
    FROM public.scmdb_blueprint_datasets d`)).rows

  const first = await sync(db, live)
  const before = await snapshot()
  const second = await sync(db, clone(live))
  assert.equal(second, first)
  // Identical input is detected and nothing is rewritten, not even row ids.
  assert.deepEqual(await snapshot(), before)

  // Input order is not part of the identity.
  const reordered = clone(live)
  reordered.blueprints.reverse()
  reordered.rewards.reverse()
  assert.equal(await sync(db, reordered), first)
  assert.deepEqual(await snapshot(), before)
})

test('F: the source-occurrence key excludes blueprint_id, so a remapping conflicts', async () => {
  const db = await createDb()
  const id = await sync(db, live)
  const { rows: [row] } = await db.query(
    `SELECT * FROM public.scmdb_blueprint_reward_sources WHERE dataset_id = $1 LIMIT 1`, [id])
  const { rows: [other] } = await db.query(
    `SELECT blueprint_id FROM public.scmdb_blueprint_catalog WHERE dataset_id = $1 AND blueprint_id <> $2 LIMIT 1`,
    [id, row.blueprint_id])

  await assert.rejects(db.query(`
    INSERT INTO public.scmdb_blueprint_reward_sources (dataset_id, source_contract_id, source_reward_index,
      source_pool_guid, source_pool_entry_index, blueprint_id, pool_name, pool_source, contract_debug_name,
      trigger, chance, weight, has_source_known_issue)
    VALUES ($1, $2, $3, $4, $5, $6, 'x', 'x', 'x', 'x', 1, 1, false)`,
  [id, row.source_contract_id, row.source_reward_index, row.source_pool_guid, row.source_pool_entry_index,
    other.blueprint_id]), /scmdb_blueprint_reward_sources_occurrence_key/)
})

test('F: wrong or unstable reward assignments fail closed without writing', async () => {
  const db = await createDb()

  const repeated = clone(live)
  repeated.rewards[1] = { ...repeated.rewards[1],
    source_contract_id: repeated.rewards[0].source_contract_id,
    source_reward_index: repeated.rewards[0].source_reward_index,
    source_pool_guid: repeated.rewards[0].source_pool_guid,
    source_pool_entry_index: repeated.rewards[0].source_pool_entry_index }
  await rejectsWithoutWrite(db, repeated, 'SCMDB_BLUEPRINT_SYNC_DUPLICATE_REWARD_OCCURRENCE')

  // One pool entry must be one blueprint in every contract that uses the pool.
  const remapped = clone(live)
  const target = remapped.rewards.find(r => remapped.rewards.some(o =>
    o.source_pool_guid === r.source_pool_guid && o.source_contract_id !== r.source_contract_id))
  target.blueprint_source_guid = remapped.blueprints.find(b => b.source_guid !== target.blueprint_source_guid).source_guid
  await rejectsWithoutWrite(db, remapped, 'SCMDB_BLUEPRINT_SYNC_UNSTABLE_REWARD_ASSIGNMENT')

  // A pool used by several rewards must be expanded to the same length by
  // every use: a truncated expansion fails even with adjusted counts.
  const truncated = clone(live)
  const uses = new Map()
  for (const r of truncated.rewards) {
    const key = `${r.source_contract_id}|${r.source_reward_index}`
    uses.set(r.source_pool_guid, (uses.get(r.source_pool_guid) ?? new Set()).add(key))
  }
  const duplicatePoolNames = ['BP_MISSIONREWARD_VaughnGenerator_EliminateBoss',
    'BP_MISSIONREWARD_NorthRockFPSKill_EliminateBoss']
  const shared = truncated.rewards.find(r =>
    uses.get(r.source_pool_guid).size > 1 && !duplicatePoolNames.includes(r.pool_name))
  const last = Math.max(...truncated.rewards
    .filter(r => r.source_contract_id === shared.source_contract_id &&
      r.source_reward_index === shared.source_reward_index)
    .map(r => r.source_pool_entry_index))
  assert.ok(last > 0)
  truncated.rewards = truncated.rewards.filter(r => !(r.source_contract_id === shared.source_contract_id &&
    r.source_reward_index === shared.source_reward_index && r.source_pool_entry_index === last))
  truncated.rewardTotal -= 1
  await rejectsWithoutWrite(db, truncated, 'SCMDB_BLUEPRINT_SYNC_UNSTABLE_REWARD_ASSIGNMENT')

  const shifted = clone(live)
  shifted.rewards[0].source_pool_entry_index += 1000
  await rejectsWithoutWrite(db, shifted, 'SCMDB_BLUEPRINT_SYNC_UNSTABLE_REWARD_ASSIGNMENT')

  for (const index of [-1, 1.5, '0', null]) {
    const invalid = clone(live)
    invalid.rewards[0].source_reward_index = index
    await rejectsWithoutWrite(db, invalid, 'SCMDB_BLUEPRINT_SYNC_INVALID_REWARD')
  }
})

test('F: unresolved LIVE references fail closed: no fallback and no synthetic blueprint', async () => {
  const db = await createDb()
  const unresolved = clone(live)
  unresolved.rewards[0].blueprint_source_guid = uuid(999999)
  await rejectsWithoutWrite(db, unresolved, 'SCMDB_BLUEPRINT_SYNC_REWARD_BLUEPRINT_UNRESOLVED')

  // A blueprint removed from the catalog must not be recreated from rewards.
  const missing = clone(live)
  const referenced = new Set(missing.rewards.map(r => r.blueprint_source_guid))
  const index = missing.blueprints.findIndex(b => referenced.has(b.source_guid))
  const [removed] = missing.blueprints.splice(index, 1)
  missing.blueprintTotal -= 1
  if (removed.review_state === 'VALID') missing.blueprintValid -= 1
  else missing.blueprintReviewRequired -= 1
  await rejectsWithoutWrite(db, missing, 'SCMDB_BLUEPRINT_SYNC_REWARD_BLUEPRINT_UNRESOLVED')
})

test('F: PTU is not imported in this package', async () => {
  const db = await createDb()
  await rejectsWithoutWrite(db, await realPayload('PTU'), 'SCMDB_BLUEPRINT_SYNC_CHANNEL_UNSUPPORTED')
  await rejectsWithoutWrite(db, { ...clone(live), channel: 'PTU' }, 'SCMDB_BLUEPRINT_SYNC_CHANNEL_UNSUPPORTED')
})

test('F: catalog rows, counts and classification are validated before any write', async () => {
  const db = await createDb()
  await rejectsWithoutWrite(db, { ...clone(live), blueprintTotal: live.blueprintTotal + 1,
    blueprintValid: live.blueprintValid + 1 }, 'SCMDB_BLUEPRINT_SYNC_COUNT_MISMATCH')
  await rejectsWithoutWrite(db, { ...clone(live), rewardTotal: live.rewardTotal - 1 },
    'SCMDB_BLUEPRINT_SYNC_COUNT_MISMATCH')

  const reclassified = clone(live)
  const valid = reclassified.blueprints.find(b => b.review_state === 'VALID')
  valid.review_state = 'REVIEW_REQUIRED'
  valid.issues = ['CIG_DATA_ERROR']
  await rejectsWithoutWrite(db, reclassified, 'SCMDB_BLUEPRINT_SYNC_CLASSIFICATION_MISMATCH')

  const duplicated = clone(live)
  duplicated.blueprints[1].source_guid = duplicated.blueprints[0].source_guid
  await assert.rejects(sync(db, duplicated), /SCMDB_BLUEPRINT_SYNC_/)
  assert.deepEqual(await counts(db), empty)

  const extraKey = clone(live)
  extraKey.blueprints[0].owned = true
  await rejectsWithoutWrite(db, extraKey, 'SCMDB_BLUEPRINT_SYNC_INVALID_BLUEPRINT')

  const upper = clone(live)
  upper.blueprints[0].source_guid = upper.blueprints[0].source_guid.toUpperCase()
  await rejectsWithoutWrite(db, upper, 'SCMDB_BLUEPRINT_SYNC_INVALID_BLUEPRINT')
})

test('F: a new version supersedes the old one and keeps stable blueprint identities and ownership', async () => {
  const db = await createDb()
  const firstId = await sync(db, live)
  const user = uuid(1)
  await addUser(db, user, 'Pilot_One')
  const { rows: [{ id: blueprintId }] } = await db.query(
    'SELECT id FROM public.blueprints WHERE source_guid = $1', [live.blueprints[0].source_guid])
  await as(db, 'authenticated', user, tx => tx.query('SELECT public.mark_blueprint_owned($1)', [blueprintId]))

  const next = { ...clone(live), version: `${live.version}-next` }
  const secondId = await sync(db, next)
  assert.notEqual(secondId, firstId)

  const { rows } = await db.query('SELECT id, status FROM public.scmdb_blueprint_datasets ORDER BY created_at, id')
  assert.deepEqual(Object.fromEntries(rows.map(r => [r.id, r.status])),
    { [firstId]: 'SUPERSEDED', [secondId]: 'ACTIVE' })
  assert.equal((await counts(db)).blueprints, live.blueprintTotal)
  const { rows: [{ id: sameId }] } = await db.query(
    'SELECT id FROM public.blueprints WHERE source_guid = $1', [live.blueprints[0].source_guid])
  assert.equal(sameId, blueprintId)
  const { rows: owned } = await db.query('SELECT blueprint_id FROM public.user_blueprint_ownership')
  assert.deepEqual(owned.map(r => r.blueprint_id), [blueprintId])

  // Reward rows are never claimed to be the same row across revisions.
  const { rows: [{ shared }] } = await db.query(`SELECT count(*)::int AS shared
    FROM public.scmdb_blueprint_reward_sources a JOIN public.scmdb_blueprint_reward_sources b ON a.id = b.id
    WHERE a.dataset_id = $1 AND b.dataset_id = $2`, [firstId, secondId])
  assert.equal(shared, 0)
})

test('F: scmdb_is_default is stored as a raw value and creates no ownership', async () => {
  const db = await createDb()
  const id = await sync(db, live)
  const { rows: [{ defaults }] } = await db.query(
    'SELECT count(*)::int AS defaults FROM public.scmdb_blueprint_catalog WHERE dataset_id = $1 AND scmdb_is_default',
    [id])
  assert.equal(defaults, live.blueprints.filter(b => b.scmdb_is_default).length)
  assert.ok(defaults > 0)
  const { rows: [{ owned }] } = await db.query('SELECT count(*)::int AS owned FROM public.user_blueprint_ownership')
  assert.equal(owned, 0)
})

test('F: only the privileged server path may sync', async () => {
  const db = await createDb()
  await addUser(db, uuid(1), 'Pilot_One')
  for (const [role, uid] of [['authenticated', uuid(1)], ['anon', null]]) {
    await assert.rejects(as(db, role, uid, tx => tx.query(syncSql, syncParams(live))), /permission denied/)
  }
  assert.deepEqual(await counts(db), empty)
})
