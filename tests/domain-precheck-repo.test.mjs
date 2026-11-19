import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { run as runCli } from '../scripts/domain-precheck.mjs'
import { buildRoleMap, loadDirectory, loadGitRef } from '../scripts/domain-precheck/load-files.mjs'
import { buildObservation, serializeObservation } from '../scripts/domain-precheck/observation.mjs'
import { runDomainPrecheck } from '../scripts/domain-precheck/precheck.mjs'
import { DOMAIN_REGISTER, REGISTER_VERSION } from '../scripts/domain-precheck/register.mjs'
import { SHA, VERSIONS, candidateOf, domainResult, makeMirror, side, toFiles } from './domain-precheck-fixture.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const MIRROR = path.join(root, 'data', 'scmdb')
const text = file => readFileSync(path.join(root, file), 'utf8')

// --- the register against the real repository consumers (37.3 rule 1) -------

test('register: structure, versions, one activation path per consumer (owner decision 20)', () => {
  assert.equal(DOMAIN_REGISTER.register_version, REGISTER_VERSION)
  assert.ok(Object.isFrozen(DOMAIN_REGISTER) && Object.isFrozen(DOMAIN_REGISTER.domains))
  const ids = DOMAIN_REGISTER.domains.map(domain => domain.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const domain of DOMAIN_REGISTER.domains) {
    assert.ok(domain.channels.length > 0 && domain.channels.every(channel => DOMAIN_REGISTER.channels.includes(channel)))
    assert.ok(domain.consumers.length > 0, `${domain.id} has a consumer`)
    for (const consumer of domain.consumers) {
      assert.ok(['FILE_GIT', 'DATABASE'].includes(consumer.activation_path), `${consumer.path} has exactly one activation path`)
    }
    for (const input of domain.inputs) {
      assert.ok(Object.hasOwn(DOMAIN_REGISTER.channel_roles, input.role), `${domain.id} reads a registered role`)
      assert.ok(input.whole_document || input.sections || input.section_patterns)
      for (const section of input.sections ?? []) assert.ok(!DOMAIN_REGISTER.excluded_top_level_fields.includes(section))
    }
    for (const dependency of domain.depends_on) {
      assert.ok(ids.indexOf(dependency) >= 0 && ids.indexOf(dependency) < ids.indexOf(domain.id), 'dependencies are listed first')
      const shared = domain.channels.every(channel => DOMAIN_REGISTER.domains.find(other => other.id === dependency).channels.includes(channel))
      assert.ok(shared, 'a dependency covers the channels of its dependent')
    }
  }
  const paths = new Map()
  for (const consumer of DOMAIN_REGISTER.domains.flatMap(domain => domain.consumers)) {
    assert.ok(!paths.has(consumer.path) || paths.get(consumer.path) === consumer.activation_path, `${consumer.path} maps to one path`)
    paths.set(consumer.path, consumer.activation_path)
  }
})

test('register: every consumer exists, and every FILE_GIT consumer really reads the mirror', () => {
  const listed = [
    ...DOMAIN_REGISTER.domains.flatMap(domain => domain.consumers),
    ...DOMAIN_REGISTER.identity_consumers,
    ...DOMAIN_REGISTER.evidence_consumers,
    ...DOMAIN_REGISTER.workflow_references,
  ]
  for (const consumer of listed) assert.ok(existsSync(path.join(root, consumer.path)), `${consumer.path} exists`)
  for (const consumer of DOMAIN_REGISTER.domains.flatMap(domain => domain.consumers)) {
    const source = text(consumer.path)
    const readsMirror = /data\/scmdb|'data', 'scmdb'|latest\.json|local-mirror-manifest/.test(source)
    if (consumer.kind === 'MIRROR_READER' || consumer.kind === 'MIRROR_INGESTION') {
      assert.ok(readsMirror, `${consumer.path} reads the mirror`)
    }
    if (consumer.activation_path === 'FILE_GIT') {
      assert.ok(consumer.kind === 'MIRROR_READER' || consumer.kind === 'MIRROR_TRANSFORM', consumer.path)
    }
    if (consumer.kind === 'DATABASE_READER') {
      assert.ok(/\.from\('scmdb_blueprint_catalog'\)|\.rpc\('get_active_crew_blueprint_status'\)/.test(source), `${consumer.path} reads the database`)
      assert.ok(!readsMirror, `${consumer.path} does not read the mirror`)
    }
  }
})

test('register: the section names exist in the real mirror files and in the real readers', () => {
  const latest = JSON.parse(readFileSync(path.join(MIRROR, 'latest.json'), 'utf8'))
  for (const channel of ['live', 'ptu']) {
    for (const domain of DOMAIN_REGISTER.domains.filter(entry => entry.channels.includes(channel.toUpperCase()))) {
      for (const input of domain.inputs) {
        const doc = JSON.parse(readFileSync(path.join(MIRROR, latest.channels[channel].files[input.role]), 'utf8'))
        for (const section of input.sections ?? []) assert.ok(Object.hasOwn(doc, section), `${channel}/${input.role}.${section}`)
        for (const { pattern, min_matches: min } of input.section_patterns ?? []) {
          assert.ok(Object.keys(doc).filter(key => new RegExp(pattern).test(key)).length >= min, `${channel}/${input.role} ${pattern}`)
        }
      }
    }
  }
  // Each registered section is read by the named code, so the register does not invent sections.
  const read = (file, name) => assert.ok(text(file).includes(name), `${file} reads ${name}`)
  read('lib/blueprints/blueprint-extractor.ts', 'blueprints')
  read('lib/blueprints/blueprint-reward-extractor.ts', 'blueprintPools')
  read('lib/blueprints/blueprint-reward-extractor.ts', 'contracts')
  read('lib/scmdb/location-extractor.ts', 'locationPools')
  for (const section of ['blueprints', 'properties', 'resources', 'items']) read('lib/fabricator/fabricator-live-source.ts', `blueprintDocument.${section}`)
  read('lib/fabricator/fabricator-live-source.ts', 'itemDocument.items')
  read('lib/fabricator/fabricator-live-source.ts', "endsWith('Pools')")
  read('lib/inventory/material-units.ts', 'dataset.items')
  read('lib/inventory/material-units.ts', 'dataset.resources')
})

function walk(directory, out = []) {
  for (const name of readdirSync(directory)) {
    if (['node_modules', '.next', '.git', 'data', 'tests', 'docs', 'database', 'public', 'build'].includes(name)) continue
    const full = path.join(directory, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mjs|js|py|yml)$/.test(name)) out.push(path.relative(root, full).split(path.sep).join('/'))
  }
  return out
}

test('every repository consumer of data/scmdb/ has a register entry (37.3 rule 1)', () => {
  const known = new Set([
    ...DOMAIN_REGISTER.domains.flatMap(domain => domain.consumers.map(consumer => consumer.path)),
    ...DOMAIN_REGISTER.identity_consumers.map(consumer => consumer.path),
    ...DOMAIN_REGISTER.evidence_consumers.map(consumer => consumer.path),
    ...DOMAIN_REGISTER.workflow_references.map(consumer => consumer.path),
  ])
  const pattern = /data\/scmdb|'data', 'scmdb'|"data", "scmdb"|\bscmdb\/latest\.json/
  const found = walk(root).filter(file => !file.startsWith('scripts/domain-precheck') && pattern.test(text(file)))
  assert.ok(found.length >= 8, 'the scan finds the known readers')
  const unknown = found.filter(file => !known.has(file))
  assert.deepEqual(unknown, [], 'a consumer without a register entry would make the precheck HELD_FOR_REVIEW')
})

test('the loadout reader is identity input only and stays out of the domains', () => {
  const [consumer] = DOMAIN_REGISTER.identity_consumers
  assert.equal(consumer.path, 'lib/loadout-source/loadout-source-read.ts')
  const source = text(consumer.path)
  assert.match(source, /latest\.json/)
  assert.ok(!/crafting_|merged|mining_/.test(source.replace(/\/\/.*$/gm, '')))
})

test('every file of the real mirror has a register entry', async () => {
  const mirror = await loadDirectory(MIRROR)
  assert.deepEqual(Object.keys(mirror.files).filter(key => key.startsWith('unregistered/')), [])
  assert.equal(Object.keys(mirror.files).length, 24)
})

// --- real data: current mirror, simulated build change (deltas pairs with total 0) -------

const realMirror = await loadDirectory(MIRROR)
const realLatest = JSON.parse(readFileSync(path.join(MIRROR, 'latest.json'), 'utf8'))
const realVersions = { ...VERSIONS }

test('real mirror against itself is UNCHANGED for every channel and domain', () => {
  const output = runDomainPrecheck({
    baseline: { ...realMirror, versions: realVersions },
    candidate: { ...realMirror, versions: realVersions, sourceExport: { upstreamCommitSha: SHA } },
  })
  assert.equal(output.result, 'UNCHANGED')
  assert.deepEqual(output.findings, [])
  assert.equal(Object.values(output.channels).flatMap(channel => channel.domains).length, 10)
})

/** The real files of one channel, presented as if they came from `fromVersion` (same content, other build). */
function asEarlierBuild(files, channel, fromVersion) {
  const toVersion = realLatest.channels[channel].version
  const out = { files: { ...files.files }, fileNames: { ...files.fileNames } }
  const latest = JSON.parse(Buffer.from(out.files.latest).toString('utf8'))
  latest.channels[channel].version = fromVersion
  for (const [role, name] of Object.entries(latest.channels[channel].files)) latest.channels[channel].files[role] = name.replace(toVersion, fromVersion)
  out.files.latest = JSON.stringify(latest)
  for (const role of ['crafting_blueprints', 'crafting_items', 'merged']) {
    const key = `${channel}/${role}`
    out.files[key] = Buffer.from(Buffer.from(out.files[key]).toString('utf8').replaceAll(toVersion, fromVersion))
  }
  return out
}

test('real data: LIVE build pairs with an upstream delta total of 0 are UNCHANGED for the affected domains', async () => {
  const deltas = JSON.parse(readFileSync(path.join(MIRROR, 'deltas-live.json'), 'utf8'))
  const toVersion = realLatest.channels.live.version
  const pair = deltas.pairs.find(entry => entry.to === toVersion && entry.total === 0)
  assert.ok(pair, 'deltas-live.json holds a zero-total pair that ends at the pinned LIVE build')
  assert.equal(pair.from.split('-')[0], toVersion.split('-')[0], 'same Semantic SC Version')
  // Same content under the earlier build string: only identity differs, exactly like a zero-delta build change.
  const earlier = asEarlierBuild(realMirror, 'live', pair.from)
  const output = runDomainPrecheck({
    baseline: { ...earlier, versions: realVersions },
    candidate: { ...realMirror, versions: realVersions, sourceExport: { upstreamCommitSha: SHA } },
  })
  assert.equal(output.channels.LIVE.baseline_build, pair.from)
  assert.equal(output.channels.LIVE.build, toVersion)
  for (const entry of output.channels.LIVE.domains) {
    assert.equal(entry.result, 'UNCHANGED', entry.domain)
    assert.equal(entry.stage, 2, 'raw bytes differ because the build string is embedded')
  }
  assert.equal(output.channels.PTU.result, 'UNCHANGED')
  // Every zero-total pair of the real file ends in UNCHANGED under the same construction.
  const zero = deltas.pairs.filter(entry => entry.total === 0 && entry.from.split('-')[0] === entry.to.split('-')[0])
  assert.ok(zero.length >= 10)
})

test('real data: a real change in a registered section is CHANGED (control for the zero-total check)', () => {
  const earlier = asEarlierBuild(realMirror, 'live', '4.10.2-live.1')
  const doc = JSON.parse(Buffer.from(earlier.files['live/merged']).toString('utf8'))
  const key = Object.keys(doc.locationPools)[0]
  doc.locationPools[key].name = `${doc.locationPools[key].name} (edited)`
  earlier.files['live/merged'] = JSON.stringify(doc)
  const output = runDomainPrecheck({
    baseline: { ...earlier, versions: realVersions },
    candidate: { ...realMirror, versions: realVersions, sourceExport: { upstreamCommitSha: SHA } },
  })
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').result, 'CHANGED')
  assert.equal(domainResult(output, 'LIVE', 'REWARD_SOURCES').result, 'UNCHANGED')
  assert.equal(domainResult(output, 'LIVE', 'FABRICATOR').result, 'UNCHANGED')
})

// --- real data: mirror git history (skipped when it is not available locally) ------

const HISTORY = { manifestOnlyFrom: 'eaf4f77', manifestOnlyTo: 'e11f51d', firstImport: 'c5a7bf9', ptuBefore: 'e11f51d', ptuAfter: 'e271759' }

function historyAvailable() {
  try {
    for (const ref of Object.values(HISTORY)) {
      execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], { cwd: root, stdio: 'ignore', env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } })
    }
    const probe = loadGitRef(HISTORY.ptuAfter, { cwd: root })
    return Object.keys(probe.files).length >= 24 && Object.values(HISTORY).every(ref => Object.keys(loadGitRef(ref, { cwd: root }).files).length >= 24)
  } catch {
    return false
  }
}
const historySkip = historyAvailable() ? false : 'mirror git history (or its blobs) is not available locally'
const precheckRefs = (baseRef, candRef, mutate) => {
  const baseline = loadGitRef(baseRef, { cwd: root })
  const candidate = loadGitRef(candRef, { cwd: root })
  mutate?.({ baseline, candidate })
  return runDomainPrecheck({
    baseline: { ...baseline, versions: { ...VERSIONS } },
    candidate: { ...candidate, versions: { ...VERSIONS }, sourceExport: { upstreamCommitSha: SHA } },
  })
}

test('git history: syncs that only touched local-mirror-manifest.json are UNCHANGED', { skip: historySkip }, () => {
  const output = precheckRefs(HISTORY.manifestOnlyFrom, HISTORY.manifestOnlyTo)
  assert.equal(output.result, 'UNCHANGED')
  assert.notEqual(output.source_export_revision.raw_file_hashes['local_mirror_manifest'] ?? output.source_export_revision.raw_file_hashes['local-mirror-manifest.json'], undefined)
})

test('git history: the first full import carries an unknown file, so the precheck holds', { skip: historySkip }, () => {
  const output = precheckRefs(HISTORY.firstImport, HISTORY.manifestOnlyFrom)
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  assert.ok(output.findings.some(finding => finding.code === 'UNREGISTERED_FILE' && finding.file === 'unregistered/_local-mirror-manifest.json'))
  assert.ok(output.findings.some(finding => finding.code === 'MISSING_FILE' && finding.role === 'local_mirror_manifest'))
})

test('git history: the real PTU build change flips ptu_enabled, which holds (owner decision 19)', { skip: historySkip }, () => {
  const output = precheckRefs(HISTORY.ptuBefore, HISTORY.ptuAfter)
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  const finding = output.findings.find(entry => entry.code === 'SITE_SETTINGS_CHANGED')
  assert.deepEqual(finding.keys, ['ptu_enabled'])
})

test('git history: PTU build change 12999338 -> 13032516 matches the upstream deltas pair', { skip: historySkip }, () => {
  // Isolate the content question from the site-settings hold: keep the baseline site-settings.
  const output = precheckRefs(HISTORY.ptuBefore, HISTORY.ptuAfter, ({ baseline, candidate }) => {
    candidate.files.site_settings = baseline.files.site_settings
  })
  const candidate = loadGitRef(HISTORY.ptuAfter, { cwd: root })
  const deltas = JSON.parse(Buffer.from(candidate.files.deltas_ptu).toString('utf8'))
  const pair = deltas.pairs.find(entry => entry.from === '4.10.3-ptu.12999338' && entry.to === '4.10.3-ptu.13032516')
  assert.ok(pair)
  assert.equal(output.channels.PTU.baseline_build, pair.from)
  assert.equal(output.channels.PTU.build, pair.to)
  // The upstream pair reports added blueprints and blueprint pools, so those domains cannot be UNCHANGED.
  const count = value => (Array.isArray(value) ? value.length : value)
  const total = section => count(section.added) + count(section.removed) + count(section.changed)
  assert.ok(total(pair.blueprints) > 0)
  assert.equal(domainResult(output, 'PTU', 'BLUEPRINT_CATALOG').result, 'CHANGED')
  assert.ok(total(pair.blueprintPools) > 0)
  assert.equal(domainResult(output, 'PTU', 'REWARD_SOURCES').result, 'CHANGED')
  assert.equal(domainResult(output, 'PTU', 'LEGACY_FRONTEND').result, 'CHANGED')
  // LIVE did not change between the two syncs.
  for (const entry of output.channels.LIVE.domains) assert.equal(entry.result, 'UNCHANGED', entry.domain)
  assert.equal(output.channels.LIVE.result, 'UNCHANGED')
  assert.equal(output.result, 'CHANGED')
})

// --- observation record (39) ---------------------------------------------------

test('observation entries carry the fields of section 39 and serialize append-only', () => {
  const docs = makeMirror()
  const output = runDomainPrecheck({ baseline: side(docs), candidate: candidateOf(docs) })
  const observation = buildObservation(output, {
    observedAt: '2026-11-19T12:00:00Z',
    domainRevisionIds: { 'LIVE/LOCATIONS': 'rev-1' },
  })
  assert.equal(observation.entries.length, 10)
  const entry = observation.entries.find(item => item.channel === 'LIVE' && item.domain === 'LOCATIONS')
  assert.deepEqual(Object.keys(entry).sort(), [
    'acknowledgements', 'build', 'channel', 'comparison_key', 'domain', 'domain_revision_id', 'observed_at', 'reason_codes', 'record_type', 'result', 'schema', 'source_export_revision',
  ])
  assert.deepEqual(entry.acknowledgements, [])
  assert.equal(entry.domain_revision_id, 'rev-1')
  assert.equal(entry.result, 'UNCHANGED')
  assert.equal(entry.build, '4.10.2-live.1000')
  assert.equal(entry.observed_at, '2026-11-19T12:00:00Z')
  assert.equal(entry.source_export_revision.upstream_commit_sha, SHA)
  assert.equal(entry.comparison_key.register_version, REGISTER_VERSION)
  assert.equal(observation.entries.find(item => item.domain === 'FABRICATOR').domain_revision_id, null)
  assert.equal(observation.source_export_revision_record.revision_digest, entry.source_export_revision.revision_digest)
  assert.equal(Object.keys(observation.source_export_revision_record.raw_file_hashes).length, 24)

  const lines = serializeObservation(observation)
  assert.ok(lines.endsWith('\n'))
  const parsed = lines.trimEnd().split('\n').map(line => JSON.parse(line))
  assert.equal(parsed.length, 11)
  assert.equal(parsed[0].record_type, 'source_export_revision')
  // Appending a second run never changes the first one.
  const second = serializeObservation(buildObservation(output, { observedAt: '2026-11-20T12:00:00Z' }))
  assert.ok((lines + second).startsWith(lines))
  assert.equal(serializeObservation(observation), lines, 'deterministic')
  assert.throws(() => buildObservation(output, {}), /observedAt/)
})

test('a held run is observed too: result HELD, no comparison key, no revision reference', () => {
  const docs = makeMirror()
  const output = runDomainPrecheck({ baseline: side(docs), candidate: { ...side(docs) } })
  const observation = buildObservation(output, { observedAt: '2026-11-19T12:00:00Z' })
  assert.equal(observation.source_export_revision_record, null)
  for (const entry of observation.entries) {
    assert.equal(entry.result, 'HELD_FOR_REVIEW')
    assert.equal(entry.comparison_key, null)
    assert.equal(entry.source_export_revision, null)
    assert.ok(entry.reason_codes.includes('SOURCE_EXPORT_REVISION_MISSING'))
  }
})

// --- loader and CLI ---------------------------------------------------------------

test('loader maps per-build files to roles through latest.json, not through paths (37.1)', () => {
  const docs = makeMirror()
  const entries = []
  for (const [role, doc] of Object.entries(docs.static)) entries.push({ name: `${role.replaceAll('_', '-')}.json`, bytes: Buffer.from(JSON.stringify(doc)) })
  const latest = docs.static.latest
  for (const channel of ['live', 'ptu']) {
    for (const [role, name] of Object.entries(latest.channels[channel].files)) {
      entries.push({ name, bytes: Buffer.from(JSON.stringify(docs.channels[channel][role])) })
    }
  }
  entries.push({ name: '_local-mirror-manifest.json', bytes: Buffer.from('{}') })
  entries.push({ name: 'merged-4.10.2-live.999.json', bytes: Buffer.from('{}') }) // not named by latest.json
  const map = buildRoleMap(entries)
  assert.ok(map.files['live/crafting_blueprints'] && map.files['ptu/merged'])
  assert.equal(map.fileNames['live/merged'], 'merged-4.10.2-live.1000.json')
  assert.ok(map.files.latest, 'latest.json is the static role latest')
  assert.deepEqual(Object.keys(map.files).filter(key => key.startsWith('unregistered/')).sort(), [
    'unregistered/_local-mirror-manifest.json', 'unregistered/merged-4.10.2-live.999.json',
  ])
  // A new build renames every per-build file; the role stays the same.
  const renamed = entries.map(entry => (entry.name === 'merged-4.10.2-live.1000.json' ? { ...entry, name: 'merged-4.10.2-live.1001.json' } : entry))
  const latestEntry = renamed.find(entry => entry.name === 'latest.json')
  const moved = JSON.parse(latestEntry.bytes.toString())
  moved.channels.live.files.merged = 'merged-4.10.2-live.1001.json'
  latestEntry.bytes = Buffer.from(JSON.stringify(moved))
  assert.deepEqual(Buffer.from(buildRoleMap(renamed).files['live/merged']), Buffer.from(map.files['live/merged']))
})

async function withTempMirrors(callback) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'domain-precheck-'))
  try {
    return await callback(base)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

async function writeMirror(directory, docs) {
  await (await import('node:fs/promises')).mkdir(directory, { recursive: true })
  const names = {
    latest: 'latest.json', game_versions: 'game-versions.json', versions: 'versions.json', changelog: 'changelog.json',
    deltas_live: 'deltas-live.json', deltas_ptu: 'deltas-ptu.json', local_mirror_manifest: 'local-mirror-manifest.json',
    mema_cache: 'mema-cache.json', workflow_state: 'workflow-state.json', site_settings: 'site-settings.json',
  }
  for (const [role, doc] of Object.entries(docs.static)) await writeFile(path.join(directory, names[role]), JSON.stringify(doc))
  for (const channel of ['live', 'ptu']) {
    for (const [role, name] of Object.entries(docs.static.latest.channels[channel].files)) {
      await writeFile(path.join(directory, name), JSON.stringify(docs.channels[channel][role]))
    }
  }
}

const capture = () => {
  const chunks = { out: '', err: '' }
  return { chunks, stdout: { write: value => { chunks.out += value } }, stderr: { write: value => { chunks.err += value } } }
}

test('CLI: two directories, JSON result, observation, no write into the compared directories', async () => {
  await withTempMirrors(async base => {
    const docs = makeMirror()
    const next = structuredClone(docs)
    next.channels.live.merged.locationPools.l1.name = 'renamed'
    await writeMirror(path.join(base, 'a'), docs)
    await writeMirror(path.join(base, 'b'), next)
    const before = readdirSync(path.join(base, 'a')).sort()

    const io = capture()
    const code = await runCli(['--baseline-dir', path.join(base, 'a'), '--candidate-dir', path.join(base, 'b'), '--candidate-source-sha', SHA, '--observed-at', '2026-11-19T00:00:00Z'], io)
    assert.equal(code, 0, io.chunks.err)
    const output = JSON.parse(io.chunks.out)
    assert.equal(output.result, 'CHANGED')
    assert.equal(output.versions_source, 'defaulted')
    assert.equal(output.channels.LIVE.domains.find(entry => entry.domain === 'LOCATIONS').result, 'CHANGED')
    assert.equal(output.channels.PTU.result, 'UNCHANGED')
    assert.equal(output.observation.entries.length, 10)
    assert.deepEqual(readdirSync(path.join(base, 'a')).sort(), before)
    assert.deepEqual(readdirSync(base).sort(), ['a', 'b'])

    const missingSha = capture()
    assert.equal(await runCli(['--baseline-dir', path.join(base, 'a'), '--candidate-dir', path.join(base, 'a')], missingSha), 0)
    assert.equal(JSON.parse(missingSha.chunks.out).result, 'HELD_FOR_REVIEW')

    const jsonl = capture()
    await runCli(['--baseline-dir', path.join(base, 'a'), '--candidate-dir', path.join(base, 'b'), '--candidate-source-sha', SHA, '--observed-at', '2026-11-19T00:00:00Z', '--emit', 'jsonl'], jsonl)
    assert.equal(jsonl.chunks.out.trimEnd().split('\n').length, 11)

    const versionsFile = path.join(base, 'versions.json')
    await writeFile(versionsFile, JSON.stringify({ baseline: { projector: 'p1', register: REGISTER_VERSION }, candidate: { projector: 'p2' } }))
    const versions = capture()
    await runCli(['--baseline-dir', path.join(base, 'a'), '--candidate-dir', path.join(base, 'a'), '--candidate-source-sha', SHA, '--versions-file', versionsFile], versions)
    const forced = JSON.parse(versions.chunks.out)
    assert.equal(forced.versions_source, 'file')
    assert.equal(forced.result, 'CHANGED')
  })
})

test('CLI: usage errors exit with 2 and never print a result', async () => {
  for (const args of [[], ['--baseline-dir', 'x'], ['--baseline-dir', 'x', '--baseline-ref', 'y', '--candidate-dir', 'z'], ['--nope'], ['--baseline-dir'], ['--baseline-dir', 'x', '--candidate-dir', 'y', '--emit', 'xml']]) {
    const io = capture()
    assert.equal(await runCli(args, io), 2, JSON.stringify(args))
    assert.equal(io.chunks.out, '')
  }
  const missing = capture()
  assert.equal(await runCli(['--baseline-dir', '/nonexistent-a', '--candidate-dir', '/nonexistent-b'], missing), 2)
  const help = capture()
  assert.equal(await runCli(['--help'], help), 0)
  assert.match(help.chunks.out, /Writes nothing, uses no network/)
})

test('CLI as a process: runs under plain node without a build step', { skip: process.platform === 'win32' && 'spawn differs on Windows' }, () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'domain-precheck.mjs'), '--baseline-dir', MIRROR, '--candidate-dir', MIRROR, '--candidate-source-sha', SHA, '--emit', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).result, 'UNCHANGED')
})

test('the precheck code is read-only: no writes, no network, no database, no clock outside the CLI', async () => {
  const files = ['scripts/domain-precheck.mjs', ...readdirSync(path.join(root, 'scripts', 'domain-precheck')).map(name => `scripts/domain-precheck/${name}`)]
  for (const file of files) {
    const source = (await readFile(path.join(root, file), 'utf8')).replace(/\/\/.*$/gm, '')
    assert.ok(!/writeFile|appendFile|createWriteStream|mkdir|unlink|rmSync|renameSync|copyFile/.test(source), `${file} writes nothing`)
    assert.ok(!/node:(https?|net|tls|dgram|dns)|\bfetch\(|XMLHttpRequest|supabase|SUPABASE/i.test(source), `${file} uses no network or database`)
    if (file !== 'scripts/domain-precheck.mjs') assert.ok(!/Date\.now|new Date\(/.test(source), `${file} has no clock`)
  }
})


// --- unreadable entries never disappear (review fix) --------------------------------

const gitIn = (cwd, args, input) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, input, encoding: 'utf8' }).trim()
const precheckLoaded = (baseline, candidate) => runDomainPrecheck({
  baseline: { ...baseline, versions: { ...VERSIONS } },
  candidate: { ...candidate, versions: { ...VERSIONS }, sourceExport: { upstreamCommitSha: SHA } },
})
const unreadableFindings = output => output.findings.filter(finding => finding.code === 'UNREADABLE_FILE')

/** A local repository holding one synthetic mirror commit; `extra` adds tree entries beforehand. */
async function withMirrorRepo(extra, callback) {
  await withTempMirrors(async base => {
    const docs = makeMirror()
    await writeMirror(path.join(base, 'data', 'scmdb'), docs)
    await writeFile(path.join(base, 'data', 'scmdb', 'unknown-extra.json'), '{"x":1}')
    gitIn(base, ['init', '-q'])
    gitIn(base, ['add', '-A'])
    await extra?.(base)
    gitIn(base, ['commit', '-q', '-m', 'mirror'])
    await callback(base)
  })
}
const blobPath = (base, name) => {
  const sha = gitIn(base, ['rev-parse', `HEAD:data/scmdb/${name}`])
  return path.join(base, '.git', 'objects', sha.slice(0, 2), sha.slice(2))
}

test('git ref: an unreadable blob of an unknown file holds despite unchanged registered files and a valid SHA', async () => {
  await withMirrorRepo(null, async base => {
    const control = precheckLoaded(loadGitRef('HEAD', { cwd: base }), loadGitRef('HEAD', { cwd: base }))
    assert.equal(control.result, 'HELD_FOR_REVIEW', 'the unknown file itself already holds (control)')
    assert.ok(control.findings.some(finding => finding.code === 'UNREGISTERED_FILE'))
  })
  // Without the unknown file the same tree is UNCHANGED; with an unreadable one it must not be.
  await withTempMirrors(async base => {
    await writeMirror(path.join(base, 'data', 'scmdb'), makeMirror())
    await writeFile(path.join(base, 'data', 'scmdb', 'notes.txt'), 'x')
    gitIn(base, ['init', '-q'])
    gitIn(base, ['add', '-A'])
    gitIn(base, ['commit', '-q', '-m', 'mirror'])
    const blob = blobPath(base, 'notes.txt')
    await rm(blob, { force: true })
    const loaded = loadGitRef('HEAD', { cwd: base })
    assert.deepEqual(loaded.unreadable, [{ name: 'notes.txt', reason: 'OBJECT_UNAVAILABLE' }])
    assert.equal(Object.keys(loaded.files).some(key => key.includes('notes')), false, 'the unreadable entry is not in the role map')
    const output = precheckLoaded(loaded, loaded)
    assert.equal(output.result, 'HELD_FOR_REVIEW')
    assert.deepEqual(unreadableFindings(output).map(finding => [finding.side, finding.file]), [['baseline', 'notes.txt'], ['candidate', 'notes.txt']])
    for (const channel of Object.values(output.channels)) assert.ok(channel.domains.every(entry => entry.result === 'HELD_FOR_REVIEW' && entry.comparison_key === null))
  })
})

test('git ref: unreadable blob of a listed role or of a static role holds', async () => {
  for (const name of ['merged-4.10.2-live.1000.json', 'mining_data-4.10.3-ptu.2000.json', 'workflow-state.json', 'latest.json']) {
    await withTempMirrors(async base => {
      await writeMirror(path.join(base, 'data', 'scmdb'), makeMirror())
      gitIn(base, ['init', '-q'])
      gitIn(base, ['add', '-A'])
      gitIn(base, ['commit', '-q', '-m', 'mirror'])
      await rm(blobPath(base, name), { force: true })
      const loaded = loadGitRef('HEAD', { cwd: base })
      assert.ok(loaded.unreadable.some(item => item.name === name), name)
      const output = precheckLoaded(loaded, loaded)
      assert.equal(output.result, 'HELD_FOR_REVIEW', name)
      assert.ok(unreadableFindings(output).some(finding => finding.file === name), name)
      for (const channel of Object.values(output.channels)) assert.ok(channel.domains.every(entry => entry.result === 'HELD_FOR_REVIEW'), name)
    })
  }
})

test('git ref: symlinks and submodules in the tree are held, not skipped', async () => {
  await withTempMirrors(async base => {
    await writeMirror(path.join(base, 'data', 'scmdb'), makeMirror())
    gitIn(base, ['init', '-q'])
    gitIn(base, ['add', '-A'])
    const link = gitIn(base, ['hash-object', '-w', '--stdin'], 'latest.json')
    gitIn(base, ['update-index', '--add', '--cacheinfo', `120000,${link},data/scmdb/linked.json`])
    gitIn(base, ['update-index', '--add', '--cacheinfo', `160000,${'c'.repeat(40)},data/scmdb/submodule`])
    gitIn(base, ['commit', '-q', '-m', 'mirror'])
    const loaded = loadGitRef('HEAD', { cwd: base })
    assert.deepEqual(loaded.unreadable.map(item => [item.name, item.reason]).sort(), [['linked.json', 'SYMLINK'], ['submodule', 'SUBMODULE']])
    assert.equal(precheckLoaded(loaded, loaded).result, 'HELD_FOR_REVIEW')
  })
})

test('git ref: readable cases are unchanged (regression)', async () => {
  await withTempMirrors(async base => {
    await writeMirror(path.join(base, 'data', 'scmdb'), makeMirror())
    gitIn(base, ['init', '-q'])
    gitIn(base, ['add', '-A'])
    gitIn(base, ['commit', '-q', '-m', 'mirror'])
    const loaded = loadGitRef('HEAD', { cwd: base })
    assert.deepEqual(loaded.unreadable, [])
    assert.equal(Object.keys(loaded.files).length, 24)
    assert.equal(precheckLoaded(loaded, loaded).result, 'UNCHANGED')
  })
  // Readable unknown file and absent file keep their existing codes.
  const docs = makeMirror()
  const files = toFiles(docs)
  const unknown = runDomainPrecheck({ baseline: side(docs), candidate: { ...candidateOf(docs), files: { ...files, 'unregistered/x.json': '{}' }, unreadable: [] } })
  assert.ok(unknown.findings.some(finding => finding.code === 'UNREGISTERED_FILE'))
  assert.ok(!unknown.findings.some(finding => finding.code === 'UNREADABLE_FILE'))
  const { 'live/merged': removed, ...rest } = files
  void removed
  const missing = runDomainPrecheck({ baseline: side(docs), candidate: { ...candidateOf(docs), files: rest } })
  assert.ok(missing.findings.some(finding => finding.code === 'MISSING_FILE'))
  assert.ok(!missing.findings.some(finding => finding.code === 'UNREADABLE_FILE'))
})

test('buildRoleMap: entries with null bytes are reported for every kind of name', () => {
  const docs = makeMirror()
  const entries = [
    { name: 'latest.json', bytes: Buffer.from(JSON.stringify(docs.static.latest)) },
    { name: 'merged-4.10.2-live.1000.json', bytes: null },
    { name: 'workflow-state.json', bytes: null, reason: 'READ_FAILED' },
    { name: 'never-heard-of-it.bin', bytes: null },
  ]
  const map = buildRoleMap(entries)
  assert.deepEqual(map.unreadable, [
    { name: 'merged-4.10.2-live.1000.json', reason: 'UNREADABLE' },
    { name: 'workflow-state.json', reason: 'READ_FAILED' },
    { name: 'never-heard-of-it.bin', reason: 'UNREADABLE' },
  ])
  assert.deepEqual(Object.keys(map.files), ['latest'])
})

test('precheck: a malformed unreadable list is itself a hold', () => {
  const docs = makeMirror()
  const output = runDomainPrecheck({ baseline: side(docs), candidate: { ...candidateOf(docs), unreadable: 'x' } })
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  assert.ok(output.findings.some(finding => finding.code === 'UNREADABLE_FILE'))
})

test('directory: a symlink or a file that cannot be read is held, and a subdirectory stays unregistered', { skip: process.platform === 'win32' && 'symlinks need privileges on Windows' }, async () => {
  await withTempMirrors(async base => {
    const dir = path.join(base, 'm')
    await writeMirror(dir, makeMirror())
    await (await import('node:fs/promises')).symlink('latest.json', path.join(dir, 'alias.json'))
    await (await import('node:fs/promises')).mkdir(path.join(dir, 'sub'))
    const loaded = await loadDirectory(dir)
    assert.deepEqual(loaded.unreadable, [{ name: 'alias.json', reason: 'NOT_A_REGULAR_FILE' }])
    assert.ok(Object.hasOwn(loaded.files, 'unregistered/sub/'))
    const output = precheckLoaded(loaded, loaded)
    assert.equal(output.result, 'HELD_FOR_REVIEW')
    assert.ok(unreadableFindings(output).some(finding => finding.file === 'alias.json'))

    // A real read failure (permission) holds too; skipped when the process may read anything.
    if (process.getuid?.() !== 0) {
      const dir2 = path.join(base, 'm2')
      await writeMirror(dir2, makeMirror())
      await (await import('node:fs/promises')).chmod(path.join(dir2, 'mema-cache.json'), 0o000)
      const denied = await loadDirectory(dir2)
      assert.deepEqual(denied.unreadable, [{ name: 'mema-cache.json', reason: 'READ_FAILED' }])
      assert.equal(precheckLoaded(denied, denied).result, 'HELD_FOR_REVIEW')
    }
  })
})

test('CLI: an unreadable entry yields a HELD result, not UNCHANGED and not a crash', { skip: process.platform === 'win32' && 'symlinks need privileges on Windows' }, async () => {
  await withTempMirrors(async base => {
    const dir = path.join(base, 'm')
    await writeMirror(dir, makeMirror())
    await (await import('node:fs/promises')).symlink('latest.json', path.join(dir, 'alias.json'))
    const io = capture()
    assert.equal(await runCli(['--baseline-dir', dir, '--candidate-dir', dir, '--candidate-source-sha', SHA], io), 0, io.chunks.err)
    const output = JSON.parse(io.chunks.out)
    assert.equal(output.result, 'HELD_FOR_REVIEW')
    assert.ok(output.findings.some(finding => finding.code === 'UNREADABLE_FILE' && finding.file === 'alias.json'))
  })
})
