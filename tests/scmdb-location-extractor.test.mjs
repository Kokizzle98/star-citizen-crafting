import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [extractorSource, manifestText] = await Promise.all([
  read('lib/scmdb/location-extractor.ts'),
  read('data/scmdb/latest.json'),
])

const transpile = source => ts.transpileModule(
  source.replace(/^import .*$/gm, ''),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText

const extractorModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpile(extractorSource)).toString('base64')}`,
)

const { extractScmdbLocations } = extractorModule
const manifest = JSON.parse(manifestText)

async function realDataset(channel) {
  const key = channel.toLowerCase()
  const filename = manifest.channels[key].files.merged
  return {
    filename,
    data: JSON.parse(await read(`data/scmdb/${filename}`)),
  }
}

test('extracts the real LIVE locationPools contract deterministically', async () => {
  const { filename, data } = await realDataset('LIVE')
  const result = extractScmdbLocations(manifest, data, 'LIVE')

  assert.equal(result.channel, 'LIVE')
  assert.equal(result.version, manifest.channels.live.version)
  assert.equal(result.sourceFile, filename)
  assert.equal(result.locations.length, 959)

  assert.ok(result.locations.every((row) =>
    typeof row.sourceKey === 'string' &&
    row.sourceKey.length > 0 &&
    typeof row.name === 'string' &&
    row.name.length > 0 &&
    typeof row.type === 'string' &&
    row.type.length > 0 &&
    (row.system === null || typeof row.system === 'string') &&
    (row.planet === null || typeof row.planet === 'string') &&
    (row.moon === null || typeof row.moon === 'string')
  ))

  assert.deepEqual(
    result.locations.map(row => row.sourceKey),
    [...result.locations.map(row => row.sourceKey)].sort((a, b) => a.localeCompare(b)),
  )
})

test('extracts the real PTU locationPools contract', async () => {
  const { filename, data } = await realDataset('PTU')
  const result = extractScmdbLocations(manifest, data, 'PTU')

  assert.equal(result.channel, 'PTU')
  assert.equal(result.version, manifest.channels.ptu.version)
  assert.equal(result.sourceFile, filename)
  assert.equal(result.locations.length, 958)
})

test('fails closed on version mismatch and malformed rows', () => {
  const validManifest = {
    channels: {
      live: {
        version: '1-live',
        files: { merged: 'merged-1-live.json' },
      },
    },
  }

  assert.throws(
    () => extractScmdbLocations(
      validManifest,
      { version: 'wrong', locationPools: {} },
      'LIVE',
    ),
    /SCMDB_LOCATION_VERSION_MISMATCH/,
  )

  assert.throws(
    () => extractScmdbLocations(
      validManifest,
      {
        version: '1-live',
        locationPools: {
          abc: {
            name: '',
            type: 'Station',
            system: null,
            planet: null,
            moon: null,
          },
        },
      },
      'LIVE',
    ),
    /SCMDB_LOCATION_ROW_INVALID/,
  )
})
