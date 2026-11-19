import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize } from '../scripts/domain-precheck/canonical.mjs'
import { runDomainPrecheck } from '../scripts/domain-precheck/precheck.mjs'
import { DOMAIN_REGISTER, REGISTER_VERSION } from '../scripts/domain-precheck/register.mjs'
import {
  VERSIONS, candidateOf, clone, codes, domainResult, makeMirror, rebuild, results, side,
} from './domain-precheck-fixture.mjs'

// Result classes of the fail-closed domain precheck (DATASET_PIPELINE_V1.md 37.1 to 37.5, 38.1).

const run = (baselineDocs, candidateDocs, { baseVersions, candVersions, candidate } = {}) => runDomainPrecheck({
  baseline: side(baselineDocs, baseVersions ? { versions: baseVersions } : {}),
  candidate: candidateOf(candidateDocs, { ...(candVersions ? { versions: candVersions } : {}), ...candidate }),
})
const ALL_LIVE = ['BLUEPRINT_CATALOG', 'REWARD_SOURCES', 'LOCATIONS', 'FABRICATOR', 'MATERIAL_UNITS', 'LEGACY_FRONTEND']
const ALL_PTU = ['BLUEPRINT_CATALOG', 'REWARD_SOURCES', 'LOCATIONS', 'LEGACY_FRONTEND']
const expectAll = (output, channel, names, expected) => {
  const actual = results(output, channel)
  assert.deepEqual(Object.keys(actual).sort(), [...names].sort())
  for (const name of names) assert.equal(actual[name], expected, `${channel}/${name}`)
}

test('identical baseline and candidate: every domain is UNCHANGED at stage 1', () => {
  const docs = makeMirror()
  const output = run(docs, docs)
  assert.equal(output.result, 'UNCHANGED')
  expectAll(output, 'LIVE', ALL_LIVE, 'UNCHANGED')
  expectAll(output, 'PTU', ALL_PTU, 'UNCHANGED')
  for (const entry of [...output.channels.LIVE.domains, ...output.channels.PTU.domains]) {
    assert.equal(entry.stage, 1)
    assert.deepEqual(entry.findings ?? [], [])
    assert.equal(entry.comparison_key.register_version, REGISTER_VERSION)
  }
  assert.deepEqual(output.findings, [])
})

test('a new CIG build without domain content change is UNCHANGED (stage 2 decides)', () => {
  const before = makeMirror()
  const after = rebuild(before, 'live', '1001')
  assert.notEqual(before.channels.live.crafting_blueprints.version, after.channels.live.crafting_blueprints.version)
  const output = run(before, after)
  assert.equal(output.channels.LIVE.build, '4.10.2-live.1001')
  assert.equal(output.channels.LIVE.baseline_build, '4.10.2-live.1000')
  expectAll(output, 'LIVE', ALL_LIVE, 'UNCHANGED')
  assert.ok(output.channels.LIVE.domains.every(entry => entry.stage === 2), 'per-build files differ in bytes, so stage 2 decides')
  assert.equal(output.channels.LIVE.result, 'UNCHANGED')
  expectAll(output, 'PTU', ALL_PTU, 'UNCHANGED')
})

test('generated_at, meta and version never matter (37.2 item 2)', () => {
  const before = makeMirror()
  const after = clone(before)
  after.channels.live.crafting_blueprints.meta = { blueprints: 999 }
  after.channels.live.crafting_items.meta = { items: 999 }
  after.channels.live.crafting_blueprints.generated_at = '2027-01-01T00:00:00Z'
  after.static.latest.generated_at = '2027-01-01T00:00:00Z'
  const output = run(before, after)
  expectAll(output, 'LIVE', ALL_LIVE, 'UNCHANGED')
  for (const entry of output.channels.LIVE.domains) {
    // merged.json is byte-equal, every other input differs in bytes only by ignored fields.
    assert.equal(entry.stage, ['REWARD_SOURCES', 'LOCATIONS'].includes(entry.domain) ? 1 : 2, entry.domain)
  }
})

test('object key order and whitespace are not content, array order is', () => {
  const before = makeMirror()
  const reordered = clone(before)
  const doc = reordered.channels.live.merged
  reordered.channels.live.merged = Object.fromEntries(Object.entries(doc).reverse())
  assert.equal(run(before, reordered).channels.LIVE.result, 'UNCHANGED')

  const swapped = clone(before)
  swapped.channels.live.crafting_blueprints.blueprints.reverse()
  const output = run(before, swapped)
  assert.equal(domainResult(output, 'LIVE', 'BLUEPRINT_CATALOG').result, 'CHANGED')
  assert.equal(domainResult(output, 'LIVE', 'FABRICATOR').result, 'CHANGED')
  assert.equal(domainResult(output, 'LIVE', 'LEGACY_FRONTEND').result, 'CHANGED')
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').result, 'UNCHANGED')
  assert.equal(domainResult(output, 'LIVE', 'MATERIAL_UNITS').result, 'UNCHANGED')
  assert.equal(output.channels.PTU.result, 'UNCHANGED', 'the other channel is untouched')
})

test('an array reorder in one registered section is CHANGED (array order is kept)', () => {
  const before = makeMirror()
  const after = clone(before)
  after.channels.live.crafting_blueprints.resources.reverse()
  const output = run(before, after)
  assert.equal(domainResult(output, 'LIVE', 'MATERIAL_UNITS').result, 'CHANGED')
  assert.deepEqual(codes(output, 'LIVE', 'MATERIAL_UNITS'), ['FINGERPRINT_DIFFERS'])
  assert.equal(domainResult(output, 'LIVE', 'FABRICATOR').result, 'CHANGED')
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').result, 'UNCHANGED')
})

test('merged.json: only the registered sections of each domain count', () => {
  const before = makeMirror()
  const unrelated = clone(before)
  unrelated.channels.live.merged.factions.f.name = 'changed'
  unrelated.channels.live.merged.ships.s = 2
  const a = run(before, unrelated)
  assert.equal(domainResult(a, 'LIVE', 'LOCATIONS').result, 'UNCHANGED')
  assert.equal(domainResult(a, 'LIVE', 'REWARD_SOURCES').result, 'UNCHANGED')

  const locations = clone(before)
  locations.channels.live.merged.locationPools.l3 = { name: 'L3', type: 'moon' }
  const b = run(before, locations)
  assert.equal(domainResult(b, 'LIVE', 'LOCATIONS').result, 'CHANGED')
  assert.equal(domainResult(b, 'LIVE', 'REWARD_SOURCES').result, 'UNCHANGED')

  const pools = clone(before)
  pools.channels.live.merged.blueprintPools.bp1.blueprints.push('x')
  const c = run(before, pools)
  assert.equal(domainResult(c, 'LIVE', 'REWARD_SOURCES').result, 'CHANGED')
  assert.equal(domainResult(c, 'LIVE', 'LOCATIONS').result, 'UNCHANGED')
})

test('crafting_items: every *Pools section counts, manufacturers do not (FABRICATOR) but do for LEGACY_FRONTEND', () => {
  const before = makeMirror()
  const pool = clone(before)
  pool.channels.live.crafting_items.ammoPools.push({ a: 3 })
  assert.equal(domainResult(run(before, pool), 'LIVE', 'FABRICATOR').result, 'CHANGED')

  const manufacturers = clone(before)
  manufacturers.channels.live.crafting_items.manufacturers.m.name = 'N'
  const output = run(before, manufacturers)
  assert.equal(domainResult(output, 'LIVE', 'FABRICATOR').result, 'UNCHANGED')
  assert.equal(domainResult(output, 'LIVE', 'LEGACY_FRONTEND').result, 'CHANGED')
})

test('a change in one channel never touches the other channel', () => {
  const before = makeMirror()
  const after = clone(before)
  after.channels.ptu.merged.locationPools.l1.name = 'renamed'
  const output = run(before, after)
  expectAll(output, 'LIVE', ALL_LIVE, 'UNCHANGED')
  assert.equal(domainResult(output, 'PTU', 'LOCATIONS').result, 'CHANGED')
  assert.equal(output.channels.PTU.result, 'CHANGED')
  assert.equal(output.result, 'CHANGED')
})

test('non-trigger changes alone are UNCHANGED (36.3) and still hashed', () => {
  const before = makeMirror()
  const after = clone(before)
  after.static.mema_cache[0].updated_at = '2027-01-01T00:00:00Z'
  after.static.local_mirror_manifest.generatedAt = '2027-01-01T00:00:00Z'
  after.static.workflow_state.mema_cache_last_refreshed = '2027-01-01T00:00:00Z'
  after.static.site_settings.mema_cache_last_refreshed = '2027-01-01T00:00:00Z'
  after.static.site_settings.updated_at = '2027-01-01T00:00:00Z'
  after.static.changelog.push({ version: '1.0.1', date: '2027-01-01', changes: [] })
  after.static.deltas_live.pairs.push({ from: 'a', to: 'b', total: 0 })
  after.channels.live.mining_data.presets = [2]
  after.channels.live.mission_history.missions = { m: 1 }
  const output = run(before, after)
  assert.equal(output.result, 'UNCHANGED')
  expectAll(output, 'LIVE', ALL_LIVE, 'UNCHANGED')
  expectAll(output, 'PTU', ALL_PTU, 'UNCHANGED')

  const unchanged = run(before, before)
  for (const file of ['mema_cache', 'local_mirror_manifest', 'workflow_state', 'site_settings', 'changelog', 'deltas_live', 'live/mining_data']) {
    assert.notEqual(output.source_export_revision.raw_file_hashes[file], unchanged.source_export_revision.raw_file_hashes[file], `${file} is hashed`)
  }
  assert.equal(Object.keys(output.source_export_revision.raw_file_hashes).length, 10 + 14, 'every file is hashed, including non-trigger files')
})

test('a version change with an equal fingerprint is CHANGED (37.5 forced reprocessing)', () => {
  const docs = makeMirror()
  const projector = run(docs, docs, { candVersions: { ...VERSIONS, projector: 'p2' } })
  expectAll(projector, 'LIVE', ALL_LIVE, 'CHANGED')
  assert.deepEqual(codes(projector, 'PTU', 'LOCATIONS'), ['PROJECTOR_VERSION_DIFFERS'])
  const entry = domainResult(projector, 'LIVE', 'LOCATIONS')
  assert.equal(entry.comparison_key.stage2_fingerprint, entry.baseline_comparison_key.stage2_fingerprint)
  assert.equal(entry.stage, 1)

  const register = run(docs, docs, { baseVersions: { ...VERSIONS, register: '0' } })
  expectAll(register, 'LIVE', ALL_LIVE, 'CHANGED')
  assert.deepEqual(codes(register, 'LIVE', 'FABRICATOR'), ['REGISTER_VERSION_DIFFERS'])

  const resolver = run(docs, docs, { candVersions: { ...VERSIONS, resolvers: { LOCATIONS: 'r2' } } })
  assert.equal(domainResult(resolver, 'LIVE', 'LOCATIONS').result, 'CHANGED')
  assert.deepEqual(codes(resolver, 'LIVE', 'LOCATIONS'), ['RESOLVER_VERSION_DIFFERS'])
  assert.equal(domainResult(resolver, 'LIVE', 'FABRICATOR').result, 'UNCHANGED')
  assert.deepEqual(domainResult(resolver, 'LIVE', 'LOCATIONS').comparison_key.resolver_versions, ['r2'])
})

test('a dependent domain follows its dependency (REWARD_SOURCES joins BLUEPRINT_CATALOG)', () => {
  const before = makeMirror()
  const catalog = clone(before)
  catalog.channels.live.crafting_blueprints.blueprints[0].tag = 'changed'
  const output = run(before, catalog)
  assert.equal(domainResult(output, 'LIVE', 'BLUEPRINT_CATALOG').result, 'CHANGED')
  const reward = domainResult(output, 'LIVE', 'REWARD_SOURCES')
  assert.equal(reward.result, 'CHANGED')
  assert.deepEqual(reward.reasons, [{ code: 'DEPENDENCY_CHANGED', dependency: 'BLUEPRINT_CATALOG' }])

  const held = clone(before)
  delete held.channels.live.crafting_blueprints.blueprints
  const heldOutput = run(before, held)
  assert.equal(domainResult(heldOutput, 'LIVE', 'BLUEPRINT_CATALOG').result, 'HELD_FOR_REVIEW')
  assert.equal(domainResult(heldOutput, 'LIVE', 'REWARD_SOURCES').result, 'HELD_FOR_REVIEW')
  assert.deepEqual(codes(heldOutput, 'LIVE', 'REWARD_SOURCES'), ['DEPENDENCY_HELD'])
})

test('channel scope of the register: FABRICATOR and MATERIAL_UNITS exist for LIVE only', () => {
  const docs = makeMirror()
  const output = run(docs, docs)
  assert.equal(domainResult(output, 'PTU', 'FABRICATOR'), undefined)
  assert.equal(domainResult(output, 'PTU', 'MATERIAL_UNITS'), undefined)
  for (const domain of DOMAIN_REGISTER.domains) {
    assert.equal(Boolean(domainResult(output, 'LIVE', domain.id)), domain.channels.includes('LIVE'))
    assert.equal(Boolean(domainResult(output, 'PTU', domain.id)), domain.channels.includes('PTU'))
  }
})

test('the precheck is pure: it does not modify its input and is deterministic', () => {
  const before = makeMirror()
  const after = rebuild(before, 'ptu', '2001')
  const baseline = side(before)
  const candidate = candidateOf(after)
  const snapshot = JSON.stringify([baseline, candidate])
  const first = runDomainPrecheck({ baseline, candidate })
  const second = runDomainPrecheck({ baseline, candidate })
  assert.equal(JSON.stringify([baseline, candidate]), snapshot)
  assert.equal(canonicalize(first), canonicalize(second))
})

test('canonical serialization: sorted keys, kept array order, no whitespace, unsafe integers refused', () => {
  assert.equal(canonicalize({ b: [3, 1, { z: 1, a: 'ä' }], a: null, c: true }), '{"a":null,"b":[3,1,{"a":"ä","z":1}],"c":true}')
  assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1]))
  assert.throws(() => canonicalize({ n: 2 ** 60 }), /INTEGER_NOT_REPRESENTABLE/)
  assert.throws(() => canonicalize({ n: Infinity }), /NUMBER_NOT_FINITE/)
})
