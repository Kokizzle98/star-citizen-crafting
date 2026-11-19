#!/usr/bin/env node
// Decision logic of the SCMDB mirror sync workflow (docs/proposed/DATASET_PIPELINE_V1.md
// sections 31, 35.1, 38 and 39; owner decisions 19 to 22 in section 43).
//
// Everything here is a pure function over the JSON output of scripts/domain-precheck.mjs.
// The workflow only moves files and runs git; it never decides. The CLI at the bottom
// reads one precheck result and writes the files the workflow needs. It uses no
// network, no database and no clock.
//
// Outcomes (fail-closed, HELD wins over CHANGED wins over OBSERVE):
//   OBSERVE  every domain of every channel is UNCHANGED: append observation lines only.
//   PUBLISH  at least one CHANGED and no HELD_FOR_REVIEW: mirror commit plus observations, pull request.
//   HELD     anything that is not proven: observation lines only, no mirror commit, no pull request.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeObservation } from '../domain-precheck/observation.mjs'
import { RESULT } from '../domain-precheck/precheck.mjs'

export const SYNC_BRANCH = 'automation/scmdb-sync'
export const BASE_BRANCH = 'develop'
export const UPSTREAM_REPOSITORY = 'KrovaxCode/SCMDB_DATA'
// Proposed location of the append-only observation record (owner decision 21). Outside
// data/scmdb/, so the mirror consumers and the data/scmdb/** path filters do not fire on it.
export const OBSERVATION_FILE = 'data/scmdb-sync/observations.jsonl'

export const OUTCOME = Object.freeze({ OBSERVE: 'OBSERVE', PUBLISH: 'PUBLISH', HELD: 'HELD' })
export const MODE = Object.freeze({ DRY_RUN: 'dry-run', PUBLISH: 'publish' })

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/
const BUILD_PATTERN = /^(\d+)\.(\d+)\.(\d+)-(live|ptu)\.(\d+)$/
const RESULTS = new Set(Object.values(RESULT))
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Semantic version and CIG build of a build string such as `4.10.2-live.12913470`; null when it does not parse. */
export function parseBuild(build) {
  const match = typeof build === 'string' ? BUILD_PATTERN.exec(build) : null
  return match ? { semantic_version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`, cig_build: match[5] } : null
}

// --- mode ---------------------------------------------------------------------------------------

/**
 * `publish` only when the repository variable says exactly `publish` and nothing forces dry-run.
 * Unset, empty, misspelled or any other value is dry-run.
 */
export function resolveMode({ variable, forceDryRun } = {}) {
  const forced = String(forceDryRun ?? '').trim().toLowerCase() === 'true'
  const value = typeof variable === 'string' ? variable.trim() : ''
  if (forced) return { mode: MODE.DRY_RUN, reason: 'FORCED_BY_INPUT' }
  if (value === MODE.PUBLISH) return { mode: MODE.PUBLISH, reason: 'VARIABLE_PUBLISH' }
  if (value === '' || value === MODE.DRY_RUN) return { mode: MODE.DRY_RUN, reason: value === '' ? 'VARIABLE_UNSET_DEFAULT' : 'VARIABLE_DRY_RUN' }
  return { mode: MODE.DRY_RUN, reason: 'VARIABLE_UNRECOGNIZED_DEFAULT' }
}

// --- decision -----------------------------------------------------------------------------------

/**
 * @param {object} precheck Output of scripts/domain-precheck.mjs (--emit json).
 * @returns {{outcome: string, reasons: object[], changed_channels: object[], domains: object[], counts: object}}
 */
export function decide(precheck) {
  const reasons = []
  const domains = []
  const changedChannels = []

  if (!isObject(precheck) || !isObject(precheck.channels)) {
    return finish(OUTCOME.HELD, [{ code: 'PRECHECK_MALFORMED' }], domains, changedChannels)
  }
  const channels = Object.values(precheck.channels)
  if (channels.length === 0) reasons.push({ code: 'NO_CHANNEL_RESULT' })

  for (const channel of channels) {
    if (!isObject(channel) || !Array.isArray(channel.domains) || channel.domains.length === 0) {
      reasons.push({ code: 'CHANNEL_WITHOUT_DOMAINS', channel: isObject(channel) ? channel.channel ?? null : null })
      continue
    }
    let domainChanged = false
    for (const entry of channel.domains) {
      const result = isObject(entry) ? entry.result : undefined
      if (!RESULTS.has(result)) {
        reasons.push({ code: 'RESULT_UNKNOWN', channel: channel.channel ?? null, domain: isObject(entry) ? entry.domain ?? null : null })
        continue
      }
      domains.push({
        channel: channel.channel,
        domain: entry.domain,
        result,
        reason_codes: Array.isArray(entry.reasons) ? entry.reasons.map(reason => reason?.code ?? null) : [],
      })
      if (result === RESULT.CHANGED) domainChanged = true
      if (result === RESULT.HELD_FOR_REVIEW) reasons.push({ code: 'DOMAIN_HELD', channel: channel.channel, domain: entry.domain })
    }
    // A channel changed when its build differs from the baseline build or at least one of its domains is CHANGED
    // (section 35.1 rule 5). A new build with only UNCHANGED domains is a build-only update; an equal build with
    // only UNCHANGED domains is not listed at all.
    const buildChanged = (channel.build ?? null) !== (channel.baseline_build ?? null)
    if (domainChanged || buildChanged) {
      const baseline = parseBuild(channel.baseline_build)
      changedChannels.push({
        channel: channel.channel,
        kind: domainChanged ? 'DOMAIN_CHANGE' : 'BUILD_ONLY',
        build: channel.build ?? null,
        semantic_version: channel.semantic_version ?? null,
        cig_build: channel.cig_build ?? null,
        baseline_build: channel.baseline_build ?? null,
        baseline_semantic_version: baseline?.semantic_version ?? null,
        baseline_cig_build: baseline?.cig_build ?? null,
      })
    }
  }

  // Defense in depth. The precheck already turns each of these into HELD_FOR_REVIEW domains.
  if (!RESULTS.has(precheck.result)) reasons.push({ code: 'TOP_LEVEL_RESULT_UNKNOWN' })
  else if (precheck.result === RESULT.HELD_FOR_REVIEW && !reasons.some(reason => reason.code === 'DOMAIN_HELD')) reasons.push({ code: 'TOP_LEVEL_HELD' })
  const sha = precheck.source_export_revision?.upstream_commit_sha
  if (typeof sha !== 'string' || !COMMIT_SHA_PATTERN.test(sha)) reasons.push({ code: 'SOURCE_SHA_MISSING' })
  if (Array.isArray(precheck.findings) && precheck.findings.length > 0) {
    reasons.push({ code: 'PRECHECK_FINDINGS', count: precheck.findings.length, finding_codes: [...new Set(precheck.findings.map(finding => finding?.code ?? null))].sort() })
  } else if (!Array.isArray(precheck.findings)) {
    reasons.push({ code: 'FINDINGS_MISSING' })
  }

  if (reasons.length > 0) return finish(OUTCOME.HELD, reasons, domains, changedChannels)
  if (domains.some(entry => entry.result === RESULT.CHANGED)) return finish(OUTCOME.PUBLISH, [], domains, changedChannels)
  return finish(OUTCOME.OBSERVE, [], domains, changedChannels)
}

function finish(outcome, reasons, domains, changedChannels) {
  const counts = { UNCHANGED: 0, CHANGED: 0, HELD_FOR_REVIEW: 0 }
  for (const entry of domains) counts[entry.result] += 1
  return { outcome, reasons, changed_channels: outcome === OUTCOME.PUBLISH ? changedChannels : [], domains, counts }
}

// --- observation record -------------------------------------------------------------------------

/**
 * The lines to append for one run: the Source Export Revision record (if a commit SHA exists)
 * followed by one entry per channel and domain (section 39). Throws when the observation does
 * not match the precheck result, so that a broken record is never appended.
 */
export function observationLines(precheck) {
  const observation = precheck?.observation
  if (!isObject(observation) || !Array.isArray(observation.entries)) throw new Error('OBSERVATION_MISSING')
  const expected = Object.values(precheck.channels ?? {}).reduce((sum, channel) => sum + (channel?.domains?.length ?? 0), 0)
  if (observation.entries.length !== expected || expected === 0) throw new Error('OBSERVATION_ENTRY_COUNT_MISMATCH')
  const hasSha = typeof precheck.source_export_revision?.upstream_commit_sha === 'string'
  if (hasSha !== (observation.source_export_revision_record !== null && observation.source_export_revision_record !== undefined)) {
    throw new Error('OBSERVATION_REVISION_RECORD_MISMATCH')
  }
  return serializeObservation(observation)
}

/** Appends lines to an existing record. The existing text is never altered (section 39 rule 2). */
export function appendObservation(existing, lines) {
  const before = existing ?? ''
  if (before !== '' && !before.endsWith('\n')) throw new Error('OBSERVATION_RECORD_NOT_NEWLINE_TERMINATED')
  if (lines === '' || !lines.endsWith('\n')) throw new Error('OBSERVATION_LINES_INVALID')
  for (const line of lines.split('\n').filter(Boolean)) {
    const record = JSON.parse(line)
    if (!isObject(record) || typeof record.record_type !== 'string') throw new Error('OBSERVATION_LINES_INVALID')
  }
  return `${before}${lines}`
}

/** True when `after` only adds to the end of `before`. */
export const isAppendOnly = (before, after) => after.length >= before.length && after.startsWith(before)

// --- text ---------------------------------------------------------------------------------------

const cell = value => {
  if (value === null || value === undefined || value === '') return 'n/a'
  return String(value).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|')
}
const shortSha = precheck => {
  const sha = precheck?.source_export_revision?.upstream_commit_sha
  return typeof sha === 'string' && COMMIT_SHA_PATTERN.test(sha) ? sha.slice(0, 7) : 'unknown'
}
const identityLabel = channels => channels.map(channel => `${channel.channel} ${channel.build ?? 'unknown build'}`).join(', ')

/** Commit message of a mirror commit (PUBLISH). Other outcomes get the observation message. */
export function buildCommitMessage(decision, precheck) {
  if (decision.outcome !== OUTCOME.PUBLISH) return buildObservationCommitMessage(decision, precheck)
  return [
    `chore(scmdb-sync): mirror SCMDB export ${shortSha(precheck)} (${identityLabel(decision.changed_channels)})`,
    '',
    `Upstream: ${UPSTREAM_REPOSITORY} ${precheck.source_export_revision.upstream_commit_sha}`,
    `Precheck: ${decision.counts.CHANGED} CHANGED, ${decision.counts.UNCHANGED} UNCHANGED, ${decision.counts.HELD_FOR_REVIEW} HELD_FOR_REVIEW domain results.`,
    'Observation record entries of this run are included. Proposed through a pull request only; no auto-merge.',
    '',
  ].join('\n')
}

/** Commit message of a commit that only appends to the observation record. */
export function buildObservationCommitMessage(decision, precheck) {
  const label = { [OUTCOME.OBSERVE]: 'unchanged', [OUTCOME.HELD]: 'held', [OUTCOME.PUBLISH]: 'changed' }[decision.outcome] ?? 'unknown'
  return [
    `chore(scmdb-sync): record ${label} observation ${shortSha(precheck)}`,
    '',
    `Upstream: ${UPSTREAM_REPOSITORY} ${precheck?.source_export_revision?.upstream_commit_sha ?? 'unknown'}`,
    'Appends to the append-only observation record. No mirror change.',
    '',
  ].join('\n')
}

export function buildPrTitle(decision) {
  return `chore(scmdb-sync): SCMDB mirror update (${identityLabel(decision.changed_channels)})`
}

function domainTable(precheck) {
  const rows = ['| Channel | Domain | Result | Reason codes |', '| --- | --- | --- | --- |']
  for (const channel of Object.values(precheck.channels)) {
    for (const entry of channel.domains) {
      const codes = (entry.reasons ?? []).map(reason => reason?.code).filter(Boolean)
      rows.push(`| ${cell(channel.channel)} | ${cell(entry.domain)} | ${cell(entry.result)} | ${cell(codes.join(', '))} |`)
    }
  }
  return rows
}

const arrow = (before, after) => (before === after ? `${cell(after)} (unchanged)` : `${cell(before)} -> ${cell(after)}`)
const CHANGE_LABEL = { DOMAIN_CHANGE: 'domain change', BUILD_ONLY: 'build-only update, no domain change' }

/** One row per changed channel: baseline -> candidate for the versions, plus the upstream commit (section 35.1 rule 5). */
function identityTable(channels, sha) {
  const rows = [
    '| Channel | Change | Semantic version | CIG build | Build string | Upstream commit |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const channel of channels) {
    const cells = [
      cell(channel.channel),
      CHANGE_LABEL[channel.kind] ?? cell(channel.kind),
      arrow(channel.baseline_semantic_version, channel.semantic_version),
      arrow(channel.baseline_cig_build, channel.cig_build),
      arrow(channel.baseline_build, channel.build),
      sha ? `\`${sha}\`` : 'n/a',
    ]
    rows.push(`| ${cells.join(' | ')} |`)
  }
  return rows
}

/** Pull request text (English, neutral). Section 35.1 rules 1, 2 and 5. */
export function buildPrBody(decision, precheck, { runUrl = null, observationFile = OBSERVATION_FILE } = {}) {
  if (decision.outcome !== OUTCOME.PUBLISH) throw new Error('PR_BODY_ONLY_FOR_PUBLISH')
  const revision = precheck.source_export_revision
  const lines = [
    '## SCMDB mirror update',
    '',
    'Proposed by the `SCMDB Mirror Sync V2` workflow. **No auto-merge. Owner review required.** This pull request changes `data/scmdb/` only. It does not activate a dataset in Production and writes to no database.',
    '',
    '### Dataset identity of the changed channels',
    '',
    'A channel is listed when its build differs from the build on `develop` or when at least one of its domains is `CHANGED`. Versions read baseline -> candidate. A channel listed as a build-only update has a new build but no changed domain input.',
    '',
    ...identityTable(decision.changed_channels, revision.upstream_commit_sha),
    '',
    `Upstream: \`${UPSTREAM_REPOSITORY}\` at commit \`${revision.upstream_commit_sha}\`, retrieved ${cell(revision.retrieved_at)}.`,
    '',
    '### Precheck result per domain',
    '',
    `Register version ${cell(precheck.register_version)}, comparison versions ${cell(precheck.versions_source)}. Baseline is \`${BASE_BRANCH}\`.`,
    '',
    ...domainTable(precheck),
    '',
    '### Observation record',
    '',
    `The observation entries collected on the sync branch since the last merge ride along in \`${observationFile}\` (append-only).`,
    '',
    '### Reviewer notes',
    '',
    '- Review and merge by hand. Prefer a merge commit over a squash so that the rolling sync branch fast-forwards to `develop` afterwards.',
    `- CI does not start by itself. Pull requests opened or updated by a workflow with the default token do not trigger \`pull_request\` workflows. After each update of this pull request, close it and reopen it once to start the checks.`,
  ]
  if (runUrl) lines.push(`- Workflow run: ${runUrl}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * Title and text for an open pull request whose mirror proposal no longer holds (outcome OBSERVE while a
 * pull request from the sync branch is open). Neutral; the pull request is neither closed nor merged.
 */
export function buildWithdrawalPr(decision, precheck, { runUrl = null, observationFile = OBSERVATION_FILE } = {}) {
  if (decision?.outcome !== OUTCOME.OBSERVE) throw new Error('WITHDRAWAL_ONLY_FOR_OBSERVE')
  const revision = precheck.source_export_revision
  const rows = ['| Channel | Build on `develop` | Upstream build at this run |', '| --- | --- | --- |']
  for (const channel of Object.values(precheck.channels)) rows.push(`| ${cell(channel.channel)} | ${cell(channel.baseline_build)} | ${cell(channel.build)} |`)
  const lines = [
    '## Mirror proposal withdrawn',
    '',
    '**Mirror proposal withdrawn: upstream matches `develop` again; this pull request now carries observation records only.**',
    '',
    `The mirror files on \`${SYNC_BRANCH}\` were set back to \`${BASE_BRANCH}\`. The owner can close this pull request, or merge it to bring the observation records (\`${observationFile}\`) into \`${BASE_BRANCH}\`. It is not closed and not merged automatically.`,
    '',
    '### Latest run',
    '',
    ...rows,
    '',
    `Upstream: \`${UPSTREAM_REPOSITORY}\` at commit \`${revision.upstream_commit_sha}\`, retrieved ${cell(revision.retrieved_at)}. All ${decision.counts.UNCHANGED} domain results are \`UNCHANGED\`.`,
  ]
  if (runUrl) lines.push('', `Workflow run: ${runUrl}`)
  lines.push('')
  return { title: 'chore(scmdb-sync): mirror proposal withdrawn, observation records only', body: lines.join('\n') }
}

/**
 * Job summary note about an already open pull request from the sync branch. Empty when there is none.
 * `prNumber` is the number, an empty value for none, or `unknown` when the lookup failed.
 */
export function buildOpenPrNote({ outcome, mode, prNumber }) {
  const number = String(prNumber ?? '').trim()
  if (number === '') return ''
  if (number === 'unknown') {
    return outcome === OUTCOME.PUBLISH ? '' : '## Open pull request\n\nThe lookup of open pull requests failed. No pull request was changed.\n'
  }
  if (outcome === OUTCOME.OBSERVE) {
    return [
      `## Open pull request #${number}`,
      '',
      mode === MODE.PUBLISH
        ? 'Upstream matches `develop` again. Its title and text are updated to say that the mirror proposal is withdrawn and that it now carries observation records only. It is not closed and not merged.'
        : 'Upstream matches `develop` again. DRY-RUN: a publish run would update its title and text to say that the mirror proposal is withdrawn and that it now carries observation records only. Nothing is written now. It would not be closed and not merged.',
      '',
    ].join('\n')
  }
  if (outcome === OUTCOME.HELD) {
    return [
      `## Open pull request #${number}`,
      '',
      'It still shows the last PUBLISH state. This held run does not change it.',
      '',
    ].join('\n')
  }
  return ''
}

/**
 * Markdown for the job summary.
 * @param {object} context
 * @param {string} context.mode            `dry-run` or `publish`
 * @param {string} context.modeReason
 */
export function buildSummary(decision, precheck, { mode, modeReason = null, observationFile = OBSERVATION_FILE } = {}) {
  const revision = precheck?.source_export_revision ?? {}
  const lines = [
    '# SCMDB Mirror Sync V2',
    '',
    `- Mode: \`${mode}\`${modeReason ? ` (${modeReason})` : ''}`,
    `- Outcome: **${decision.outcome}**`,
    `- Upstream commit: \`${cell(revision.upstream_commit_sha)}\``,
    `- Retrieved at: ${cell(revision.retrieved_at)}`,
    `- Domain results: ${decision.counts.CHANGED} CHANGED, ${decision.counts.UNCHANGED} UNCHANGED, ${decision.counts.HELD_FOR_REVIEW} HELD_FOR_REVIEW`,
    '',
  ]
  if (isObject(precheck?.channels) && Object.values(precheck.channels).every(channel => Array.isArray(channel?.domains))) {
    lines.push('## Result per channel and domain', '', ...domainTable(precheck), '')
  }
  if (decision.outcome === OUTCOME.PUBLISH) {
    lines.push('## Changed channels', '', ...identityTable(decision.changed_channels, revision.upstream_commit_sha), '')
  }
  if (decision.reasons.length > 0) {
    lines.push('## Why this run is held', '', ...decision.reasons.map(reason => `- \`${cell(reason.code)}\`${reason.channel ? ` ${cell(reason.channel)}` : ''}${reason.domain ? `/${cell(reason.domain)}` : ''}`), '')
  }
  const dry = mode !== MODE.PUBLISH
  const action = {
    [OUTCOME.OBSERVE]: `append the observation entries to \`${observationFile}\` on \`${SYNC_BRANCH}\` (no pull request, no mirror commit)`,
    [OUTCOME.PUBLISH]: `commit the mirror change plus observation entries to \`${SYNC_BRANCH}\`, then open or update the pull request against \`${BASE_BRANCH}\``,
    [OUTCOME.HELD]: `append the observation entries (with HELD_FOR_REVIEW) to \`${observationFile}\` on \`${SYNC_BRANCH}\`, create no mirror commit and no pull request, then fail the job`,
  }[decision.outcome]
  lines.push('## Action', '', dry ? `DRY-RUN: nothing is pushed and no pull request is created. A publish run would ${action}.` : `Publish run: ${action}.`, '')
  return lines.join('\n')
}

// --- CLI ----------------------------------------------------------------------------------------

const HELP = `Usage:
  node scripts/scmdb-sync/decide.mjs mode --variable <value> --force-dry-run <true|false|''>
  node scripts/scmdb-sync/decide.mjs decide --precheck <file> --mode <dry-run|publish> --out-dir <dir>
                                            [--mode-reason <text>] [--run-url <url>]
  node scripts/scmdb-sync/decide.mjs append --file <record> --lines <file>
  node scripts/scmdb-sync/decide.mjs pr-note --outcome <OBSERVE|HELD|PUBLISH> --mode <dry-run|publish> --pr <number|''|unknown>

mode:   prints mode=<dry-run|publish> and mode_reason=<code>
decide: reads the precheck JSON and writes decision.json, observation-lines.jsonl, summary.md,
        commit-message.txt, observation-commit-message.txt, (PUBLISH only) pr-title.txt and pr-body.md,
        (OBSERVE only) pr-withdrawn-title.txt and pr-withdrawn-body.md into --out-dir; prints outcome=<...>.
pr-note: prints the job summary note about an open pull request (nothing when there is none).
append: appends the lines to the observation record (created when missing); existing text is never changed.
Exit codes: 0 done, 2 usage or read error. A HELD outcome is a result, not an error.
`

function parseOptions(argv) {
  const options = {}
  const known = new Set(['variable', 'force-dry-run', 'precheck', 'mode', 'out-dir', 'mode-reason', 'run-url', 'file', 'lines', 'outcome', 'pr'])
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) throw new Error(`USAGE: unexpected argument ${JSON.stringify(arg)}`)
    const name = arg.slice(2)
    if (!known.has(name)) throw new Error(`USAGE: unknown option --${name}`)
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`USAGE: --${name} needs a value`)
    options[name] = value
    index += 1
  }
  return options
}

export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const [command, ...rest] = argv
    if (command === '--help' || command === '-h' || command === undefined) {
      stdout.write(HELP)
      return command === undefined ? 2 : 0
    }
    const options = parseOptions(rest)
    if (command === 'mode') {
      const { mode, reason } = resolveMode({ variable: options.variable, forceDryRun: options['force-dry-run'] })
      stdout.write(`mode=${mode}\nmode_reason=${reason}\n`)
      return 0
    }
    if (command === 'decide') {
      if (!options.precheck || !options['out-dir'] || !Object.values(MODE).includes(options.mode)) throw new Error('USAGE: decide needs --precheck, --out-dir and --mode dry-run|publish')
      const precheck = JSON.parse(await readFile(options.precheck, 'utf8'))
      const decision = decide(precheck)
      const outDir = options['out-dir']
      await mkdir(outDir, { recursive: true })
      const write = (name, content) => writeFile(path.join(outDir, name), content, 'utf8')
      await write('decision.json', `${JSON.stringify(decision, null, 2)}\n`)
      await write('observation-lines.jsonl', observationLines(precheck))
      await write('summary.md', buildSummary(decision, precheck, { mode: options.mode, modeReason: options['mode-reason'] ?? null }))
      await write('commit-message.txt', buildCommitMessage(decision, precheck))
      await write('observation-commit-message.txt', buildObservationCommitMessage(decision, precheck))
      if (decision.outcome === OUTCOME.PUBLISH) {
        await write('pr-title.txt', `${buildPrTitle(decision)}\n`)
        await write('pr-body.md', buildPrBody(decision, precheck, { runUrl: options['run-url'] ?? null }))
      }
      if (decision.outcome === OUTCOME.OBSERVE) {
        const withdrawal = buildWithdrawalPr(decision, precheck, { runUrl: options['run-url'] ?? null })
        await write('pr-withdrawn-title.txt', `${withdrawal.title}\n`)
        await write('pr-withdrawn-body.md', withdrawal.body)
      }
      stdout.write(`outcome=${decision.outcome}\n`)
      return 0
    }
    if (command === 'pr-note') {
      if (!Object.values(OUTCOME).includes(options.outcome) || !Object.values(MODE).includes(options.mode) || options.pr === undefined) {
        throw new Error('USAGE: pr-note needs --outcome, --mode and --pr')
      }
      stdout.write(buildOpenPrNote({ outcome: options.outcome, mode: options.mode, prNumber: options.pr }))
      return 0
    }
    if (command === 'append') {
      if (!options.file || !options.lines) throw new Error('USAGE: append needs --file and --lines')
      let existing = ''
      try {
        existing = await readFile(options.file, 'utf8')
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      const next = appendObservation(existing, await readFile(options.lines, 'utf8'))
      if (!isAppendOnly(existing, next)) throw new Error('OBSERVATION_RECORD_NOT_APPEND_ONLY')
      await mkdir(path.dirname(options.file), { recursive: true })
      await writeFile(options.file, next, 'utf8')
      return 0
    }
    throw new Error(`USAGE: unknown command ${JSON.stringify(command)}`)
  } catch (error) {
    stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n\n${HELP}`)
    return 2
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2))
}
