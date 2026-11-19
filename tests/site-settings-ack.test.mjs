import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { run as runPrecheckCli } from '../scripts/domain-precheck.mjs'
import { buildObservation } from '../scripts/domain-precheck/observation.mjs'
import { INFORMATIONAL_FINDING_CODES, runDomainPrecheck, siteSettingsChangeHash } from '../scripts/domain-precheck/precheck.mjs'
import {
  OUTCOME, buildPrBody, buildSummary, decide, observationLines, run as runDecideCli,
} from '../scripts/scmdb-sync/decide.mjs'
import { SHA, candidateOf, makeMirror, rebuild, side, toFiles } from './domain-precheck-fixture.mjs'

// Reviewed acknowledgement of a site-settings change (DATASET_PIPELINE_V1.md 36.2, owner decision 19).

const RETRIEVED_AT = '2026-11-19T03:16:00.000Z'
const OBSERVED_AT = '2026-11-19T03:17:00.000Z'
const flipScenario = doc => { doc.scenario_overrides.live.A = false }

/** Candidate whose site settings were changed by `mutate`; the rest is the unchanged mirror. */
function run(mutate, { accept, content } = {}) {
  const before = makeMirror()
  const after = content ? content(before) : structuredClone(before)
  if (mutate) mutate(after.static.site_settings)
  return runDomainPrecheck({
    baseline: side(before),
    candidate: candidateOf(after, { sourceExport: { upstreamCommitSha: SHA, retrievedAt: RETRIEVED_AT } }),
    acceptSiteSettingsChange: accept,
  })
}
const finding = (output, code) => output.findings.find(entry => entry.code === code)
const hashOf = mutate => finding(run(mutate), 'SITE_SETTINGS_CHANGED').change_hash
const codesOf = output => output.findings.map(entry => entry.code)

// --- change_hash ------------------------------------------------------------------------------

test('change_hash: SHA-256 hex of the canonical array of changed keys with before/after, sorted by key', () => {
  const output = run(flipScenario)
  const entry = finding(output, 'SITE_SETTINGS_CHANGED')
  assert.deepEqual(entry.keys, ['scenario_overrides'])
  assert.match(entry.change_hash, /^[0-9a-f]{64}$/)
  const expected = siteSettingsChangeHash([{
    key: 'scenario_overrides',
    before: { live: { A: true }, ptu: { A: false } },
    after: { live: { A: false }, ptu: { A: false } },
  }])
  assert.equal(entry.change_hash, expected)
  assert.deepEqual(entry.changes, [{
    key: 'scenario_overrides',
    before: '{"live":{"A":true},"ptu":{"A":false}}',
    after: '{"live":{"A":false},"ptu":{"A":false}}',
  }])
})

test('change_hash: stable and independent of key order and of the order of the changes', () => {
  const two = doc => { doc.ptu_enabled = false; flipScenario(doc) }
  const first = hashOf(two)
  assert.equal(hashOf(two), first, 'repeatable')
  const reversed = run(null, {
    content: before => {
      const after = structuredClone(before)
      after.static.site_settings = Object.fromEntries(Object.entries(after.static.site_settings).reverse())
      two(after.static.site_settings)
      after.static.site_settings.scenario_overrides = { ptu: { A: false }, live: { A: false } }
      return after
    },
  })
  assert.equal(finding(reversed, 'SITE_SETTINGS_CHANGED').change_hash, first)
  assert.deepEqual(finding(reversed, 'SITE_SETTINGS_CHANGED').keys, ['ptu_enabled', 'scenario_overrides'])
})

test('change_hash: another change gives another hash; absent is not null; non-trigger keys never take part', () => {
  const base = hashOf(flipScenario)
  assert.notEqual(hashOf(doc => { doc.scenario_overrides.live.A = false; doc.scenario_overrides.ptu.A = true }), base)
  assert.notEqual(hashOf(doc => { doc.ptu_enabled = false }), base)
  assert.notEqual(hashOf(doc => { delete doc.mema_enabled }), hashOf(doc => { doc.mema_enabled = null }))
  const withNonTrigger = hashOf(doc => {
    flipScenario(doc)
    doc.updated_at = '2031-01-01T00:00:00Z'
    doc.mema_cache_last_refreshed = '2031-01-01T00:00:00Z'
  })
  assert.equal(withNonTrigger, base, 'a non-trigger change does not alter the hash')
})

test('finding values are bounded; the hash still covers the full value', () => {
  const big = 'x'.repeat(5000)
  const output = run(doc => { doc.big_note = big })
  const entry = finding(output, 'SITE_SETTINGS_CHANGED')
  const row = entry.changes.find(change => change.key === 'big_note')
  assert.equal(row.before, '(absent)')
  assert.ok(row.after.length < 400 && row.after.includes('[truncated, 5002 characters]'))
  const other = hashOf(doc => { doc.big_note = `${big}y` })
  assert.notEqual(entry.change_hash, other)
})

// --- acknowledgement --------------------------------------------------------------------------

test('no hash: unchanged behaviour, including scenario_overrides true -> false (regression)', () => {
  const output = run(flipScenario)
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  assert.ok(codesOf(output).includes('SITE_SETTINGS_CHANGED'))
  assert.ok(!codesOf(output).some(code => code === 'SITE_SETTINGS_CHANGE_ACCEPTED' || code === 'SITE_SETTINGS_ACK_MISMATCH'))
  assert.deepEqual(output.acknowledgements, [])
  for (const accept of [undefined, null, '']) assert.equal(run(flipScenario, { accept }).result, 'HELD_FOR_REVIEW')
  assert.equal(run(null).result, 'UNCHANGED')
  assert.equal(run(doc => { doc.updated_at = 'x'; doc.mema_cache_last_refreshed = 'y' }).result, 'UNCHANGED')
})

test('right hash: SITE_SETTINGS_CHANGED is replaced by the informational ACCEPTED finding and nothing is held', () => {
  const hash = hashOf(flipScenario)
  const output = run(flipScenario, { accept: hash })
  assert.deepEqual(output.findings, [{ scope: 'GLOBAL', code: 'SITE_SETTINGS_CHANGE_ACCEPTED', keys: ['scenario_overrides'], change_hash: hash }])
  assert.deepEqual(output.acknowledgements, [{ code: 'SITE_SETTINGS_CHANGE_ACCEPTED', change_hash: hash, keys: ['scenario_overrides'] }])
  assert.equal(output.result, 'UNCHANGED')
  for (const channel of Object.values(output.channels)) {
    for (const domain of channel.domains) assert.deepEqual(domain.reasons, [])
  }
  assert.deepEqual(INFORMATIONAL_FINDING_CODES, ['SITE_SETTINGS_CHANGE_ACCEPTED'])
})

test('wrong hash: held, SITE_SETTINGS_CHANGED stays, ACK_MISMATCH names expected and provided', () => {
  const expected = hashOf(flipScenario)
  for (const accept of ['0'.repeat(64), expected.toUpperCase(), expected.slice(1), `${expected}0`, ' x ', 'not-a-hash']) {
    const output = run(flipScenario, { accept })
    assert.equal(output.result, 'HELD_FOR_REVIEW', accept)
    assert.ok(codesOf(output).includes('SITE_SETTINGS_CHANGED'))
    const mismatch = finding(output, 'SITE_SETTINGS_ACK_MISMATCH')
    assert.equal(mismatch.expected, expected)
    assert.equal(mismatch.provided, accept)
    assert.ok(!codesOf(output).includes('SITE_SETTINGS_CHANGE_ACCEPTED'))
    assert.deepEqual(output.acknowledgements, [])
  }
})

test('hash binding: the hash of another change does not release this one', () => {
  const other = hashOf(doc => { doc.ptu_enabled = false })
  const output = run(flipScenario, { accept: other })
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  assert.equal(finding(output, 'SITE_SETTINGS_ACK_MISMATCH').provided, other)
  // A change that grew by one more key needs a new review.
  const grown = run(doc => { flipScenario(doc); doc.ptu_enabled = false }, { accept: hashOf(flipScenario) })
  assert.equal(grown.result, 'HELD_FOR_REVIEW')
})

test('a hash without any site-settings change holds (stale or wrong acknowledgement)', () => {
  const output = run(null, { accept: hashOf(flipScenario) })
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  assert.equal(finding(output, 'SITE_SETTINGS_ACK_MISMATCH').expected, null)
  assert.ok(!codesOf(output).includes('SITE_SETTINGS_CHANGE_ACCEPTED'))
})

test('the acknowledgement releases only the site-settings hold; every other hold stays', () => {
  const hash = hashOf(flipScenario)
  const output = runDomainPrecheck({
    baseline: side(makeMirror()),
    candidate: (() => {
      const docs = makeMirror()
      flipScenario(docs.static.site_settings)
      return candidateOf(docs, { sourceExport: undefined })
    })(),
    acceptSiteSettingsChange: hash,
  })
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  assert.ok(codesOf(output).includes('SOURCE_EXPORT_REVISION_MISSING'))
  assert.ok(codesOf(output).includes('SITE_SETTINGS_CHANGE_ACCEPTED'))
  const broken = run(flipScenario, { accept: hash, content: before => { const after = structuredClone(before); delete after.static.workflow_state; return after } })
  assert.equal(broken.result, 'HELD_FOR_REVIEW')
  assert.ok(codesOf(broken).includes('MISSING_FILE'))
})

// --- decide -----------------------------------------------------------------------------------

function precheckOutput({ accept, mirrorChange = false, mutate = flipScenario } = {}) {
  const before = makeMirror()
  let after = structuredClone(before)
  if (mirrorChange) {
    after = rebuild(before, 'live', 2000)
    after.channels.live.crafting_blueprints.resources.reverse()
  }
  mutate(after.static.site_settings)
  const result = runDomainPrecheck({
    baseline: side(before),
    candidate: candidateOf(after, { sourceExport: { upstreamCommitSha: SHA, retrievedAt: RETRIEVED_AT } }),
    acceptSiteSettingsChange: accept,
  })
  return { ...result, versions_source: 'defaulted', observation: buildObservation(result, { observedAt: OBSERVED_AT }) }
}
const acceptedHash = () => hashOf(flipScenario)

test('decide: without acknowledgement the site-settings hold is HELD (regression)', () => {
  const decision = decide(precheckOutput())
  assert.equal(decision.outcome, OUTCOME.HELD)
  assert.deepEqual(decision.acknowledgements, [])
})

test('decide: ACCEPTED does not hold; OBSERVE and PUBLISH carry the acknowledgement', () => {
  const observe = decide(precheckOutput({ accept: acceptedHash() }))
  assert.equal(observe.outcome, OUTCOME.OBSERVE)
  assert.deepEqual(observe.acknowledgements, [{ change_hash: acceptedHash(), keys: ['scenario_overrides'] }])
  const publish = decide(precheckOutput({ accept: acceptedHash(), mirrorChange: true }))
  assert.equal(publish.outcome, OUTCOME.PUBLISH)
  assert.deepEqual(publish.acknowledgements, observe.acknowledgements)
})

test('decide: every other finding still holds, next to an ACCEPTED one', () => {
  const base = precheckOutput({ accept: acceptedHash(), mirrorChange: true })
  assert.equal(decide(base).outcome, OUTCOME.PUBLISH)
  for (const extra of ['SITE_SETTINGS_CHANGED', 'SITE_SETTINGS_ACK_MISMATCH', 'MISSING_FILE', 'UNREGISTERED_FILE', 'SOMETHING_NEW', undefined, null]) {
    const input = structuredClone(base)
    input.findings.push(extra === undefined ? undefined : extra === null ? null : { scope: 'GLOBAL', code: extra })
    const decision = decide(input)
    assert.equal(decision.outcome, OUTCOME.HELD, String(extra))
    assert.ok(decision.reasons.some(reason => reason.code === 'PRECHECK_FINDINGS'), String(extra))
  }
  // Without any ACCEPTED finding a lone other finding holds as before.
  const lone = precheckOutput({ mirrorChange: true, mutate: () => {} })
  lone.findings.push({ scope: 'GLOBAL', code: 'MISSING_FILE' })
  assert.equal(decide(lone).outcome, OUTCOME.HELD)
})

test('decide: an ACCEPTED finding that is malformed, duplicated or scoped elsewhere holds', () => {
  const base = precheckOutput({ accept: acceptedHash() })
  const [accepted] = base.findings
  const variants = {
    'short hash': { ...accepted, change_hash: 'abc' },
    'no keys': { ...accepted, keys: [] },
    'keys not strings': { ...accepted, keys: [1] },
    'channel scope': { ...accepted, scope: 'LIVE' },
  }
  for (const [name, variant] of Object.entries(variants)) {
    assert.equal(decide({ ...base, findings: [variant] }).outcome, OUTCOME.HELD, name)
  }
  assert.equal(decide({ ...base, findings: [accepted, accepted] }).outcome, OUTCOME.HELD, 'duplicate')
})

test('observation lines carry the acknowledgement on every domain entry', () => {
  const ack = { code: 'SITE_SETTINGS_CHANGE_ACCEPTED', change_hash: acceptedHash(), keys: ['scenario_overrides'] }
  const lines = observationLines(precheckOutput({ accept: acceptedHash() })).trimEnd().split('\n').map(line => JSON.parse(line))
  const entries = lines.filter(line => line.record_type === 'domain_observation')
  assert.equal(entries.length, 10)
  for (const entry of entries) assert.deepEqual(entry.acknowledgements, [ack])
  const plain = observationLines(precheckOutput({ mutate: () => {} })).trimEnd().split('\n').map(line => JSON.parse(line))
  for (const entry of plain.filter(line => line.record_type === 'domain_observation')) assert.deepEqual(entry.acknowledgements, [])
})

test('PR text and summary state the acknowledgement; a held run shows keys, before/after, hash and the instruction', () => {
  const hash = acceptedHash()
  const input = precheckOutput({ accept: hash, mirrorChange: true })
  const decision = decide(input)
  assert.match(buildPrBody(decision, input), new RegExp(`site settings change acknowledged by owner, hash \`${hash}\``))
  assert.match(buildSummary(decision, input, { mode: 'dry-run' }), new RegExp(`Site settings change acknowledged by owner, hash \`${hash}\``))
  const noAck = precheckOutput({ mirrorChange: true, mutate: () => {} })
  assert.doesNotMatch(buildPrBody(decide(noAck), noAck), /acknowledged/i)

  const heldInput = precheckOutput()
  const heldSummary = buildSummary(decide(heldInput), heldInput, { mode: 'dry-run' })
  assert.match(heldSummary, /## Site settings change \(held\)/)
  assert.match(heldSummary, /\| `scenario_overrides` \| `\{"live":\{"A":true\},"ptu":\{"A":false\}\}` \| `\{"live":\{"A":false\},"ptu":\{"A":false\}\}` \|/)
  assert.match(heldSummary, new RegExp(`change_hash: \`${hash}\``))
  assert.match(heldSummary, new RegExp(`Review the change, then run the workflow manually with accept_site_settings_change = \`${hash}\``))

  const wrong = precheckOutput({ accept: '0'.repeat(64) })
  const wrongSummary = buildSummary(decide(wrong), wrong, { mode: 'dry-run' })
  assert.match(wrongSummary, new RegExp(`expected \`${hash}\`, provided \`${'0'.repeat(64)}\``))
})

// --- CLI (precheck CLI -> decide CLI, as the workflow chains them) ---------------------------

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
const capture = () => {
  const chunks = { out: '', err: '' }
  return { chunks, stdout: { write: text => { chunks.out += text } }, stderr: { write: text => { chunks.err += text } } }
}

test('CLI: --accept-site-settings-change flows through precheck and decide; empty means none; a wrong value holds', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'ack-'))
  try {
    const before = makeMirror()
    const after = structuredClone(before)
    flipScenario(after.static.site_settings)
    await writeMirror(path.join(base, 'baseline'), before)
    await writeMirror(path.join(base, 'candidate'), after)
    const precheck = async extra => {
      const io = capture()
      const code = await runPrecheckCli(
        ['--baseline-dir', path.join(base, 'baseline'), '--candidate-dir', path.join(base, 'candidate'), '--candidate-source-sha', SHA,
          '--source-retrieved-at', RETRIEVED_AT, '--observed-at', OBSERVED_AT, ...extra],
        io,
      )
      return { code, ...io.chunks }
    }
    const decideOf = async precheckText => {
      const file = path.join(base, 'precheck.json')
      await writeFile(file, precheckText)
      const io = capture()
      const code = await runDecideCli(['decide', '--precheck', file, '--mode', 'dry-run', '--out-dir', path.join(base, 'out')], io)
      assert.equal(code, 0, io.chunks.err)
      return io.chunks.out.trim()
    }

    const first = await precheck([])
    assert.equal(first.code, 0, first.err)
    const hash = JSON.parse(first.out).findings.find(entry => entry.code === 'SITE_SETTINGS_CHANGED').change_hash
    assert.equal(hash, acceptedHash())
    assert.equal(await decideOf(first.out), 'outcome=HELD')
    assert.match(await readFile(path.join(base, 'out', 'summary.md'), 'utf8'), new RegExp(`accept_site_settings_change = \`${hash}\``))

    const accepted = await precheck(['--accept-site-settings-change', hash])
    assert.equal(accepted.code, 0, accepted.err)
    assert.equal(await decideOf(accepted.out), 'outcome=OBSERVE')
    const lines = (await readFile(path.join(base, 'out', 'observation-lines.jsonl'), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line))
    assert.ok(lines.filter(line => line.record_type === 'domain_observation').every(line => line.acknowledgements[0]?.change_hash === hash))

    const empty = await precheck(['--accept-site-settings-change', ''])
    assert.equal(await decideOf(empty.out), 'outcome=HELD')

    const wrong = await precheck(['--accept-site-settings-change', '0'.repeat(64)])
    assert.equal(wrong.code, 0, wrong.err)
    assert.equal(await decideOf(wrong.out), 'outcome=HELD')
    assert.ok(JSON.parse(wrong.out).findings.some(entry => entry.code === 'SITE_SETTINGS_ACK_MISMATCH'))
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
