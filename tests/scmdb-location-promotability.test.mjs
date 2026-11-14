import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [extractor, normalizer, composer, promotability, manifestText] = await Promise.all([
  read('lib/scmdb/location-extractor.ts'),
  read('lib/scmdb/location-normalizer.ts'),
  read('lib/scmdb/location-dataset.ts'),
  read('lib/scmdb/location-promotability.ts'),
  read('data/scmdb/latest.json'),
])
const moduleUrl = source => {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
}
const prepare = (await import(moduleUrl(composer
  .replace("'./location-extractor'", JSON.stringify(moduleUrl(extractor)))
  .replace("'./location-normalizer'", JSON.stringify(moduleUrl(normalizer)))))).prepareScmdbLocationDataset
const { decideScmdbLocationPromotability: decide, evaluateScmdbLocationDataset: evaluate } = await import(moduleUrl(promotability))
const row = (sourceKey, type, status = 'VALID', name = 'Same') => ({
  sourceKey, type, status, name, canonicalName: name, normalizedName: name.toLowerCase(),
  system: null, planet: null, moon: null, issues: [],
})
const dataset = locations => ({ locations })

test('only valid allowlisted types are promotable, independently of names', () => {
  for (const type of ['LandingZone', 'Station', 'Outpost']) {
    assert.deepEqual(decide(row('a', type)), { decision: 'PROMOTABLE', reason: 'PROMOTABLE_LOCATION_TYPE' })
    for (const status of ['QUARANTINED', 'REJECTED_TECHNICAL']) {
      assert.deepEqual(decide(row('a', type, status)), { decision: 'CATALOG_ONLY', reason: 'NON_VALID_CLASSIFICATION' })
    }
  }
  for (const type of ['Default', 'Star', 'Planet', 'Moon', 'Unrecognized']) {
    assert.deepEqual(decide(row('a', type)), { decision: 'CATALOG_ONLY', reason: 'CATALOG_ONLY_LOCATION_TYPE' })
  }
  assert.deepEqual(decide(row('a', 'Destination')), { decision: 'CATALOG_ONLY', reason: 'DESTINATION_POLICY_DEFERRED' })
  for (const type of ['Default', 'Star', 'Planet', 'Moon', 'Destination', 'Unrecognized']) {
    for (const status of ['QUARANTINED', 'REJECTED_TECHNICAL']) {
      assert.equal(decide(row('a', type, status)).reason, 'NON_VALID_CLASSIFICATION')
    }
  }
  assert.deepEqual(decide(row('a', 'Station', 'VALID', 'One')), decide(row('b', 'Station', 'VALID', 'Other')))
})

test('partitions every source key once without mutating inputs', () => {
  const locations = [row('z', 'Station'), row('b', 'Destination'), row('a', 'Outpost'), row('c', 'Station', 'QUARANTINED')]
  const before = structuredClone(locations)
  const result = evaluate(dataset(locations))
  assert.deepEqual(locations, before)
  assert.deepEqual(result.promotable.map(item => item.sourceKey), ['a', 'z'])
  assert.deepEqual(result.catalogOnly.map(item => item.sourceKey), ['b', 'c'])
  assert.deepEqual(result.counts, { total: 4, promotable: 2, catalogOnly: 2 })
  const all = [...result.promotable, ...result.catalogOnly]
  assert.deepEqual(all.map(item => item.sourceKey).sort(), locations.map(item => item.sourceKey).sort())
  for (const item of all) {
    assert.equal(item.sourceKey, item.location.sourceKey)
    assert.ok(item.reason)
  }
  assert.deepEqual(evaluate(dataset(locations)), result)
  assert.throws(() => evaluate(dataset([row('a', 'Station'), row('a', 'Outpost')])), /SCMDB_PROMOTABILITY_INVALID_SOURCE_KEY/)
  for (const status of ['INVALID', '', undefined, null]) {
    const invalid = { ...row('a', 'Station'), status }
    assert.throws(() => decide(invalid), /SCMDB_PROMOTABILITY_INVALID_CLASSIFICATION/)
    assert.throws(() => evaluate(dataset([invalid])), /SCMDB_PROMOTABILITY_INVALID_CLASSIFICATION/)
  }
})

const manifest = JSON.parse(manifestText)
for (const channel of ['LIVE', 'PTU']) {
  test(`evaluates real ${channel} dataset`, async t => {
    const metadata = manifest.channels[channel.toLowerCase()]
    const input = JSON.parse(await read(`data/scmdb/${metadata.files.merged}`))
    const source = prepare(manifest, input, channel)
    const before = structuredClone(source)
    const result = evaluate(source)
    assert.deepEqual(source, before)
    assert.equal(result.counts.total, source.locations.length)
    assert.equal(result.counts.total, result.counts.promotable + result.counts.catalogOnly)
    const all = [...result.promotable, ...result.catalogOnly]
    assert.deepEqual(all.map(item => item.sourceKey).sort(), source.locations.map(item => item.sourceKey).sort())
    assert.equal(new Set(all.map(item => item.sourceKey)).size, source.locations.length)
    for (const part of [result.promotable, result.catalogOnly]) {
      assert.deepEqual(part.map(item => item.sourceKey), part.map(item => item.sourceKey).sort())
      for (const item of part) assert.equal(item.sourceKey, item.location.sourceKey)
    }
    assert.deepEqual(evaluate(source), result)
    t.diagnostic(`${channel}: promotable=${result.counts.promotable}, catalogOnly=${result.counts.catalogOnly}`)
  })
}
