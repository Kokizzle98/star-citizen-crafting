import assert from 'node:assert/strict'
import test from 'node:test'
import { runDomainPrecheck } from '../scripts/domain-precheck/precheck.mjs'
import {
  OTHER_SHA, SHA, VERSIONS, candidateOf, clone, domainResult, makeMirror, side,
} from './domain-precheck-fixture.mjs'

// Every fail-closed condition of DATASET_PIPELINE_V1.md 37.4 yields HELD_FOR_REVIEW,
// never UNCHANGED, and creates no comparison key for the held domain.

const LIVE_DOMAINS = ['BLUEPRINT_CATALOG', 'REWARD_SOURCES', 'LOCATIONS', 'FABRICATOR', 'MATERIAL_UNITS', 'LEGACY_FRONTEND']
const PTU_DOMAINS = ['BLUEPRINT_CATALOG', 'REWARD_SOURCES', 'LOCATIONS', 'LEGACY_FRONTEND']

/** Runs with an unchanged mirror, after `mutate` changed the candidate files / input. */
function heldRun(mutate, { baselineMutate } = {}) {
  const docs = makeMirror()
  const baseline = side(docs)
  const candidate = candidateOf(docs)
  baselineMutate?.(baseline)
  mutate?.(candidate, docs)
  return runDomainPrecheck({ baseline, candidate })
}
const allCodes = (output, channel, domain) => domainResult(output, channel, domain).reasons.map(reason => reason.code)
const findingCodes = output => output.findings.map(finding => finding.code)

function assertHeld(output, { live = LIVE_DOMAINS, ptu = PTU_DOMAINS, code } = {}) {
  for (const [channel, names] of [['LIVE', live], ['PTU', ptu]]) {
    for (const name of names) {
      const entry = domainResult(output, channel, name)
      assert.equal(entry.result, 'HELD_FOR_REVIEW', `${channel}/${name}`)
      assert.equal(entry.comparison_key, null, `${channel}/${name} has no comparison key when held`)
      if (code) assert.ok(allCodes(output, channel, name).includes(code), `${channel}/${name} reasons carry ${code}`)
    }
  }
  assert.equal(output.result, 'HELD_FOR_REVIEW')
}
const setFile = (candidate, key, mutate) => {
  const parsed = JSON.parse(candidate.files[key])
  mutate(parsed)
  candidate.files[key] = JSON.stringify(parsed)
}

test('the baseline run without a defect is not held (control)', () => {
  const output = heldRun()
  assert.equal(output.result, 'UNCHANGED')
})

test('upstream commit SHA unavailable: HELD, and no Source Export Revision is recorded (33.2 rule 4)', () => {
  for (const sourceExport of [undefined, {}, { upstreamCommitSha: '' }, { upstreamCommitSha: 'abc123' }, { upstreamCommitSha: SHA.toUpperCase() }, { upstreamCommitSha: `${SHA}0` }]) {
    const output = heldRun(candidate => { candidate.sourceExport = sourceExport })
    assertHeld(output)
    assert.ok(findingCodes(output).includes('SOURCE_EXPORT_REVISION_MISSING'))
    assert.equal(output.source_export_revision.upstream_commit_sha, null)
    assert.equal(output.source_export_revision_digest, null)
  }
  // Content hashes alone never replace the commit SHA.
  const hashesOnly = heldRun(candidate => { candidate.sourceExport = { rawFileHashes: {} } })
  assertHeld(hashesOnly)
})

test('a recorded Source Export Revision carries the SHA and the raw hash of every file', () => {
  const output = heldRun()
  assert.equal(output.source_export_revision.upstream_commit_sha, SHA)
  assert.equal(Object.keys(output.source_export_revision.raw_file_hashes).length, 24)
  assert.match(output.source_export_revision_digest, /^[0-9a-f]{64}$/)
  const other = heldRun(candidate => { candidate.sourceExport = { upstreamCommitSha: OTHER_SHA } })
  assert.notEqual(other.source_export_revision_digest, output.source_export_revision_digest)
})

test('supplied raw hashes that disagree with the bytes are HELD', () => {
  const output = heldRun(candidate => { candidate.sourceExport = { upstreamCommitSha: SHA, rawFileHashes: { latest: '0'.repeat(64) } } })
  assertHeld(output)
  assert.ok(findingCodes(output).includes('RAW_HASH_MISMATCH'))
})

test('missing required file: domain file, evidence file, static file, either side', () => {
  for (const key of ['live/crafting_blueprints', 'live/merged', 'ptu/crafting_items']) {
    const output = heldRun(candidate => { delete candidate.files[key] })
    const channel = key.startsWith('live') ? 'LIVE' : 'PTU'
    assert.ok(output.channels[channel].domains.some(entry => entry.result === 'HELD_FOR_REVIEW'))
    assert.ok(output.channels[channel].domains.every(entry => entry.result !== 'UNCHANGED'), `${key}: nothing in the channel is UNCHANGED`)
    assert.equal(output.result, 'HELD_FOR_REVIEW')
  }
  for (const key of ['live/mining_data', 'live/cig_data_issues', 'ptu/mission_history']) {
    const output = heldRun(candidate => { delete candidate.files[key] })
    assert.equal(output.result, 'HELD_FOR_REVIEW', key)
    assert.ok(output.findings.some(finding => finding.code === 'MISSING_FILE' && finding.role === key))
  }
  for (const key of ['mema_cache', 'workflow_state', 'local_mirror_manifest', 'site_settings', 'changelog', 'deltas_live', 'versions']) {
    const output = heldRun(candidate => { delete candidate.files[key] })
    assertHeld(output)
    assert.ok(findingCodes(output).includes('MISSING_FILE'), key)
    const base = heldRun(null, { baselineMutate: baseline => { delete baseline.files[key] } })
    assertHeld(base)
  }
  const baseMissing = heldRun(null, { baselineMutate: baseline => { delete baseline.files['live/merged'] } })
  assert.ok(baseMissing.channels.LIVE.domains.every(entry => entry.result !== 'UNCHANGED'))
})

test('a domain file that does not parse holds that domain; others keep their proven result', () => {
  const output = heldRun(candidate => { candidate.files['live/merged'] = '{ not json' })
  for (const name of ['REWARD_SOURCES', 'LOCATIONS']) {
    assert.equal(domainResult(output, 'LIVE', name).result, 'HELD_FOR_REVIEW')
    assert.ok(allCodes(output, 'LIVE', name).some(code => ['FILE_UNPARSABLE', 'DEPENDENCY_HELD'].includes(code)))
  }
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').reasons[0].code, 'FILE_UNPARSABLE')
  assert.equal(domainResult(output, 'LIVE', 'FABRICATOR').result, 'UNCHANGED')
  assert.equal(output.channels.LIVE.result, 'HELD_FOR_REVIEW')
  // BOM, invalid UTF-8 and non-object documents are not repaired either.
  for (const content of ['﻿{"version":"4.10.2-live.1000"}', Buffer.from([0x7b, 0xff, 0x7d]), '[]', '"x"']) {
    const held = heldRun(candidate => { candidate.files['live/merged'] = content })
    assert.equal(domainResult(held, 'LIVE', 'LOCATIONS').result, 'HELD_FOR_REVIEW')
  }
})

test('an unparsable baseline file is HELD as well', () => {
  const output = heldRun(null, { baselineMutate: baseline => { baseline.files['live/crafting_blueprints'] = 'nope' } })
  assert.equal(domainResult(output, 'LIVE', 'BLUEPRINT_CATALOG').result, 'HELD_FOR_REVIEW')
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').result, 'UNCHANGED')
})

test('invalid latest.json is HELD for every channel and domain', () => {
  const variants = [
    candidate => { delete candidate.files.latest },
    candidate => { candidate.files.latest = '{' },
    candidate => { candidate.files.latest = '[]' },
    candidate => { candidate.files.latest = '{"channels":"x"}' },
    candidate => { candidate.files.latest = '{"channels":{}}' },
  ]
  for (const mutate of variants) assertHeld(heldRun(mutate))
  assertHeld(heldRun(null, { baselineMutate: baseline => { baseline.files.latest = '{' } }))
  const emptyOk = heldRun(candidate => { candidate.files.latest = '{"channels":{}}' })
  assert.equal(emptyOk.result, 'HELD_FOR_REVIEW', 'no channel at all is never UNCHANGED')
})

test('version strings that fail the 33.4 parse rule are HELD and never repaired', () => {
  for (const version of ['4.10-live.1000', '4.10.2.1-live.1000', '4.10.2-live', '4.10.2-live.1000-x', '4.10.2-LIVE.1000', '4.10.2-eptu.1000', '4.10.2-live.abc', '', 'x']) {
    const output = heldRun((candidate, docs) => {
      const latest = clone(docs.static.latest)
      latest.channels.live.version = version
      candidate.files.latest = JSON.stringify(latest)
    })
    for (const name of LIVE_DOMAINS) assert.equal(domainResult(output, 'LIVE', name).result, 'HELD_FOR_REVIEW', `${JSON.stringify(version)} ${name}`)
    assert.ok(output.findings.some(finding => finding.scope === 'LIVE' && finding.code === 'VERSION_UNPARSABLE'), version)
    assert.equal(output.channels.PTU.result, 'UNCHANGED', 'a bad LIVE version does not hold PTU')
  }
  const output = heldRun((candidate, docs) => {
    const latest = clone(docs.static.latest)
    latest.channels.live.version = 12345
    candidate.files.latest = JSON.stringify(latest)
  })
  assert.equal(output.channels.LIVE.result, 'HELD_FOR_REVIEW')
})

test('channel mismatch is HELD: version token, file name token, other channel token', () => {
  const swapped = heldRun((candidate, docs) => {
    const latest = clone(docs.static.latest)
    latest.channels.live.version = '4.10.2-ptu.1000'
    candidate.files.latest = JSON.stringify(latest)
  })
  assert.equal(swapped.channels.LIVE.result, 'HELD_FOR_REVIEW')
  assert.ok(swapped.findings.some(finding => finding.code === 'CHANNEL_MISMATCH' && finding.scope === 'LIVE'))

  const fileName = heldRun((candidate, docs) => {
    const latest = clone(docs.static.latest)
    latest.channels.ptu.files.merged = 'merged-4.10.3-live.2000.json'
    candidate.files.latest = JSON.stringify(latest)
  })
  assert.equal(fileName.channels.PTU.result, 'HELD_FOR_REVIEW')
  assert.ok(fileName.findings.some(finding => finding.code === 'CHANNEL_MISMATCH' && finding.role === 'merged'))

  const build = heldRun((candidate, docs) => {
    const latest = clone(docs.static.latest)
    latest.channels.live.files.merged = 'merged-4.10.2-live.9999.json'
    candidate.files.latest = JSON.stringify(latest)
  })
  assert.equal(build.channels.LIVE.result, 'HELD_FOR_REVIEW')
  assert.ok(build.findings.some(finding => finding.code === 'FILE_NAME_VERSION_MISMATCH'))

  const channelOnSide = heldRun((candidate, docs) => {
    const latest = clone(docs.static.latest)
    latest.channels.eptu = clone(latest.channels.ptu)
    candidate.files.latest = JSON.stringify(latest)
  })
  assertHeld(channelOnSide)
  assert.ok(findingCodes(channelOnSide).includes('UNSUPPORTED_CHANNEL'))
})

test('a document whose version differs from latest.json is HELD', () => {
  const output = heldRun(candidate => setFile(candidate, 'live/merged', doc => { doc.version = '4.10.2-live.7' }))
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').result, 'HELD_FOR_REVIEW')
  assert.equal(output.channels.LIVE.domains.find(entry => entry.domain === 'LOCATIONS').reasons[0].code, 'DOCUMENT_VERSION_MISMATCH')
})

test('a channel on one side only is HELD', () => {
  const output = heldRun((candidate, docs) => {
    const latest = clone(docs.static.latest)
    delete latest.channels.ptu
    candidate.files.latest = JSON.stringify(latest)
  })
  assert.ok(output.channels.PTU.domains.every(entry => entry.result === 'HELD_FOR_REVIEW'))
  assert.ok(output.findings.some(finding => finding.code === 'CHANNEL_MISSING_ON_ONE_SIDE'))
  assert.equal(output.channels.LIVE.result, 'UNCHANGED')
})

test('a file or role without a register entry is HELD (37.3 rule 1)', () => {
  const unknownFile = heldRun(candidate => { candidate.files['unregistered/_local-mirror-manifest.json'] = '{}' })
  assertHeld(unknownFile)
  assert.ok(unknownFile.findings.some(finding => finding.code === 'UNREGISTERED_FILE' && finding.file === 'unregistered/_local-mirror-manifest.json'))
  const baselineOnly = heldRun(null, { baselineMutate: baseline => { baseline.files['unregistered/other.json'] = '{}' } })
  assertHeld(baselineOnly)

  const unknownRole = heldRun((candidate, docs) => {
    const latest = clone(docs.static.latest)
    latest.channels.live.files.new_family = 'new_family-4.10.2-live.1000.json'
    candidate.files.latest = JSON.stringify(latest)
    candidate.files['live/new_family'] = '{}'
  })
  assert.equal(unknownRole.channels.LIVE.result, 'HELD_FOR_REVIEW')
  assert.ok(unknownRole.findings.some(finding => finding.code === 'UNREGISTERED_FILE' && finding.role === 'new_family'))
  assert.ok(unknownRole.findings.some(finding => finding.code === 'UNREGISTERED_FILE' && finding.file === 'live/new_family'))
})

test('a register entry whose section is absent is HELD for that domain only', () => {
  const output = heldRun(candidate => setFile(candidate, 'live/crafting_items', doc => { delete doc.items }))
  assert.equal(domainResult(output, 'LIVE', 'FABRICATOR').result, 'HELD_FOR_REVIEW')
  assert.deepEqual(domainResult(output, 'LIVE', 'FABRICATOR').reasons[0].section, 'items')
  assert.equal(domainResult(output, 'LIVE', 'LEGACY_FRONTEND').result, 'CHANGED', 'whole-document domain sees the removal as a change')
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').result, 'UNCHANGED')

  const noPools = heldRun(candidate => setFile(candidate, 'live/crafting_items', doc => { delete doc.ammoPools; delete doc.fireModesPools }))
  assert.equal(domainResult(noPools, 'LIVE', 'FABRICATOR').result, 'HELD_FOR_REVIEW')
  assert.equal(domainResult(noPools, 'LIVE', 'FABRICATOR').reasons[0].code, 'SECTION_ABSENT')

  for (const [key, section, domain] of [['live/merged', 'locationPools', 'LOCATIONS'], ['live/merged', 'contracts', 'REWARD_SOURCES'], ['ptu/crafting_blueprints', 'blueprints', 'BLUEPRINT_CATALOG'], ['live/crafting_blueprints', 'resources', 'MATERIAL_UNITS']]) {
    const held = heldRun(candidate => setFile(candidate, key, doc => { delete doc[section] }))
    const channel = key.startsWith('live') ? 'LIVE' : 'PTU'
    assert.equal(domainResult(held, channel, domain).result, 'HELD_FOR_REVIEW', `${key} ${section}`)
  }
  const onBaseline = heldRun(null, { baselineMutate: baseline => {
    const doc = JSON.parse(baseline.files['live/merged'])
    delete doc.locationPools
    baseline.files['live/merged'] = JSON.stringify(doc)
  } })
  assert.equal(domainResult(onBaseline, 'LIVE', 'LOCATIONS').result, 'HELD_FOR_REVIEW')
})

test('a fingerprint that cannot be computed is HELD (integer outside the safe range, non-finite number)', () => {
  const output = heldRun(candidate => {
    setFile(candidate, 'live/merged', doc => { doc.locationPools.l1.id = 'BIGINT' })
    candidate.files['live/merged'] = candidate.files['live/merged'].replace('"BIGINT"', '12345678901234567890')
  })
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').result, 'HELD_FOR_REVIEW')
  assert.equal(domainResult(output, 'LIVE', 'LOCATIONS').reasons[0].code, 'FINGERPRINT_NOT_COMPUTABLE')
  assert.equal(domainResult(output, 'LIVE', 'FABRICATOR').result, 'UNCHANGED')
  const infinite = heldRun(candidate => {
    setFile(candidate, 'live/merged', doc => { doc.locationPools.l1.id = 'INF' })
    candidate.files['live/merged'] = candidate.files['live/merged'].replace('"INF"', '1e999')
  })
  assert.equal(domainResult(infinite, 'LIVE', 'LOCATIONS').result, 'HELD_FOR_REVIEW')
})

test('site-settings: refresh keys are non-trigger, every other change is HELD (owner decision 19)', () => {
  const refresh = heldRun(candidate => setFile(candidate, 'site_settings', doc => {
    doc.updated_at = '2030-01-01T00:00:00Z'
    doc.mema_cache_last_refreshed = '2030-01-01T00:00:00Z'
  }))
  assert.equal(refresh.result, 'UNCHANGED')

  const mutations = {
    scenario_overrides: doc => { doc.scenario_overrides.live.A = false },
    'scenario_overrides (new scenario)': doc => { doc.scenario_overrides.live.B = true },
    ptu_enabled: doc => { doc.ptu_enabled = false },
    blueprints_enabled: doc => { doc.blueprints_enabled = false },
    mema_cache_interval_hours: doc => { doc.mema_cache_interval_hours = 6 },
    'new key': doc => { doc.brand_new = 1 },
    'removed key': doc => { delete doc.mema_enabled },
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    const output = heldRun(candidate => setFile(candidate, 'site_settings', mutate))
    assertHeld(output)
    assert.ok(findingCodes(output).includes('SITE_SETTINGS_CHANGED'), name)
  }
  const keys = heldRun(candidate => setFile(candidate, 'site_settings', doc => { doc.scenario_overrides.live.A = false })).findings.find(finding => finding.code === 'SITE_SETTINGS_CHANGED').keys
  assert.deepEqual(keys, ['scenario_overrides'])

  const broken = heldRun(candidate => { candidate.files.site_settings = '{' })
  assertHeld(broken)
  const key_order = heldRun(candidate => {
    const doc = JSON.parse(candidate.files.site_settings)
    candidate.files.site_settings = JSON.stringify(Object.fromEntries(Object.entries(doc).reverse()))
  })
  assert.equal(key_order.result, 'UNCHANGED', 'key order inside site-settings is not a change')
})

test('workflow-state.json is retained and a non-trigger file (owner decision 19)', () => {
  const output = heldRun(candidate => { candidate.files.workflow_state = JSON.stringify({ mema_cache_interval_hours: 1, mema_cache_last_refreshed: 'x', extra: true }) })
  assert.equal(output.result, 'UNCHANGED')
  const gone = heldRun(candidate => { delete candidate.files.workflow_state })
  assertHeld(gone)
})

test('comparison key versions that are missing or malformed are HELD', () => {
  for (const versions of [undefined, null, {}, { projector: '' }, { projector: 'p1', resolvers: 'x' }, { projector: 'p1', resolvers: { LOCATIONS: 3 } }]) {
    const candidate = heldRun(c => { c.versions = versions })
    assertHeld(candidate)
    assert.ok(findingCodes(candidate).includes('VERSIONS_INVALID'))
  }
  assertHeld(heldRun(null, { baselineMutate: baseline => { baseline.versions = { projector: 'p1' } } }))
  assertHeld(heldRun(c => { c.versions = { ...VERSIONS, register: 'other' } }))
})

test('HELD_FOR_REVIEW takes precedence over a proven CHANGED in the same channel and run', () => {
  const docs = makeMirror()
  const changed = clone(docs)
  changed.channels.live.merged.locationPools.l1.name = 'x'
  const candidate = candidateOf(changed)
  setFile(candidate, 'site_settings', doc => { doc.scenario_overrides.live.A = false })
  const output = runDomainPrecheck({ baseline: side(docs), candidate })
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  assert.equal(output.channels.LIVE.result, 'HELD_FOR_REVIEW')
  assert.equal(output.channels.PTU.result, 'HELD_FOR_REVIEW')
})

test('an empty input is never UNCHANGED', () => {
  const output = runDomainPrecheck({ baseline: { files: {}, versions: VERSIONS }, candidate: { files: {}, versions: VERSIONS } })
  assert.equal(output.result, 'HELD_FOR_REVIEW')
  const nothing = runDomainPrecheck({ baseline: undefined, candidate: undefined })
  assert.equal(nothing.result, 'HELD_FOR_REVIEW')
})
