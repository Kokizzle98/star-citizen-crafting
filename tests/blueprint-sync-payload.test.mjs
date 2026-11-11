import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { as, createDb } from './blueprint-db-fixture.mjs'
import { loadBlueprintSyncModules, readScmdbBlueprintChannel } from '../scripts/sync-scmdb-blueprint-catalog.mjs'

// Blueprint PR 3: the payload builder lib/blueprints/blueprint-sync-payload.ts,
// the only production mapping from the PR 1 readers to the parameters of
// sync_scmdb_blueprint_catalog(). Pure tests plus one PGlite end-to-end run;
// no Production access.

const m = await loadBlueprintSyncModules()
const build = m.buildScmdbBlueprintSyncPayload
const pin = m.SCMDB_BLUEPRINT_LIVE_SYNC_PIN
const live = await readScmdbBlueprintChannel('LIVE', { modules: m })
const ptu = await readScmdbBlueprintChannel('PTU', { modules: m })
const payload = build(live.catalog, live.rewards)
const clone = value => structuredClone(value)

const PARAMS = ['p_source', 'p_channel', 'p_version', 'p_catalog_source_file', 'p_reward_source_file',
  'p_blueprint_total', 'p_blueprint_valid', 'p_blueprint_review_required', 'p_reward_total',
  'p_duplicate_source_rows', 'p_blueprints', 'p_rewards']
const BLUEPRINT_FIELDS = ['source_guid', 'source_tag', 'product_entity_class', 'product_name', 'gear', 'type',
  'subtype', 'manufacturer', 'recipe', 'scmdb_is_default', 'cig_data_error', 'scmdb_suggested_name',
  'review_state', 'issues']
const REWARD_FIELDS = ['source_contract_id', 'source_reward_index', 'source_pool_guid', 'source_pool_entry_index',
  'blueprint_source_guid', 'pool_name', 'pool_source', 'contract_debug_name', 'contract_category',
  'contract_mission_type', 'trigger', 'chance', 'weight', 'has_source_known_issue']

const rejects = (fn, code) => assert.throws(fn, new RegExp(`^Error: SCMDB_BLUEPRINT_PAYLOAD_${code}$`))

test('PR 3: the pinned LIVE dataset builds with the expected counts', () => {
  assert.deepEqual({ ...pin }, {
    channel: 'LIVE', version: '4.10.2-live.12913470', blueprintTotal: 1618, blueprintValid: 1610,
    blueprintReviewRequired: 8, rewardTotal: 7480, duplicateSourceRows: 4,
  })
  assert.equal(payload.p_source, 'SCMDB')
  assert.equal(payload.p_channel, 'LIVE')
  assert.equal(payload.p_version, '4.10.2-live.12913470')
  assert.equal(payload.p_catalog_source_file, 'crafting_blueprints-4.10.2-live.12913470.json')
  assert.equal(payload.p_reward_source_file, 'merged-4.10.2-live.12913470.json')
  assert.equal(payload.p_blueprint_total, 1618)
  assert.equal(payload.p_blueprint_valid, 1610)
  assert.equal(payload.p_blueprint_review_required, 8)
  assert.equal(payload.p_reward_total, 7480)
  assert.equal(payload.p_duplicate_source_rows, 4)
  assert.equal(payload.p_blueprints.length, 1618)
  assert.equal(payload.p_rewards.length, 7480)
})

test('PR 3: the output is deterministic and independent of the input order', () => {
  const reversed = build(
    { ...live.catalog, blueprints: [...live.catalog.blueprints].reverse() },
    { ...live.rewards, rewards: [...live.rewards.rewards].reverse() })
  assert.deepEqual(reversed, payload)
  assert.equal(JSON.stringify(build(live.catalog, live.rewards)), JSON.stringify(payload))
  const guids = payload.p_blueprints.map(b => b.source_guid)
  assert.deepEqual(guids, [...guids].sort())
})

test('PR 3: every payload field is mapped from the reader rows, nothing else', () => {
  assert.deepEqual(Object.keys(payload), PARAMS)
  const blueprints = new Map(live.catalog.blueprints.map(b => [b.sourceGuid, b]))
  for (const row of payload.p_blueprints) {
    assert.deepEqual(Object.keys(row), BLUEPRINT_FIELDS)
    const b = blueprints.get(row.source_guid)
    assert.deepEqual(row, {
      source_guid: b.sourceGuid, source_tag: b.sourceTag, product_entity_class: b.productEntityClass,
      product_name: b.productName, gear: b.gear, type: b.type, subtype: b.subtype,
      manufacturer: b.manufacturer, recipe: b.recipe, scmdb_is_default: b.scmdbIsDefault,
      cig_data_error: b.scmdbCigDataError, scmdb_suggested_name: b.scmdbSuggestedName,
      review_state: b.reviewState, issues: b.issues,
    })
    assert.notEqual(row.recipe, b.recipe, 'recipe is copied, not shared with the reader')
  }
  const rewards = new Map(live.rewards.rewards.map(r =>
    [JSON.stringify([r.contractId, r.sourceRewardIndex, r.poolGuid, r.sourcePoolEntryIndex]), r]))
  for (const row of payload.p_rewards) {
    assert.deepEqual(Object.keys(row), REWARD_FIELDS)
    const r = rewards.get(JSON.stringify([row.source_contract_id, row.source_reward_index,
      row.source_pool_guid, row.source_pool_entry_index]))
    assert.deepEqual(row, {
      source_contract_id: r.contractId, source_reward_index: r.sourceRewardIndex,
      source_pool_guid: r.poolGuid, source_pool_entry_index: r.sourcePoolEntryIndex,
      blueprint_source_guid: r.blueprintSourceGuid, pool_name: r.poolName, pool_source: r.poolSource,
      contract_debug_name: r.contractDebugName, contract_category: r.contractCategory,
      contract_mission_type: r.contractMissionType, trigger: r.trigger, chance: r.chance,
      weight: r.weight, has_source_known_issue: r.hasSourceKnownIssue,
    })
  }
})

test('PR 3: scmdb_is_default stays a raw value and the payload carries no ownership field', () => {
  assert.equal(payload.p_blueprints.filter(b => b.scmdb_is_default === true).length, 8)
  assert.ok(payload.p_blueprints.every(b => typeof b.scmdb_is_default === 'boolean'))
  const keys = new Set([...Object.keys(payload), ...payload.p_blueprints.flatMap(Object.keys),
    ...payload.p_rewards.flatMap(Object.keys)])
  assert.deepEqual([...keys].filter(k => /owner|ownership|owned|user|profile|crew|provenance/i.test(k)), [])

  // Foreign fields on a reader object are never passed through.
  const catalog = clone(live.catalog)
  Object.assign(catalog.blueprints[0], { ownership: 'MANUAL', userId: 'x', owned: true })
  const row = build(catalog, live.rewards).p_blueprints.find(b => b.source_guid === catalog.blueprints[0].sourceGuid)
  assert.deepEqual(Object.keys(row), BLUEPRINT_FIELDS)
})

test('PR 3: the four duplicate source rows stay separate rows', () => {
  const groups = new Map()
  for (const r of payload.p_rewards) {
    const key = JSON.stringify([r.source_contract_id, r.source_pool_guid, r.blueprint_source_guid])
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const repeated = [...groups.values()].filter(n => n > 1)
  assert.deepEqual(repeated, [2, 2, 2, 2])
  assert.equal(payload.p_rewards.length - groups.size, 4)
})

test('PR 3: PTU and channel conflicts are rejected', () => {
  rejects(() => build(ptu.catalog, ptu.rewards), 'CHANNEL_UNSUPPORTED')
  rejects(() => build(live.catalog, ptu.rewards), 'CHANNEL_UNSUPPORTED')
  rejects(() => build(ptu.catalog, live.rewards), 'CHANNEL_UNSUPPORTED')
  rejects(() => build({ ...live.catalog, channel: 'PTU' }, live.rewards), 'CHANNEL_UNSUPPORTED')
  rejects(() => build(live.catalog, { ...live.rewards, channel: 'PTU' }), 'CHANNEL_UNSUPPORTED')
  // PTU stays rejected even when it is labelled with the pinned LIVE version.
  rejects(() => build({ ...ptu.catalog, version: pin.version }, { ...ptu.rewards, version: pin.version }),
    'CHANNEL_UNSUPPORTED')
})

test('PR 3 fix: the dataset pin is fixed to 4.10.2-live.12913470 and cannot be replaced', () => {
  // Exactly the pinned LIVE dataset is accepted.
  assert.equal(build(live.catalog, live.rewards).p_version, '4.10.2-live.12913470')
  assert.equal(build.length, 2, 'the builder takes no pin parameter')

  // Another LIVE dataset version is rejected, also when a caller tries to
  // pass a matching pin as an extra argument.
  const other = '4.10.3-live.13100000'
  const otherCatalog = { ...live.catalog, version: other }
  const otherRewards = { ...live.rewards, version: other }
  rejects(() => build(otherCatalog, otherRewards), 'PIN_MISMATCH')
  rejects(() => build(otherCatalog, otherRewards, { ...pin, version: other }), 'PIN_MISMATCH')

  // The exported pin is frozen; it cannot be changed at runtime.
  assert.ok(Object.isFrozen(pin))
  assert.throws(() => { pin.version = other }, TypeError)
  assert.equal(pin.version, '4.10.2-live.12913470')
})

test('PR 3 fix: blueprint source GUIDs must be canonical lowercase UUIDs, uncorrected', () => {
  const variants = guid => [guid.toUpperCase(), ` ${guid}`, `${guid} `, `{${guid}}`, guid.replaceAll('-', ''),
    guid.slice(0, -1), `${guid.slice(0, -1)}g`, 'not-a-uuid', '', null, 42]

  for (const bad of variants(live.catalog.blueprints[0].sourceGuid)) {
    const catalog = clone(live.catalog)
    catalog.blueprints[0].sourceGuid = bad
    rejects(() => build(catalog, live.rewards), 'INVALID_GUID')
  }

  // A reward reference is checked before resolution, so an uppercase or padded
  // variant of a GUID that exists in the catalog is not matched to it.
  const known = live.rewards.rewards[0].blueprintSourceGuid
  assert.ok(live.catalog.blueprints.some(b => b.sourceGuid === known))
  for (const bad of variants(known)) {
    const rewards = clone(live.rewards)
    rewards.rewards[0].blueprintSourceGuid = bad
    rejects(() => build(live.catalog, rewards), 'INVALID_GUID')
  }

  // The real pinned dataset passes unchanged.
  assert.ok(build(live.catalog, live.rewards).p_blueprints.every(b =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(b.source_guid)))
})

test('PR 3: catalog and rewards must come from the same dataset version', () => {
  rejects(() => build(live.catalog, { ...live.rewards, version: '4.10.1-live.1' }), 'DATASET_MISMATCH')
  rejects(() => build({ ...live.catalog, version: '' }, { ...live.rewards, version: '' }), 'DATASET_MISMATCH')
  rejects(() => build({ ...live.catalog, sourceFile: ' ' }, live.rewards), 'DATASET_MISMATCH')
  rejects(() => build(live.catalog, { ...live.rewards, sourceFile: '' }), 'DATASET_MISMATCH')
})

test('PR 3: an unresolved reward reference is rejected, never mapped', () => {
  const rewards = clone(live.rewards)
  rewards.rewards[0].blueprintSourceGuid = '018a29dc-d128-4697-b181-a885c60ee29c' // a known PTU-only identity
  rejects(() => build(live.catalog, rewards), 'UNRESOLVED_REFERENCE')

  const catalog = clone(live.catalog)
  const referenced = new Set(live.rewards.rewards.map(r => r.blueprintSourceGuid))
  const index = catalog.blueprints.findIndex(b => referenced.has(b.sourceGuid))
  const [removed] = catalog.blueprints.splice(index, 1)
  catalog.counts.total -= 1
  catalog.counts[removed.reviewState === 'VALID' ? 'valid' : 'reviewRequired'] -= 1
  rejects(() => build(catalog, live.rewards), 'UNRESOLVED_REFERENCE')
})

test('PR 3: duplicate stable blueprint GUIDs and duplicate occurrences are rejected', () => {
  const catalog = clone(live.catalog)
  catalog.blueprints[1] = clone(catalog.blueprints[0])
  rejects(() => build(catalog, live.rewards), 'DUPLICATE_GUID')

  const rewards = clone(live.rewards)
  rewards.rewards.push(clone(rewards.rewards[0]))
  rewards.counts.rewards += 1
  rewards.counts.duplicateSourceRows += 1
  rejects(() => build(live.catalog, rewards), 'DUPLICATE_OCCURRENCE')
})

test('PR 3: wrong counts and anything but the pinned dataset are rejected', () => {
  const withCounts = (counts) => ({ ...live.catalog, counts: { ...live.catalog.counts, ...counts } })
  rejects(() => build(withCounts({ total: 1619 }), live.rewards), 'COUNT_MISMATCH')
  rejects(() => build(withCounts({ valid: 1609, reviewRequired: 9 }), live.rewards), 'COUNT_MISMATCH')
  rejects(() => build(live.catalog, { ...live.rewards, counts: { ...live.rewards.counts, rewards: 7479 } }),
    'COUNT_MISMATCH')
  for (const duplicateSourceRows of [0, 3, 5]) {
    rejects(() => build(live.catalog, { ...live.rewards, counts: { ...live.rewards.counts, duplicateSourceRows } }),
      'DUPLICATE_COUNT_MISMATCH')
  }

  // Internally consistent but not the pinned dataset.
  const fewer = clone(live.rewards)
  fewer.rewards = fewer.rewards.filter(r => r.poolName.includes('VaughnGenerator') === false || r.sourcePoolEntryIndex !== 8)
  fewer.counts.rewards = fewer.rewards.length
  fewer.counts.duplicateSourceRows = 2
  rejects(() => build(live.catalog, fewer), 'PIN_MISMATCH')
  const smaller = clone(live.catalog)
  const unreferenced = new Set(live.rewards.rewards.map(r => r.blueprintSourceGuid))
  const drop = smaller.blueprints.findIndex(b => !unreferenced.has(b.sourceGuid) && b.reviewState === 'VALID')
  smaller.blueprints.splice(drop, 1)
  smaller.counts.total -= 1
  smaller.counts.valid -= 1
  rejects(() => build(smaller, live.rewards), 'PIN_MISMATCH')

  const badIndex = clone(live.rewards)
  badIndex.rewards[0].sourcePoolEntryIndex = -1
  rejects(() => build(live.catalog, badIndex), 'INVALID')
  const badClass = clone(live.catalog)
  badClass.blueprints[0].reviewState = 'UNKNOWN'
  rejects(() => build(badClass, live.rewards), 'INVALID')
})

test('PR 3: the builder reproduces the former fixture mapping exactly', () => {
  // SHA-256 of the PR 2 fixture mapping (tests/blueprint-db-fixture.mjs at
  // develop debcd4e) for the pinned LIVE dataset, rows in the builder's order.
  // Recorded once instead of keeping a second mapping implementation.
  const meta = [payload.p_source, payload.p_channel, payload.p_version, payload.p_catalog_source_file,
    payload.p_reward_source_file, payload.p_blueprint_total, payload.p_blueprint_valid,
    payload.p_blueprint_review_required, payload.p_reward_total, payload.p_duplicate_source_rows]
  const hash = createHash('sha256')
    .update(JSON.stringify({ meta, blueprints: payload.p_blueprints, rewards: payload.p_rewards })).digest('hex')
  assert.equal(hash, '0b29a6c6bd7c6ffda79a2e671147199b546ec34c7b844f97685b71962e4d38a7')
})

test('PR 3: the builder is pure (no network, no environment, no client)', async () => {
  const source = (await readFile(new URL('../lib/blueprints/blueprint-sync-payload.ts', import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.deepEqual([...source.matchAll(/^import .* from '([^']+)'/gm)].map(i => i[1]), ['./blueprint-reward-extractor'])
  assert.doesNotMatch(source, /process\.env|fetch\(|supabase|createClient|\.rpc\(|from '@|from "node:/i)
})

test('PR 3: builder output → PGlite sync → ACTIVE, idempotent, duplicates kept', async () => {
  const db = await createDb()
  // Named notation proves the parameter names match the SQL signature, as an
  // RPC call through PostgREST passes them by name.
  const sql = `SELECT public.sync_scmdb_blueprint_catalog(${PARAMS.map((name, i) =>
    `${name} => $${i + 1}${['p_blueprints', 'p_rewards'].includes(name) ? '::jsonb' : ''}`).join(', ')}) AS id`
  const params = PARAMS.map(name => Array.isArray(payload[name]) ? JSON.stringify(payload[name]) : payload[name])
  const sync = async () => (await as(db, 'service_role', null, tx => tx.query(sql, params))).rows[0].id

  const first = await sync()
  const { rows: [dataset] } = await db.query('SELECT * FROM public.scmdb_blueprint_datasets WHERE id = $1', [first])
  assert.equal(dataset.status, 'ACTIVE')
  assert.equal(dataset.channel, 'LIVE')
  assert.equal(dataset.version, pin.version)
  assert.equal(dataset.blueprint_total, 1618)
  assert.equal(dataset.blueprint_valid, 1610)
  assert.equal(dataset.blueprint_review_required, 8)
  assert.equal(dataset.reward_total, 7480)
  assert.equal(dataset.duplicate_source_rows, 4)

  const snapshot = async () => (await db.query(`SELECT
    (SELECT count(*)::int FROM public.scmdb_blueprint_datasets) AS datasets,
    (SELECT count(*)::int FROM public.blueprints) AS blueprints,
    (SELECT count(*)::int FROM public.scmdb_blueprint_catalog) AS catalog,
    (SELECT count(*)::int FROM public.scmdb_blueprint_reward_sources) AS rewards,
    (SELECT count(*)::int FROM public.scmdb_blueprint_catalog WHERE scmdb_is_default) AS defaults,
    (SELECT count(*)::int FROM public.user_blueprint_ownership) AS ownership,
    (SELECT max(updated_at) FROM public.scmdb_blueprint_datasets) AS updated,
    (SELECT array_agg(id ORDER BY id) FROM public.scmdb_blueprint_reward_sources) AS reward_ids`)).rows[0]
  const before = await snapshot()
  assert.equal(before.datasets, 1)
  assert.equal(before.blueprints, 1618)
  assert.equal(before.catalog, 1618)
  assert.equal(before.rewards, 7480)
  assert.equal(before.defaults, 8)
  assert.equal(before.ownership, 0, 'scmdb_is_default creates no ownership')

  assert.equal(await sync(), first)
  assert.deepEqual(await snapshot(), before)

  const { rows: [{ duplicates }] } = await db.query(`SELECT count(*)::int - count(DISTINCT
    (source_contract_id, source_pool_guid, blueprint_id))::int AS duplicates
    FROM public.scmdb_blueprint_reward_sources WHERE dataset_id = $1`, [first])
  assert.equal(duplicates, 4)
})
