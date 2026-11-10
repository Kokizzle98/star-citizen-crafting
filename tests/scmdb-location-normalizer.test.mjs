import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const source = await read('lib/scmdb/location-normalizer.ts')

const transpile = input => ts.transpileModule(
  input.replace(/^import .*$/gm, ''),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText

const module = await import(
  `data:text/javascript;base64,${Buffer.from(transpile(source)).toString('base64')}`,
)

const { normalizeScmdbLocations } = module

const base = {
  system: null,
  planet: null,
  moon: null,
}

test('rejects technical SCMDB names', () => {
  const rows = [
    { sourceKey: 'star', name: 'Pyro', type: 'Star', ...base },
    { sourceKey: 'a', name: '@mission_location_pyro_0001', type: 'Destination', system: 'Pyro', planet: null, moon: null },
    { sourceKey: 'b', name: '<= UNINITIALIZED =>', type: 'Outpost', system: 'Pyro', planet: null, moon: null },
    { sourceKey: 'c', name: '@generic_locations_blank', type: 'Default', ...base },
  ]

  const result = normalizeScmdbLocations(rows)

  for (const row of result.slice(1)) {
    assert.equal(row.status, 'REJECTED_TECHNICAL')
    assert.ok(row.issues.includes('TECHNICAL_NAME'))
  }
})

test('quarantines missing hierarchy references discovered in SCMDB data', () => {
  const rows = [
    { sourceKey: 'star', name: 'Pyro', type: 'Star', ...base },
    { sourceKey: 'planet', name: 'Pyro V', type: 'Planet', system: 'Pyro', planet: null, moon: null },
    { sourceKey: 'destination', name: 'Sunset Mesa', type: 'Destination', system: 'Pyro', planet: 'Pyro II', moon: null },
  ]

  const result = normalizeScmdbLocations(rows)
  const location = result.find(row => row.sourceKey === 'destination')

  assert.equal(location.status, 'QUARANTINED')
  assert.deepEqual(location.issues, ['UNKNOWN_PLANET'])
})

test('quarantines a planet that incorrectly has a planet parent', () => {
  const rows = [
    { sourceKey: 'star', name: 'Pyro', type: 'Star', ...base },
    { sourceKey: 'v', name: 'Pyro V', type: 'Planet', system: 'Pyro', planet: null, moon: null },
    { sourceKey: 'iv', name: 'Pyro IV', type: 'Planet', system: 'Pyro', planet: 'Pyro V', moon: null },
  ]

  const result = normalizeScmdbLocations(rows)
  const location = result.find(row => row.sourceKey === 'iv')

  assert.equal(location.status, 'QUARANTINED')
  assert.deepEqual(location.issues, ['PLANET_HAS_PLANET_PARENT'])
})

test('normalizes canonical and comparison names without merging identities', () => {
  const rows = [
    { sourceKey: 'star', name: 'Stanton', type: 'Star', ...base },
    { sourceKey: 'a', name: ' New Babbage ', type: 'Destination', system: 'Stanton', planet: null, moon: null },
    { sourceKey: 'b', name: 'New Babbage', type: 'Outpost', system: 'Stanton', planet: null, moon: null },
  ]

  const result = normalizeScmdbLocations(rows)
  const matches = result.filter(row => row.normalizedName === 'new babbage')

  assert.equal(matches.length, 2)
  assert.equal(matches[0].canonicalName, 'New Babbage')
  assert.equal(matches[1].canonicalName, 'New Babbage')
  assert.notEqual(matches[0].sourceKey, matches[1].sourceKey)
})
