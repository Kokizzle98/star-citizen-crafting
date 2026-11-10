import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [extractor, normalizer, composer, builder, manifestText, sql] = await Promise.all([
  read('lib/scmdb/location-extractor.ts'),
  read('lib/scmdb/location-normalizer.ts'),
  read('lib/scmdb/location-dataset.ts'),
  read('lib/scmdb/location-sync-payload.ts'),
  read('data/scmdb/latest.json'),
  read('database/migrations/scmdb/001_location_catalog.sql'),
])
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`
const prepare = (await import(moduleUrl(composer
  .replace("'./location-extractor'", JSON.stringify(moduleUrl(extractor)))
  .replace("'./location-normalizer'", JSON.stringify(moduleUrl(normalizer)))))).prepareScmdbLocationDataset
const build = (await import(moduleUrl(builder))).buildScmdbLocationSyncPayload
const manifest = JSON.parse(manifestText)

for (const channel of ['LIVE', 'PTU']) {
  test(`builds deterministic ${channel} payload preserving classified rows`, async () => {
    const data = JSON.parse(await read(`data/scmdb/${manifest.channels[channel.toLowerCase()].files.merged}`))
    const dataset = prepare(manifest, data, channel)
    const payload = build(dataset)
    assert.deepEqual(payload, build({ ...dataset, locations: [...dataset.locations].reverse() }))
    assert.deepEqual(payload.p_rows.map(row => row.source_key),
      dataset.locations.map(row => row.sourceKey).sort())
    assert.equal(payload.p_total, dataset.counts.total)
    assert.equal(payload.p_valid, dataset.counts.valid)
    assert.equal(payload.p_quarantined, dataset.counts.quarantined)
    assert.equal(payload.p_rejected_technical, dataset.counts.rejectedTechnical)
    for (const row of payload.p_rows) {
      const original = dataset.locations.find(item => item.sourceKey === row.source_key)
      assert.equal(row.classification, original.status)
      assert.deepEqual(row.issues, original.issues)
    }
    if (channel === 'LIVE') assert.deepEqual(dataset.counts, { total: 959, valid: 918, quarantined: 15, rejectedTechnical: 26 })
  })
}

test('allows duplicate names but rejects duplicate keys, invalid classifications and counts', () => {
  const input = { channels: { live: { version: 'v1', files: { merged: 'v1.json' } } } }
  const row = { name: 'Same', type: 'Destination', system: null, planet: null, moon: null }
  const dataset = prepare(input, { version: 'v1', locationPools: { a: row, b: row } }, 'LIVE')
  assert.equal(build(dataset).p_rows.length, 2)
  for (const broken of [
    { ...dataset, version: '' },
    { ...dataset, sourceFile: '' },
    { ...dataset, channel: 'OTHER' },
    { ...dataset, locations: [dataset.locations[0], dataset.locations[0]] },
    { ...dataset, locations: [{ ...dataset.locations[0], status: 'UNKNOWN' }, dataset.locations[1]] },
    { ...dataset, counts: { ...dataset.counts, valid: 1 } },
    { ...dataset, locations: [{ ...dataset.locations[0], issues: ['bad'] }, dataset.locations[1]] },
  ]) assert.throws(() => build(broken), /SCMDB_LOCATION_PAYLOAD_INVALID/)
})

test('migration contract isolates privileges and activates only after validated inserts', () => {
  assert.match(sql, /PRIMARY KEY \(dataset_id, source_key\)/)
  assert.match(sql, /UNIQUE \(source, channel, version\)/)
  assert.match(sql, /CREATE UNIQUE INDEX[\s\S]*WHERE status = 'ACTIVE'/)
  assert.match(sql, /total::bigint = valid::bigint \+ quarantined::bigint \+ rejected_technical::bigint/)
  assert.match(sql, /ALTER TABLE public\.scmdb_location_datasets ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /ALTER TABLE public\.scmdb_location_catalog ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /SCMDB_LOCATION_SYNC_DUPLICATE_SOURCE_KEY/)
  assert.match(sql, /SCMDB_LOCATION_SYNC_COUNT_MISMATCH/)
  assert.match(sql, /INSERT INTO public\.scmdb_location_catalog[\s\S]*status = 'SUPERSEDED'[\s\S]*status = 'ACTIVE'/)
  assert.match(sql, /v_rows = \(SELECT coalesce\(jsonb_agg/)
  assert.doesNotMatch(sql, /inventory_locations|LOT_IDENTITY_V1/i)
})
