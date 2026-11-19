#!/usr/bin/env node
// Domain precheck CLI (docs/proposed/DATASET_PIPELINE_V1.md sections 36 to 39).
//
// Compares two states of data/scmdb/ and prints the fail-closed result per
// channel and domain as JSON. Read-only: it writes no file, calls no network,
// touches no database. It is plain ESM (.mjs), like the other scripts in this
// directory and like the test suite, so Node CI can run it without a build
// step.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDirectory, loadGitRef } from './domain-precheck/load-files.mjs'
import { buildObservation, serializeObservation } from './domain-precheck/observation.mjs'
import { runDomainPrecheck } from './domain-precheck/precheck.mjs'
import { DOMAIN_REGISTER, REGISTER_VERSION } from './domain-precheck/register.mjs'

const HELP = `Usage:
  node scripts/domain-precheck.mjs --baseline-dir <dir> | --baseline-ref <git-ref>
                                   --candidate-dir <dir> | --candidate-ref <git-ref>
                                   [--candidate-source-sha <40-hex>] [--source-retrieved-at <iso>]
                                   [--versions-file <json>] [--observed-at <iso>]
                                   [--domain-revision-ids <json>] [--emit json|jsonl]

Compares two states of data/scmdb/ per channel and domain: UNCHANGED, CHANGED or
HELD_FOR_REVIEW. Reads only. Writes nothing, uses no network and no database.

  --*-dir        a directory that holds the files of data/scmdb/
  --*-ref        a local git ref; reads <ref>:data/scmdb (objects missing locally count as missing files)
  --candidate-source-sha
                 upstream commit SHA of the candidate export. Without it every result is
                 HELD_FOR_REVIEW (section 33.2, rule 4).
  --versions-file
                 JSON {"baseline": {...}, "candidate": {...}} with projector, resolvers and (baseline only)
                 register versions. Without it both sides default to the versions in the register
                 (register ${REGISTER_VERSION}); the output marks them as defaulted.
  --observed-at  timestamp for the observation entries (default: now)
  --domain-revision-ids
                 JSON {"LIVE/BLUEPRINT_CATALOG": "<domain_revision_id>", ...}
  --emit         json (default): result plus observation. jsonl: only the observation lines to append.

Exit codes: 0 the precheck ran (read the result), 2 usage or read error.
`

function parseArgs(argv) {
  const options = {}
  const known = new Set([
    'baseline-dir', 'baseline-ref', 'candidate-dir', 'candidate-ref', 'candidate-source-sha',
    'source-retrieved-at', 'versions-file', 'observed-at', 'domain-revision-ids', 'emit',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (!arg.startsWith('--')) throw new Error(`USAGE: unexpected argument ${JSON.stringify(arg)}`)
    const eq = arg.indexOf('=')
    const name = arg.slice(2, eq === -1 ? undefined : eq)
    if (!known.has(name)) throw new Error(`USAGE: unknown option --${name}`)
    let value
    if (eq === -1) {
      value = argv[index + 1]
      index += 1
    } else {
      value = arg.slice(eq + 1)
    }
    if (value === undefined || value.startsWith('--')) throw new Error(`USAGE: --${name} needs a value`)
    options[name] = value
  }
  for (const side of ['baseline', 'candidate']) {
    if (Boolean(options[`${side}-dir`]) === Boolean(options[`${side}-ref`])) {
      throw new Error(`USAGE: give exactly one of --${side}-dir and --${side}-ref`)
    }
  }
  if (options.emit !== undefined && !['json', 'jsonl'].includes(options.emit)) throw new Error('USAGE: --emit is json or jsonl')
  return options
}

const readJsonFile = async file => JSON.parse(await readFile(file, 'utf8'))

export async function run(argv, { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    stderr.write(`${error.message}\n\n${HELP}`)
    return 2
  }
  if (options.help) {
    stdout.write(HELP)
    return 0
  }
  try {
    const load = async side => (options[`${side}-dir`]
      ? loadDirectory(options[`${side}-dir`])
      : loadGitRef(options[`${side}-ref`], { cwd }))
    const [baselineFiles, candidateFiles] = [await load('baseline'), await load('candidate')]

    const defaults = { projector: DOMAIN_REGISTER.default_versions.projector, resolvers: { ...DOMAIN_REGISTER.default_versions.resolvers } }
    let baselineVersions = { ...defaults, register: REGISTER_VERSION }
    let candidateVersions = { ...defaults, register: REGISTER_VERSION }
    let versionsSource = 'defaulted'
    if (options['versions-file']) {
      const file = await readJsonFile(options['versions-file'])
      baselineVersions = file.baseline
      candidateVersions = file.candidate
      versionsSource = 'file'
    }

    const result = runDomainPrecheck({
      baseline: { ...baselineFiles, versions: baselineVersions },
      candidate: {
        ...candidateFiles,
        versions: candidateVersions,
        sourceExport: {
          upstreamCommitSha: options['candidate-source-sha'],
          retrievedAt: options['source-retrieved-at'],
        },
      },
    })
    const domainRevisionIds = options['domain-revision-ids'] ? await readJsonFile(options['domain-revision-ids']) : {}
    const observation = buildObservation(result, {
      observedAt: options['observed-at'] ?? new Date().toISOString(),
      domainRevisionIds,
    })
    if (options.emit === 'jsonl') {
      stdout.write(serializeObservation(observation))
    } else {
      stdout.write(`${JSON.stringify({ ...result, versions_source: versionsSource, observation }, null, 2)}\n`)
    }
    return 0
  } catch (error) {
    stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2))
}
