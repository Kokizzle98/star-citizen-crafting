import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { run as runPrecheckCli } from '../scripts/domain-precheck.mjs'
import { buildObservation } from '../scripts/domain-precheck/observation.mjs'
import { runDomainPrecheck } from '../scripts/domain-precheck/precheck.mjs'
import {
  MODE, OBSERVATION_FILE, OUTCOME, SYNC_BRANCH, appendObservation, buildCommitMessage, buildPrBody, buildPrTitle,
  buildObservationCommitMessage, buildSummary, decide, isAppendOnly, observationLines, resolveMode, run as runDecideCli,
} from '../scripts/scmdb-sync/decide.mjs'
import { SHA, candidateOf, clone, makeMirror, rebuild, side } from './domain-precheck-fixture.mjs'

// MIRROR-WORKFLOW-V2: decision logic, observation record and text builders (pure functions).

const OBSERVED_AT = '2026-11-19T03:17:00.000Z'
const RETRIEVED_AT = '2026-11-19T03:16:00.000Z'

/** What scripts/domain-precheck.mjs prints with --emit json, built from fixtures. */
function precheckOutput(baselineDocs, candidateDocs, { baseline = {}, candidate = {} } = {}) {
  const result = runDomainPrecheck({
    baseline: { ...side(baselineDocs), ...baseline },
    candidate: candidateOf(candidateDocs, { sourceExport: { upstreamCommitSha: SHA, retrievedAt: RETRIEVED_AT }, ...candidate }),
  })
  return { ...result, versions_source: 'defaulted', observation: buildObservation(result, { observedAt: OBSERVED_AT }) }
}

const unchanged = () => { const docs = makeMirror(); return precheckOutput(docs, docs) }
const liveChanged = () => {
  const before = makeMirror()
  const after = rebuild(before, 'live', 2000)
  after.channels.live.crafting_blueprints.resources.reverse()
  return precheckOutput(before, after)
}
const held = () => {
  const docs = makeMirror()
  return precheckOutput(docs, docs, { candidate: { sourceExport: { retrievedAt: RETRIEVED_AT } } }) // no commit SHA
}

// --- mode ---------------------------------------------------------------------------------------

test('mode: dry-run is the default, only the exact value publish publishes, the input can force dry-run', () => {
  assert.deepEqual(resolveMode({}), { mode: MODE.DRY_RUN, reason: 'VARIABLE_UNSET_DEFAULT' })
  assert.equal(resolveMode({ variable: '', forceDryRun: '' }).mode, MODE.DRY_RUN)
  assert.equal(resolveMode({ variable: 'dry-run' }).mode, MODE.DRY_RUN)
  assert.equal(resolveMode({ variable: 'publish', forceDryRun: '' }).mode, MODE.PUBLISH)
  assert.equal(resolveMode({ variable: ' publish ', forceDryRun: 'false' }).mode, MODE.PUBLISH)
  for (const unknown of ['Publish', 'PUBLISH', 'true', 'yes', 'publish-now', 'prod']) {
    assert.deepEqual(resolveMode({ variable: unknown }), { mode: MODE.DRY_RUN, reason: 'VARIABLE_UNRECOGNIZED_DEFAULT' }, unknown)
  }
  assert.deepEqual(resolveMode({ variable: 'publish', forceDryRun: 'true' }), { mode: MODE.DRY_RUN, reason: 'FORCED_BY_INPUT' })
  assert.equal(resolveMode({ variable: 'publish', forceDryRun: true }).mode, MODE.DRY_RUN)
  assert.equal(resolveMode({ variable: 'publish', forceDryRun: ' TRUE ' }).mode, MODE.DRY_RUN)
})

// --- outcomes -----------------------------------------------------------------------------------

test('every domain UNCHANGED: OBSERVE, no changed channel', () => {
  const decision = decide(unchanged())
  assert.equal(decision.outcome, OUTCOME.OBSERVE)
  assert.deepEqual(decision.reasons, [])
  assert.deepEqual(decision.changed_channels, [])
  assert.equal(decision.counts.CHANGED, 0)
  assert.equal(decision.counts.HELD_FOR_REVIEW, 0)
  assert.ok(decision.counts.UNCHANGED > 0)
})

test('a new CIG build without domain change is still OBSERVE (38.1)', () => {
  const before = makeMirror()
  const decision = decide(precheckOutput(before, rebuild(before, 'live', 2000)))
  assert.equal(decision.outcome, OUTCOME.OBSERVE)
})

test('a changed domain and no hold: PUBLISH with the identity of the changed channel only', () => {
  const output = liveChanged()
  const decision = decide(output)
  assert.equal(decision.outcome, OUTCOME.PUBLISH)
  assert.deepEqual(decision.reasons, [])
  assert.equal(decision.changed_channels.length, 1)
  const [live] = decision.changed_channels
  assert.equal(live.channel, 'LIVE')
  assert.equal(live.build, output.channels.LIVE.build)
  assert.equal(live.semantic_version, output.channels.LIVE.semantic_version)
  assert.equal(live.cig_build, output.channels.LIVE.cig_build)
  assert.equal(live.baseline_build, '4.10.2-live.1000')
  assert.ok(decision.counts.CHANGED > 0 && decision.counts.UNCHANGED > 0, 'mixed results inside one run')
})

test('a missing upstream commit SHA is HELD, even when every file is byte-identical', () => {
  const output = held()
  const decision = decide(output)
  assert.equal(decision.outcome, OUTCOME.HELD)
  assert.ok(decision.reasons.some(reason => reason.code === 'SOURCE_SHA_MISSING'))
  assert.ok(decision.counts.HELD_FOR_REVIEW > 0)
  assert.equal(decision.counts.UNCHANGED, 0)
})

test('an unreadable file is HELD, even with unchanged registered files and a valid SHA', () => {
  const docs = makeMirror()
  const baselineSide = precheckOutput(docs, docs, { baseline: { unreadable: [{ name: 'notes.txt', reason: 'OBJECT_UNAVAILABLE' }] } })
  const candidateSide = precheckOutput(docs, docs, { candidate: { unreadable: [{ name: 'link.json', reason: 'SYMLINK' }] } })
  for (const output of [baselineSide, candidateSide]) {
    assert.equal(decide(output).outcome, OUTCOME.HELD)
    assert.ok(output.findings.some(finding => finding.code === 'UNREADABLE_FILE'))
  }
  assert.equal(decide(unchanged()).outcome, OUTCOME.OBSERVE, 'the same tree without the unreadable entry is OBSERVE')
})

test('mixed results: a HELD domain wins over CHANGED domains, also across channels', () => {
  const before = makeMirror()
  const after = clone(before)
  after.channels.live.crafting_blueprints.resources.reverse()
  after.channels.ptu.crafting_blueprints.version = 'garbled' // PTU document disagrees with latest.json
  const output = precheckOutput(before, after)
  const results = Object.values(output.channels).flatMap(channel => channel.domains.map(entry => entry.result))
  assert.ok(results.includes('CHANGED') && results.includes('HELD_FOR_REVIEW'))
  const decision = decide(output)
  assert.equal(decision.outcome, OUTCOME.HELD)
  assert.deepEqual(decision.changed_channels, [], 'no identity is offered for a mirror commit while a hold exists')
  assert.ok(decision.reasons.some(reason => reason.code === 'DOMAIN_HELD'))
})

test('fail closed on anything it cannot read', () => {
  const good = unchanged()
  const cases = {
    null: null,
    string: 'UNCHANGED',
    'no channels': { ...good, channels: {} },
    'no channels object': { ...good, channels: undefined },
    'channel without domains': { ...good, channels: { LIVE: { channel: 'LIVE', domains: [] } } },
    'unknown domain result': (() => { const copy = clone(good); copy.channels.LIVE.domains[0].result = 'OK'; return copy })(),
    'lower-case result': (() => { const copy = clone(good); copy.channels.LIVE.domains[0].result = 'unchanged'; return copy })(),
    'unknown top-level result': { ...good, result: 'MAYBE' },
    'no findings list': { ...good, findings: undefined },
    'a finding without any domain hold': { ...good, findings: [{ scope: 'GLOBAL', code: 'MISSING_FILE' }] },
    'no revision': { ...good, source_export_revision: undefined },
    'short SHA': { ...good, source_export_revision: { ...good.source_export_revision, upstream_commit_sha: 'abc123' } },
    'top-level HELD with unchanged domains': { ...good, result: 'HELD_FOR_REVIEW' },
  }
  for (const [label, input] of Object.entries(cases)) {
    assert.equal(decide(input).outcome, OUTCOME.HELD, label)
  }
})

test('an independent channel does not hide a change: LIVE unchanged, PTU changed is PUBLISH for PTU only', () => {
  const before = makeMirror()
  const after = rebuild(before, 'ptu', 3000)
  after.channels.ptu.crafting_blueprints.resources.reverse()
  const decision = decide(precheckOutput(before, after))
  assert.equal(decision.outcome, OUTCOME.PUBLISH)
  assert.deepEqual(decision.changed_channels.map(channel => channel.channel), ['PTU'])
})

// --- observation record -------------------------------------------------------------------------

test('observation lines: revision record first, then one entry per channel and domain; HELD runs record too', () => {
  for (const output of [unchanged(), liveChanged(), held()]) {
    const lines = observationLines(output).trimEnd().split('\n').map(line => JSON.parse(line))
    const domainCount = Object.values(output.channels).reduce((sum, channel) => sum + channel.domains.length, 0)
    const withRevision = output.source_export_revision.upstream_commit_sha !== null
    assert.equal(lines.length, domainCount + (withRevision ? 1 : 0))
    assert.equal(lines[0].record_type, withRevision ? 'source_export_revision' : 'domain_observation')
    assert.ok(lines.slice(withRevision ? 1 : 0).every(line => line.record_type === 'domain_observation' && line.observed_at === OBSERVED_AT))
  }
  const heldLines = observationLines(held()).trimEnd().split('\n').map(line => JSON.parse(line))
  assert.ok(heldLines.every(line => line.result === 'HELD_FOR_REVIEW'))
  const revision = JSON.parse(observationLines(unchanged()).split('\n')[0])
  assert.equal(revision.upstream_commit_sha, SHA)
  assert.equal(revision.retrieved_at, RETRIEVED_AT)
})

test('observation lines refuse a precheck that does not carry a matching observation', () => {
  const output = unchanged()
  assert.throws(() => observationLines({ ...output, observation: undefined }), /OBSERVATION_MISSING/)
  assert.throws(() => observationLines({ ...output, observation: { ...output.observation, entries: output.observation.entries.slice(1) } }), /ENTRY_COUNT_MISMATCH/)
  assert.throws(() => observationLines({ ...output, observation: { ...output.observation, source_export_revision_record: null } }), /REVISION_RECORD_MISMATCH/)
})

test('the record only ever grows: appending keeps the existing text byte for byte', () => {
  const first = observationLines(unchanged())
  const second = observationLines(liveChanged())
  const afterFirst = appendObservation('', first)
  const afterSecond = appendObservation(afterFirst, second)
  assert.equal(afterFirst, first)
  assert.ok(afterSecond.startsWith(afterFirst))
  assert.equal(afterSecond, first + second)
  assert.ok(isAppendOnly(afterFirst, afterSecond))
  assert.ok(isAppendOnly('', afterFirst))
  assert.equal(isAppendOnly(afterSecond, afterFirst), false, 'a shortened record is not append-only')
  assert.equal(isAppendOnly(afterFirst, afterFirst.replace('LIVE', 'PTU')), false, 'an edited record is not append-only')
  assert.throws(() => appendObservation('{"record_type":"x"}', first), /NOT_NEWLINE_TERMINATED/)
  assert.throws(() => appendObservation('', ''), /LINES_INVALID/)
  assert.throws(() => appendObservation('', '{"a":1}\n'), /LINES_INVALID/)
  assert.throws(() => appendObservation('', 'not json\n'))
})

// --- text ---------------------------------------------------------------------------------------

test('pull request text: identity per changed channel, result per domain, review notice, no auto-merge', () => {
  const output = liveChanged()
  const decision = decide(output)
  const body = buildPrBody(decision, output, { runUrl: 'https://github.com/example/repo/actions/runs/1' })
  const live = output.channels.LIVE
  assert.ok(body.includes(`| LIVE | ${live.semantic_version} | ${live.cig_build} | ${live.build} | 4.10.2-live.1000 |`))
  assert.ok(body.includes(`\`${SHA}\``), 'full upstream commit SHA')
  assert.ok(body.includes('KrovaxCode/SCMDB_DATA'))
  assert.ok(!body.includes('| PTU | 4.10.3 |'), 'the unchanged channel is not listed as changed')
  for (const channel of Object.values(output.channels)) {
    for (const entry of channel.domains) assert.ok(body.includes(`| ${channel.channel} | ${entry.domain} | ${entry.result} |`), `${channel.channel}/${entry.domain}`)
  }
  assert.match(body, /No auto-merge\. Owner review required\./)
  assert.match(body, /close it and reopen it once/)
  assert.ok(body.includes(OBSERVATION_FILE))
  assert.ok(body.includes('actions/runs/1'))
  assert.doesNotMatch(body, /gh pr merge|--auto|automerge/i)
  assert.equal(body.includes(RETRIEVED_AT), true)
})

test('pull request text is built for PUBLISH only', () => {
  for (const output of [unchanged(), held()]) assert.throws(() => buildPrBody(decide(output), output), /PR_BODY_ONLY_FOR_PUBLISH/)
})

test('commit messages and title name identity and upstream commit', () => {
  const output = liveChanged()
  const decision = decide(output)
  const message = buildCommitMessage(decision, output)
  assert.match(message.split('\n')[0], new RegExp(`^chore\\(scmdb-sync\\): mirror SCMDB export ${SHA.slice(0, 7)} \\(LIVE ${output.channels.LIVE.build}\\)$`))
  assert.ok(message.includes(SHA))
  assert.match(buildPrTitle(decision), /^chore\(scmdb-sync\): SCMDB mirror update \(LIVE 4\.10\.2-live\.2000\)$/)
  const observe = buildCommitMessage(decide(unchanged()), unchanged())
  assert.match(observe.split('\n')[0], /record unchanged observation aaaaaaa$/)
  assert.match(buildObservationCommitMessage(decision, output).split('\n')[0], /record changed observation aaaaaaa$/)
  assert.ok(buildObservationCommitMessage(decision, output).includes('No mirror change.'))
  assert.match(buildCommitMessage(decide(held()), held()).split('\n')[0], /record held observation unknown$/)
})

test('summary: mode, outcome, results, reasons and what a dry run does not do', () => {
  const output = held()
  const summary = buildSummary(decide(output), output, { mode: MODE.DRY_RUN, modeReason: 'VARIABLE_UNSET_DEFAULT' })
  assert.match(summary, /Mode: `dry-run` \(VARIABLE_UNSET_DEFAULT\)/)
  assert.match(summary, /Outcome: \*\*HELD\*\*/)
  assert.match(summary, /SOURCE_SHA_MISSING/)
  assert.match(summary, /DRY-RUN: nothing is pushed and no pull request is created/)
  assert.match(summary, /then fail the job/)
  const published = liveChanged()
  const publishSummary = buildSummary(decide(published), published, { mode: MODE.PUBLISH })
  assert.match(publishSummary, /Publish run: commit the mirror change/)
  assert.ok(publishSummary.includes(SYNC_BRANCH))
  assert.doesNotMatch(publishSummary, /DRY-RUN/)
  // A malformed precheck still yields a summary instead of crashing.
  assert.match(buildSummary(decide(null), null, { mode: MODE.DRY_RUN }), /Outcome: \*\*HELD\*\*/)
})

// --- CLI, end to end with the real precheck CLI and the complete loader result ------------------

const capture = () => {
  const chunks = { out: '', err: '' }
  return { chunks, stdout: { write: value => { chunks.out += value } }, stderr: { write: value => { chunks.err += value } } }
}
const STATIC_NAMES = {
  latest: 'latest.json', game_versions: 'game-versions.json', versions: 'versions.json', changelog: 'changelog.json',
  deltas_live: 'deltas-live.json', deltas_ptu: 'deltas-ptu.json', local_mirror_manifest: 'local-mirror-manifest.json',
  mema_cache: 'mema-cache.json', workflow_state: 'workflow-state.json', site_settings: 'site-settings.json',
}
async function writeMirror(directory, docs) {
  await mkdir(directory, { recursive: true })
  for (const [role, doc] of Object.entries(docs.static)) await writeFile(path.join(directory, STATIC_NAMES[role]), JSON.stringify(doc))
  for (const channel of ['live', 'ptu']) {
    for (const [role, name] of Object.entries(docs.static.latest.channels[channel].files)) await writeFile(path.join(directory, name), JSON.stringify(docs.channels[channel][role]))
  }
}
async function withTemp(callback) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'scmdb-sync-'))
  try { return await callback(base) } finally { await rm(base, { recursive: true, force: true }) }
}
async function precheckViaCli(base, baselineDocs, candidateDocs, { sha = SHA, mutateCandidate } = {}) {
  await writeMirror(path.join(base, 'baseline'), baselineDocs)
  await writeMirror(path.join(base, 'candidate'), candidateDocs)
  await mutateCandidate?.(path.join(base, 'candidate'))
  const io = capture()
  const args = ['--baseline-dir', path.join(base, 'baseline'), '--candidate-dir', path.join(base, 'candidate'), '--source-retrieved-at', RETRIEVED_AT, '--observed-at', OBSERVED_AT]
  if (sha) args.push('--candidate-source-sha', sha)
  assert.equal(await runPrecheckCli(args, io), 0, io.chunks.err)
  const file = path.join(base, 'precheck.json')
  await writeFile(file, io.chunks.out)
  return file
}
const decideCli = async (file, base, mode = 'dry-run') => {
  const io = capture()
  const code = await runDecideCli(['decide', '--precheck', file, '--mode', mode, '--out-dir', path.join(base, 'out')], io)
  return { code, out: io.chunks.out, err: io.chunks.err }
}

test('CLI: OBSERVE writes the decision, observation lines, summary and commit message, no pull request files', async () => {
  await withTemp(async base => {
    const docs = makeMirror()
    const result = await decideCli(await precheckViaCli(base, docs, docs), base)
    assert.equal(result.code, 0, result.err)
    assert.equal(result.out, 'outcome=OBSERVE\n')
    assert.deepEqual((await readdir(path.join(base, 'out'))).sort(), ['commit-message.txt', 'decision.json', 'observation-commit-message.txt', 'observation-lines.jsonl', 'summary.md'])
    const lines = (await readFile(path.join(base, 'out', 'observation-lines.jsonl'), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line))
    assert.equal(lines[0].record_type, 'source_export_revision')
    assert.equal(lines[0].upstream_commit_sha, SHA)
    assert.ok(Object.keys(lines[0].raw_file_hashes).includes('latest.json'), 'hash map is keyed by the real file names')
  })
})

test('CLI: PUBLISH adds the pull request title and body', async () => {
  await withTemp(async base => {
    const before = makeMirror()
    const after = rebuild(before, 'live', 2000)
    after.channels.live.crafting_blueprints.resources.reverse()
    const result = await decideCli(await precheckViaCli(base, before, after), base, 'publish')
    assert.equal(result.out, 'outcome=PUBLISH\n')
    assert.ok((await readdir(path.join(base, 'out'))).includes('pr-body.md'))
    assert.match(await readFile(path.join(base, 'out', 'pr-body.md'), 'utf8'), /No auto-merge\. Owner review required\./)
    assert.match(await readFile(path.join(base, 'out', 'pr-title.txt'), 'utf8'), /LIVE 4\.10\.2-live\.2000/)
  })
})

test('CLI: without a commit SHA the run is HELD and still produces observation lines', async () => {
  await withTemp(async base => {
    const docs = makeMirror()
    const result = await decideCli(await precheckViaCli(base, docs, docs, { sha: null }), base)
    assert.equal(result.code, 0, 'HELD is a result, the workflow fails the job afterwards')
    assert.equal(result.out, 'outcome=HELD\n')
    const lines = (await readFile(path.join(base, 'out', 'observation-lines.jsonl'), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line))
    assert.ok(lines.every(line => line.result === 'HELD_FOR_REVIEW'))
  })
})

test('CLI: the complete loader result is used, a symlink in the candidate directory holds the run', async () => {
  await withTemp(async base => {
    const docs = makeMirror()
    const file = await precheckViaCli(base, docs, docs, {
      mutateCandidate: async directory => { await symlink('latest.json', path.join(directory, 'linked.json')) },
    })
    const precheck = JSON.parse(await readFile(file, 'utf8'))
    assert.ok(precheck.findings.some(finding => finding.code === 'UNREADABLE_FILE' && finding.file === 'linked.json'))
    assert.equal((await decideCli(file, base)).out, 'outcome=HELD\n')
  })
})

test('CLI: usage errors and unknown input exit with 2 and write nothing', async () => {
  await withTemp(async base => {
    for (const argv of [[], ['nope'], ['decide'], ['decide', '--precheck', 'x', '--out-dir', base, '--mode', 'push'], ['mode', '--bogus', '1'], ['decide', '--precheck', path.join(base, 'missing.json'), '--out-dir', base, '--mode', 'dry-run']]) {
      const io = capture()
      assert.equal(await runDecideCli(argv, io), 2, JSON.stringify(argv))
    }
    const io = capture()
    assert.equal(await runDecideCli(['mode', '--variable', 'publish', '--force-dry-run', ''], io), 0)
    assert.equal(io.chunks.out, 'mode=publish\nmode_reason=VARIABLE_PUBLISH\n')
  })
})

test('CLI append: creates the record, keeps existing text, refuses a record that is not newline-terminated', async () => {
  await withTemp(async base => {
    const record = path.join(base, 'nested', 'observations.jsonl')
    const first = path.join(base, 'first.jsonl')
    const second = path.join(base, 'second.jsonl')
    await writeFile(first, observationLines(unchanged()))
    await writeFile(second, observationLines(liveChanged()))
    assert.equal(await runDecideCli(['append', '--file', record, '--lines', first], capture()), 0)
    assert.equal(await readFile(record, 'utf8'), observationLines(unchanged()))
    assert.equal(await runDecideCli(['append', '--file', record, '--lines', second], capture()), 0)
    assert.equal(await readFile(record, 'utf8'), observationLines(unchanged()) + observationLines(liveChanged()))
    await writeFile(record, '{"record_type":"x"}')
    const io = capture()
    assert.equal(await runDecideCli(['append', '--file', record, '--lines', second], io), 2)
    assert.equal(await readFile(record, 'utf8'), '{"record_type":"x"}', 'a refused append leaves the record untouched')
    assert.equal(await runDecideCli(['append', '--file', record], capture()), 2)
  })
})
