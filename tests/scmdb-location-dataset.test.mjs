import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [extractor, normalizer, composer, manifestText] = await Promise.all([
  read('lib/scmdb/location-extractor.ts'),
  read('lib/scmdb/location-normalizer.ts'),
  read('lib/scmdb/location-dataset.ts'),
  read('data/scmdb/latest.json'),
])

const moduleUrl = source => {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
}

async function loadComposer(normalizerSource = normalizer) {
  const source = composer
    .replace("'./location-extractor'", JSON.stringify(moduleUrl(extractor)))
    .replace("'./location-normalizer'", JSON.stringify(moduleUrl(normalizerSource)))
  return (await import(moduleUrl(source))).prepareScmdbLocationDataset
}

const prepare = await loadComposer()
const manifest = JSON.parse(manifestText)

for (const channel of ['LIVE', 'PTU']) {
  test(`prepares the real ${channel} classified dataset`, async () => {
    const metadata = manifest.channels[channel.toLowerCase()]
    const data = JSON.parse(await read(`data/scmdb/${metadata.files.merged}`))
    const result = prepare(manifest, data, channel)

    assert.equal(result.channel, channel)
    assert.equal(result.version, metadata.version)
    assert.equal(result.sourceFile, metadata.files.merged)
    assert.equal(result.counts.total, Object.keys(data.locationPools).length)
    assert.equal(result.counts.total, result.counts.valid + result.counts.quarantined + result.counts.rejectedTechnical)
    for (const [key, status] of [
      ['valid', 'VALID'],
      ['quarantined', 'QUARANTINED'],
      ['rejectedTechnical', 'REJECTED_TECHNICAL'],
    ]) {
      assert.equal(result.counts[key], result[key].length)
      assert.deepEqual(result[key], result.locations.filter(row => row.status === status))
    }
    const keys = result.locations.map(row => row.sourceKey)
    assert.deepEqual(keys, Object.keys(data.locationPools).sort((a, b) => a.localeCompare(b)))
    assert.deepEqual(result, prepare(manifest, data, channel))
    if (channel === 'LIVE') {
      assert.deepEqual(result.counts, { total: 959, valid: 918, quarantined: 15, rejectedTechnical: 26 })
    }
  })
}

test('preserves duplicate names and technical rejection precedence and reasons', () => {
  const inputManifest = { channels: { live: { version: 'v1', files: { merged: 'v1.json' } } } }
  const base = { type: 'Destination', system: null, planet: null, moon: null }
  const data = { version: 'v1', locationPools: {
    b: { ...base, name: 'Same' },
    a: { ...base, name: 'Same' },
    c: { ...base, name: '@placeholder', system: 'Unknown' },
  } }
  const result = prepare(inputManifest, data, 'LIVE')
  assert.deepEqual(result.valid.map(row => row.sourceKey), ['a', 'b'])
  assert.equal(result.rejectedTechnical[0].sourceKey, 'c')
  assert.deepEqual(result.rejectedTechnical[0].issues, ['TECHNICAL_NAME', 'UNKNOWN_SYSTEM'])
})

test('fails closed on inconsistent normalization and extraction errors', async () => {
  const inputManifest = { channels: { live: { version: 'v1', files: { merged: 'v1.json' } } } }
  const data = { version: 'v1', locationPools: {
    a: { name: 'A', type: 'Destination', system: null, planet: null, moon: null },
  } }
  assert.throws(() => prepare(inputManifest, { ...data, version: 'wrong' }, 'LIVE'), /SCMDB_LOCATION_VERSION_MISMATCH/)

  for (const body of [
    'return []',
    "return rows.map(row => ({ ...row, sourceKey: 'other', status: 'VALID', issues: [] }))",
    "return rows.map(row => ({ ...row, status: 'UNKNOWN', issues: [] }))",
    "return rows.map(row => ({ ...row, status: 'VALID', issues: ['UNKNOWN_SYSTEM'] }))",
    "return rows.map(row => ({ ...row, status: 'QUARANTINED', issues: ['TECHNICAL_NAME'] }))",
    "return rows.map(row => ({ ...row, status: 'REJECTED_TECHNICAL', issues: [] }))",
  ]) {
    const broken = await loadComposer(`export function normalizeScmdbLocations(rows) { ${body} }`)
    assert.throws(() => broken(inputManifest, data, 'LIVE'), /SCMDB_LOCATION_CLASSIFICATION_INVALID/)
  }
})
