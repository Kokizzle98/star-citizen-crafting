import assert from 'node:assert/strict'
import test from 'node:test'
import { loadFabricatorModule, loadLive, readText } from './fabricator-fixture.mjs'

// Fabricator F1: LIVE-only mirror preparation, the mirror <-> ACTIVE database
// dataset version guard, the module-level cache and the server read boundary.

const live = await loadLive()
const sourceModule = await loadFabricatorModule('fabricator-live-source')
const guardModule = await loadFabricatorModule('fabricator-dataset-guard')
const cacheModule = await loadFabricatorModule('fabricator-live-source-cache')
const VERSION = '4.10.2-live.12913470'
const clone = value => structuredClone(value)
const code = fn => { try { fn(); return null } catch (e) { return e.message } }

test('the pinned LIVE mirror prepares with the verified counts', () => {
  const { source } = live
  assert.equal(source.channel, 'LIVE')
  assert.equal(source.version, VERSION)
  assert.equal(source.blueprintFile, `crafting_blueprints-${VERSION}.json`)
  assert.equal(source.itemFile, `crafting_items-${VERSION}.json`)
  assert.equal(source.blueprints.length, 1618)
  assert.equal(source.items.size, 1616)
  assert.equal(source.properties.size, 29)
})

test('LIVE only: PTU files are never selected and there is no PTU fallback', () => {
  const manifest = clone(live.manifest)
  assert.deepEqual(sourceModule.liveFilesFromManifest(manifest), {
    version: VERSION, blueprintFile: `crafting_blueprints-${VERSION}.json`, itemFile: `crafting_items-${VERSION}.json`,
  })
  delete manifest.channels.live
  assert.equal(code(() => sourceModule.liveFilesFromManifest(manifest)), 'FABRICATOR_SOURCE_MANIFEST_LIVE_MISSING')
  const ptuAsLive = clone(live.manifest)
  ptuAsLive.channels.live = clone(live.manifest.channels.ptu)
  assert.equal(code(() => sourceModule.liveFilesFromManifest(ptuAsLive)), 'FABRICATOR_SOURCE_MANIFEST_LIVE_VERSION_INVALID')
  const swapped = clone(live.manifest)
  swapped.channels.live.files.crafting_items = live.manifest.channels.ptu.files.crafting_items
  assert.equal(code(() => sourceModule.liveFilesFromManifest(swapped)), 'FABRICATOR_SOURCE_MANIFEST_LIVE_FILES_INVALID')
})

test('both documents must carry exactly the manifest LIVE version', () => {
  const blueprints = { ...live.blueprintDocument, version: '4.10.3-ptu.13032516' }
  assert.equal(code(() => sourceModule.prepareFabricatorLiveSource(live.manifest, blueprints, live.itemDocument)),
    'FABRICATOR_SOURCE_DOCUMENT_VERSION_MISMATCH')
  const items = { ...live.itemDocument, version: '4.10.1-live.1' }
  assert.equal(code(() => sourceModule.prepareFabricatorLiveSource(live.manifest, live.blueprintDocument, items)),
    'FABRICATOR_SOURCE_DOCUMENT_VERSION_MISMATCH')
  const ambiguous = { ...live.blueprintDocument, items: [...live.blueprintDocument.items, 'Iron'] }
  assert.equal(code(() => sourceModule.prepareFabricatorLiveSource(live.manifest, ambiguous, live.itemDocument)),
    'FABRICATOR_SOURCE_VOCABULARY_AMBIGUOUS')
  const duplicate = { ...live.itemDocument, items: [...live.itemDocument.items, live.itemDocument.items[0]] }
  assert.equal(code(() => sourceModule.prepareFabricatorLiveSource(live.manifest, live.blueprintDocument, duplicate)),
    'FABRICATOR_SOURCE_ITEMS_DUPLICATE_ENTITY_CLASS')
})

const mirror = { channel: 'LIVE', version: VERSION, blueprintTotal: 1618 }
const row = extra => ({ id: 'd5a91245-a5d4-4836-9265-d30cd32527c9', source: 'SCMDB', channel: 'LIVE', version: VERSION,
  status: 'ACTIVE', blueprint_total: 1618, ...extra })
const guard = (rows, m = mirror) => guardModule.guardFabricatorDataset(m, rows)

test('version guard: only an exact match of the single ACTIVE LIVE dataset passes', () => {
  assert.deepEqual(guard([row()]), { status: 'MATCH', datasetId: row().id, version: VERSION })
  assert.deepEqual(guard([row({ version: '4.10.3-live.1' })]),
    { status: 'VERSION_MISMATCH', mirrorVersion: VERSION, databaseVersion: '4.10.3-live.1' })
  assert.deepEqual(guard([row({ blueprint_total: 1617 })]),
    { status: 'BLUEPRINT_TOTAL_MISMATCH', mirrorTotal: 1618, databaseTotal: 1617 })
  assert.equal(guard([row({ channel: 'PTU' })]).status, 'CHANNEL_MISMATCH')
  assert.equal(guard([row()], { ...mirror, channel: 'PTU' }).status, 'CHANNEL_MISMATCH')
  assert.equal(guard([]).status, 'DATASET_UNAVAILABLE')
  assert.equal(guard(null).status, 'DATASET_UNAVAILABLE')
  assert.equal(guard([row(), row({ id: 'x' })]).status, 'DATASET_AMBIGUOUS')
  assert.equal(guard([row({ status: 'SUPERSEDED' })]).status, 'DATASET_UNAVAILABLE')
  assert.equal(guard([row({ source: 'OTHER' })]).status, 'DATASET_UNAVAILABLE')
})

test('module-level cache: the large documents are read and parsed once per process; failures retry', async () => {
  const reads = []
  const reader = async name => { reads.push(name); return readText(`data/scmdb/${name}`) }
  const load = cacheModule.createFabricatorLiveSourceLoader(reader)
  const [a, b] = await Promise.all([load(), load()])
  const c = await load()
  assert.equal(a, b)
  assert.equal(a, c)
  assert.deepEqual(reads.sort(), ['crafting_blueprints-4.10.2-live.12913470.json', 'crafting_items-4.10.2-live.12913470.json', 'latest.json'])
  assert.equal(a.source.blueprints.length, 1618)
  assert.equal(a.hierarchy.families.length, live.hierarchy.families.length)
  assert.equal('blueprintDocument' in a, false, 'raw documents are not retained')

  let attempt = 0
  const flaky = cacheModule.createFabricatorLiveSourceLoader(async name => {
    attempt += 1
    if (attempt === 1) throw new Error('disk')
    return readText(`data/scmdb/${name}`)
  })
  await assert.rejects(flaky(), /disk/)
  assert.equal((await flaky()).source.version, VERSION)

  const traversal = cacheModule.createFabricatorLiveSourceLoader(async () => JSON.stringify({
    channels: { live: { version: VERSION, files: { crafting_blueprints: '../x.json', crafting_items: 'y.json' } } },
  }))
  await assert.rejects(traversal(), /FABRICATOR_SOURCE_MANIFEST_LIVE_FILES_INVALID/)
})

test('server read boundary: server-only, LIVE mirror plus guarded user-session read, no write, no admin client', async () => {
  const reader = (await readText('lib/fabricator/fabricator-live-source-read.ts'))
    .split('\n').filter(line => !line.trim().startsWith('//')).join('\n')
  assert.match(reader, /^import 'server-only'/)
  assert.match(reader, /path\.join\(process\.cwd\(\), 'data', 'scmdb'\)/)
  assert.match(reader, /\.eq\('channel', 'LIVE'\)/)
  assert.match(reader, /\.eq\('status', 'ACTIVE'\)/)
  assert.match(reader, /guardFabricatorDataset\(/)
  assert.doesNotMatch(reader, /ptu|PTU/)
  assert.doesNotMatch(reader, /\.(insert|update|upsert|delete|rpc)\(/)
  assert.doesNotMatch(reader, /supabase\/admin|service_role|SUPABASE_SECRET_KEY/)
  for (const name of ['fabricator-types', 'fabricator-recipe', 'fabricator-live-source', 'fabricator-dataset-guard',
    'fabricator-product-family', 'fabricator-modifier-adapter', 'fabricator-baseline', 'fabricator-size', 'fabricator-units',
    'fabricator-live-source-cache']) {
    const text = await readText(`lib/fabricator/${name}.ts`)
    assert.doesNotMatch(text, /supabase|node:fs|server-only/, `${name} must stay pure`)
  }
})
