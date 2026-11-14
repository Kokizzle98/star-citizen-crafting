import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { loadLibModule, readText } from './fabricator-fixture.mjs'
import { COMMIT, SUBJECT, U, port, vehicleDocuments } from './loadout-source-fixture.mjs'

// F4-S vehicle loadout source foundation (Option B): build / freshness,
// generator, reader with guard, and the offline CLI. Synthetic fixtures only.

const build = await loadLibModule('lib/loadout-source/loadout-source-build')
const generator = await loadLibModule('lib/loadout-source/loadout-source-generator')
const reader = await loadLibModule('lib/loadout-source/loadout-source-reader')
const cli = await import(new URL('../scripts/generate-loadout-source-index.mjs', import.meta.url).href)

const clone = value => structuredClone(value)
const code = fn => { try { fn(); return null } catch (e) { return e.message } }
const provenance = () => build.createLoadoutProvenance(COMMIT, SUBJECT)
const index = () => generator.buildLoadoutIndex(vehicleDocuments(), provenance())
const text = () => generator.serializeLoadoutIndex(index())
const SCMDB_EXACT = '9.9.9-live.1000'

test('provenance comes from the commit and is LIVE only', () => {
  assert.deepEqual(provenance(), {
    source: 'scunpacked-data', sourceCommit: COMMIT, gameBuild: SUBJECT, gameVersion: '9.9.9',
    buildNumber: 1000, channel: 'LIVE', generatorVersion: '1.0.0',
  })
  assert.equal(code(() => build.createLoadoutProvenance(COMMIT, '9.9.9-PTU.1000')), 'LOADOUT_SOURCE_CHANNEL_NOT_LIVE')
  assert.equal(code(() => build.createLoadoutProvenance(COMMIT, 'Ship paint tag fixes')), 'LOADOUT_SOURCE_BUILD_UNREADABLE')
  assert.equal(code(() => build.createLoadoutProvenance('abc123', SUBJECT)), 'LOADOUT_SOURCE_COMMIT_INVALID')
  assert.equal(code(() => build.createLoadoutProvenance(COMMIT.toUpperCase(), SUBJECT)), 'LOADOUT_SOURCE_COMMIT_INVALID')
})

test('freshness: EXACT, STALE and UNAVAILABLE against the active SCMDB build', () => {
  const p = provenance()
  assert.deepEqual(build.evaluateLoadoutFreshness(p, SCMDB_EXACT), { freshness: 'EXACT' })
  assert.deepEqual(build.evaluateLoadoutFreshness(p, '9.9.9-live.1500'), { freshness: 'STALE', detail: 'BUILD_OLDER' })
  assert.deepEqual(build.evaluateLoadoutFreshness(p, '9.9.9-live.900'), { freshness: 'STALE', detail: 'BUILD_NEWER' })
  assert.deepEqual(build.evaluateLoadoutFreshness(p, '9.9.10-live.1000'), { freshness: 'STALE', detail: 'VERSION_DIFFERENT' })
  assert.deepEqual(build.evaluateLoadoutFreshness(p, '9.9.9-ptu.1000'), { freshness: 'UNAVAILABLE', reason: 'CHANNEL_MISMATCH' })
  for (const bad of [null, undefined, '', 'live', 42, '9.9.9-live']) {
    assert.deepEqual(build.evaluateLoadoutFreshness(p, bad), { freshness: 'UNAVAILABLE', reason: 'EXPECTED_BUILD_INVALID' })
  }
})

test('generator keeps every vehicle and port relation of a component', () => {
  const { components, vehicles, counts } = index()
  assert.deepEqual(counts, { vehicles: 2, components: 3, componentPortLinks: 5, emptyPorts: 2 })
  assert.deepEqual(Object.keys(vehicles), [U.vehicleA, U.vehicleB])

  const cooler = components[U.cooler]
  assert.deepEqual(cooler.classNames, ['TEST_Part_Cooler', 'TEST_Part_Cooler_Variant'])
  assert.deepEqual(cooler.vehicles.map(link => [link.vehicleUuid, link.ports.map(p => p.portId)]), [
    [U.vehicleA, ['loadout.0', 'loadout.1']],
    [U.vehicleB, ['loadout.0']],
  ])
  const first = cooler.vehicles[0].ports[0]
  assert.deepEqual(first.requiredTags, ['TEST_Alpha_Tag'])
  assert.deepEqual(first.portTags, ['TestPortTag'])
  assert.deepEqual(first.compatibleTypes, [{ type: 'Cooler', subTypes: ['Small'] }])
  assert.equal(first.minSize, 1)
  assert.equal(first.maxSize, 2)
  assert.equal(first.parentPortId, null)
  assert.equal(first.hardpointName, 'hardpoint_loadout_0')
})

test('nested ports keep their parent and uneditable ports stay plain evidence', () => {
  const sensor = index().components[U.sensor]
  assert.equal(sensor.vehicles.length, 1)
  const [child] = sensor.vehicles[0].ports
  assert.equal(child.parentPortId, 'loadout.0')
  assert.equal(child.editable, false)
  assert.deepEqual(sensor.summary, {
    vehicleCount: 1, portCount: 1, editablePortCount: 0, uneditablePortCount: 1, onlyOnUneditablePorts: true,
  })
})

test('summary signals are additional: the full relations stay and nothing is removed', () => {
  const { components } = index()
  const cooler = components[U.cooler].summary
  assert.deepEqual(cooler, { vehicleCount: 2, portCount: 3, editablePortCount: 2, uneditablePortCount: 1, onlyOnUneditablePorts: false })
  // Every installed UUID of the input is present, including the only-uneditable component.
  assert.deepEqual(Object.keys(components).sort(), [U.cooler, U.shield, U.sensor].sort())
  for (const component of Object.values(components)) assert.ok(component.vehicles.length > 0)
})

test('empty ports and an empty hardpoint name are counted or kept, never repaired', () => {
  const all = index()
  assert.equal(all.counts.emptyPorts, 2)
  assert.equal(JSON.stringify(all).includes('loadout.3'), false)
  const withEmptyName = clone(vehicleDocuments())
  withEmptyName[1].Loadout[3].UUID = U.shield
  const next = generator.buildLoadoutIndex(withEmptyName, provenance()).components[U.shield]
  const kept = next.vehicles.find(link => link.vehicleUuid === U.vehicleA).ports[0]
  assert.equal(kept.hardpointName, '')
  assert.deepEqual(kept.path, [''])
})

test('same input gives byte-identical output, independent of document order', () => {
  const a = generator.serializeLoadoutIndex(generator.buildLoadoutIndex(vehicleDocuments(), provenance()))
  const b = generator.serializeLoadoutIndex(generator.buildLoadoutIndex(vehicleDocuments().reverse(), provenance()))
  assert.equal(a, b)
  assert.equal(a, text())
  assert.ok(a.endsWith('}\n'))
  assert.equal(/\d{4}-\d{2}-\d{2}T/.test(a), false, 'no timestamp inside the index')
})

test('generator fails closed on malformed input and on non-LIVE provenance', () => {
  const docs = () => clone(vehicleDocuments())
  const bad = (mutate, expected) => {
    const d = docs(); mutate(d)
    assert.match(code(() => generator.buildLoadoutIndex(d, provenance())) ?? '', expected)
  }
  bad(d => { d[0].UUID = 'not-a-uuid' }, /^LOADOUT_SOURCE_VEHICLE_INVALID/)
  bad(d => { d[1].UUID = d[0].UUID }, /^LOADOUT_SOURCE_VEHICLE_DUPLICATE/)
  bad(d => { d[1].Loadout[1].PortId = 'loadout.0' }, /^LOADOUT_SOURCE_PORT_DUPLICATE/)
  bad(d => { delete d[1].Loadout[0].Editable }, /^LOADOUT_SOURCE_PORT_INVALID/)
  bad(d => { d[1].Loadout[0].UUID = 'TEST_Part_Cooler' }, /^LOADOUT_SOURCE_COMPONENT_UUID_INVALID/)
  bad(d => { d[1].Loadout[0].MinSize = 'big' }, /^LOADOUT_SOURCE_PORT_INVALID/)
  assert.equal(code(() => generator.buildLoadoutIndex('nope', provenance())), 'LOADOUT_SOURCE_DOCUMENTS_INVALID')
  assert.equal(code(() => generator.buildLoadoutIndex(vehicleDocuments(), { ...provenance(), channel: 'PTU' })), 'LOADOUT_SOURCE_PROVENANCE_INVALID')
  assert.equal(code(() => generator.buildLoadoutIndex(vehicleDocuments(), { ...provenance(), sourceCommit: 'abc' })), 'LOADOUT_SOURCE_PROVENANCE_INVALID')
  assert.equal(code(() => generator.buildLoadoutIndex(vehicleDocuments(), { ...provenance(), buildNumber: 1 })), 'LOADOUT_SOURCE_PROVENANCE_INVALID')
})

test('reader: EXACT and STALE keep the full evidence, STALE is not negative', () => {
  const exact = reader.evaluateLoadoutSource(text(), SCMDB_EXACT)
  assert.equal(exact.freshness, 'EXACT')
  const stale = reader.evaluateLoadoutSource(text(), '9.9.9-live.1500')
  assert.equal(stale.freshness, 'STALE')
  assert.equal(stale.detail, 'BUILD_OLDER')
  const found = reader.lookupLoadoutComponent(stale, U.cooler)
  assert.equal(found.evidence, 'FOUND')
  assert.equal(found.freshness, 'STALE')
  assert.deepEqual(found.vehicles.map(v => [v.vehicle.className, v.ports.length]), [['TEST_Vehicle_Alpha', 2], ['TEST_Vehicle_Beta', 1]])
})

test('reader: a missing index is UNAVAILABLE without a crash or a fallback', () => {
  assert.deepEqual(reader.evaluateLoadoutSource(null, SCMDB_EXACT), { freshness: 'UNAVAILABLE', reason: 'INDEX_MISSING' })
  assert.deepEqual(reader.evaluateLoadoutSource(undefined, SCMDB_EXACT), { freshness: 'UNAVAILABLE', reason: 'INDEX_MISSING' })
  assert.deepEqual(reader.evaluateLoadoutSource(null, SCMDB_EXACT, { readFailed: true }), { freshness: 'UNAVAILABLE', reason: 'INDEX_UNREADABLE' })
  const missing = reader.evaluateLoadoutSource(null, SCMDB_EXACT)
  assert.deepEqual(reader.lookupLoadoutComponent(missing, U.cooler), { evidence: 'UNAVAILABLE', reason: 'INDEX_MISSING' })
  assert.deepEqual(reader.lookupLoadoutComponent(missing, 'Invented Cooler'), { evidence: 'UNAVAILABLE', reason: 'INDEX_MISSING' })
})

test('reader: invalid, tampered or wrong-channel indexes are UNAVAILABLE, never thrown', () => {
  const doc = () => JSON.parse(text())
  const state = value => reader.evaluateLoadoutSource(typeof value === 'string' ? value : JSON.stringify(value), SCMDB_EXACT)
  const reason = value => { const s = state(value); assert.equal(s.freshness, 'UNAVAILABLE'); return s.reason }

  assert.equal(reason('{'), 'INDEX_INVALID')
  assert.equal(reason('[]'), 'INDEX_INVALID')
  assert.equal(reason('null'), 'INDEX_INVALID')
  for (const weird of [42, {}, [], true]) {
    assert.equal(reader.evaluateLoadoutSource(weird, SCMDB_EXACT).freshness, 'UNAVAILABLE')
  }
  let d = doc(); d.formatVersion = 2; assert.equal(reason(d), 'INDEX_INVALID')
  d = doc(); d.provenance.channel = 'PTU'; assert.equal(reason(d), 'INDEX_INVALID')
  d = doc(); d.provenance.sourceCommit = 'abc'; assert.equal(reason(d), 'INDEX_INVALID')
  d = doc(); d.counts.components = 99; assert.equal(reason(d), 'INDEX_INVALID')
  d = doc(); d.components[U.cooler].summary.portCount = 99; assert.equal(reason(d), 'INDEX_INVALID')
  d = doc(); d.components[U.cooler].vehicles[0].vehicleUuid = U.unknown; assert.equal(reason(d), 'INDEX_INVALID')
  d = doc(); d.components[U.cooler].uuid = U.shield; assert.equal(reason(d), 'INDEX_INVALID')
  d = doc(); delete d.components[U.cooler].vehicles[0].ports[0].editable; assert.equal(reason(d), 'INDEX_INVALID')
  assert.equal(reader.evaluateLoadoutSource(text(), '9.9.9-ptu.1000').reason, 'CHANNEL_MISMATCH')
  assert.equal(reader.evaluateLoadoutSource(text(), 'garbage').reason, 'EXPECTED_BUILD_INVALID')
})

test('lookup: exact UUID only; NO_EVIDENCE is not negative evidence; no name matching', () => {
  const state = reader.evaluateLoadoutSource(text(), SCMDB_EXACT)
  assert.deepEqual(reader.lookupLoadoutComponent(state, U.unknown), { evidence: 'NO_EVIDENCE', freshness: 'EXACT' })
  for (const notUuid of ['TEST_Part_Cooler', 'Invented TEST_Part_Cooler', U.unknown.toUpperCase(), ` ${U.cooler}`, '', null, undefined, 7]) {
    assert.deepEqual(reader.lookupLoadoutComponent(state, notUuid), { evidence: 'INVALID_UUID', freshness: 'EXACT' })
  }
  // Prototype keys are not components.
  assert.deepEqual(reader.lookupLoadoutComponent(state, '__proto__'), { evidence: 'INVALID_UUID', freshness: 'EXACT' })
  const found = reader.lookupLoadoutComponent(state, U.sensor)
  assert.equal(found.evidence, 'FOUND')
  assert.equal(found.component.summary.onlyOnUneditablePorts, true)
  assert.equal(found.vehicles.length, 1, 'the uneditable-only signal never replaces the relations')
})

// --- offline CLI ------------------------------------------------------------

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })

function makeCheckout(subject = SUBJECT, documents = vehicleDocuments()) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'f4s-source-'))
  git(dir, 'init', '-q')
  mkdirSync(path.join(dir, 'ships'))
  documents.forEach((document, i) => writeFileSync(path.join(dir, 'ships', `synthetic_${i}.json`), JSON.stringify(document)))
  writeFileSync(path.join(dir, 'ships.json'), '[]')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', subject)
  return { dir, commit: git(dir, 'rev-parse', 'HEAD').trim() }
}

const runCli = async (...argv) => {
  const lines = []; const errors = []
  const exit = await cli.run(argv, { out: l => lines.push(l), err: l => errors.push(l) })
  return { exit, lines, errors }
}

test('CLI: reproducible output for one pinned commit, written outside the source checkout', async () => {
  const { dir, commit } = makeCheckout()
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'f4s-out-'))
  const first = path.join(outDir, 'a', 'index.json')
  const second = path.join(outDir, 'b', 'index.json')
  const one = await runCli('--source', dir, '--out', first, '--expect-commit', commit)
  const two = await runCli('--source', dir, '--out', second)
  assert.equal(one.exit, 0, one.errors.join('\n'))
  assert.equal(two.exit, 0)
  assert.equal(readFileSync(first, 'utf8'), readFileSync(second, 'utf8'))
  const written = JSON.parse(readFileSync(first, 'utf8'))
  assert.equal(written.provenance.sourceCommit, commit)
  assert.equal(written.provenance.gameBuild, SUBJECT)
  assert.deepEqual(written.counts, { vehicles: 2, components: 3, componentPortLinks: 5, emptyPorts: 2 })
  assert.ok(one.lines.some(line => line.includes('licence of scunpacked-data unresolved')))
  assert.equal(one.lines.join('\n').includes(U.cooler), false, 'the index content is never printed')
  assert.equal(git(dir, 'status', '--porcelain').trim(), '', 'the checkout stays untouched')
})

test('CLI: fails closed (modified checkout, PTU, wrong commit, output inside the source, usage)', async () => {
  const outFile = path.join(mkdtempSync(path.join(os.tmpdir(), 'f4s-out-')), 'index.json')

  const ptu = makeCheckout('9.9.9-PTU.1000')
  assert.match((await runCli('--source', ptu.dir, '--out', outFile)).errors[0], /CHANNEL_NOT_LIVE/)

  const unreadable = makeCheckout('Ship paint tag fixes')
  assert.match((await runCli('--source', unreadable.dir, '--out', outFile)).errors[0], /BUILD_UNREADABLE/)

  const modified = makeCheckout()
  writeFileSync(path.join(modified.dir, 'ships', 'synthetic_0.json'), '{}')
  assert.match((await runCli('--source', modified.dir, '--out', outFile)).errors[0], /SOURCE_CHECKOUT_MODIFIED/)

  const pinned = makeCheckout()
  assert.match((await runCli('--source', pinned.dir, '--out', outFile, '--expect-commit', COMMIT)).errors[0], /SOURCE_COMMIT_MISMATCH/)
  assert.match((await runCli('--source', pinned.dir, '--out', path.join(pinned.dir, 'index.json'))).errors[0], /OUTPUT_INSIDE_SOURCE_CHECKOUT/)

  const broken = makeCheckout(SUBJECT, [{ UUID: 'nope' }])
  assert.match((await runCli('--source', broken.dir, '--out', outFile)).errors[0], /VEHICLE_INVALID/)

  const empty = mkdtempSync(path.join(os.tmpdir(), 'f4s-empty-'))
  git(empty, 'init', '-q'); writeFileSync(path.join(empty, 'x.txt'), 'x'); git(empty, 'add', '-A'); git(empty, 'commit', '-q', '-m', SUBJECT)
  assert.match((await runCli('--source', empty, '--out', outFile)).errors[0], /SOURCE_HAS_NO_SHIP_FILES/)

  assert.equal((await runCli()).exit, 2)
  assert.equal((await runCli('--source')).exit, 2)
  assert.equal((await runCli('--bogus', 'x')).exit, 2)
  assert.throws(() => readFileSync(outFile), 'no index is written when the run is blocked')
})

// --- repository contract ----------------------------------------------------

test('Option B: neither the raw source nor the derived index can be committed', () => {
  const root = path.resolve(new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  for (const ignored of [
    'data/derived/loadout-source/scunpacked-live-loadout-index.json',
    'data/external/scunpacked-data/ships/anything.json',
  ]) {
    assert.doesNotThrow(() => execFileSync('git', ['check-ignore', '-q', ignored], { cwd: root }), `${ignored} must be git-ignored`)
  }
  const tracked = execFileSync('git', ['ls-files', '--', 'data/derived', 'data/external'], { cwd: root, encoding: 'utf8' })
  assert.equal(tracked.trim(), '')
})

test('the reader and generator stay pure and the server read boundary stays read-only', async () => {
  for (const name of ['build', 'generator', 'reader', 'types']) {
    const source = await readText(`lib/loadout-source/loadout-source-${name}.ts`)
    assert.equal(/from\s+['"](?!\.\/)/.test(source), false, `${name} imports only relative modules`)
    assert.equal(/node:|fetch\(|process\.|Date\.now|new Date|Math\.random/.test(source), false, `${name} has no I/O, clock or randomness`)
  }
  const read = await readText('lib/loadout-source/loadout-source-read.ts')
  assert.ok(read.includes("import 'server-only'"))
  assert.equal(/supabase|writeFile|appendFile|unlink|fetch\(/i.test(read), false)
})
