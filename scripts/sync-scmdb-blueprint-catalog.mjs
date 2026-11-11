#!/usr/bin/env node
// Owner-side runner for the LIVE SCMDB blueprint catalog sync (Blueprint
// Ownership / Tracking PR 3).
//
//   Dry run (default, no network, no database, no secret needed):
//     node scripts/sync-scmdb-blueprint-catalog.mjs
//
//   Apply (a Production mutation: needs its own explicit owner GO, DB-ENV-04):
//     node --env-file=.env.local scripts/sync-scmdb-blueprint-catalog.mjs \
//       --apply --expect-version 4.10.2-live.12913470
//
// The runner reads only the repository-pinned LIVE mirror in data/scmdb/,
// builds the payload with lib/blueprints/blueprint-sync-payload.ts and, with
// --apply, makes exactly one call: the RPC sync_scmdb_blueprint_catalog().
// It never writes a table directly. The service_role secret
// (SUPABASE_SECRET_KEY) is read only on the apply path, is never printed and
// stays on the owner's machine. This file must never be imported by app/**,
// components/** or any other bundled code.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const DEFAULT_ROOT = new URL('../', import.meta.url)
const SYNC_RPC = 'sync_scmdb_blueprint_catalog'

const EXIT_OK = 0
const EXIT_FAILED = 1
const EXIT_USAGE = 2

// --- TypeScript module loading (no build step, no runtime dependency) -------

/**
 * Loads a repository TypeScript module by transpiling it and its relative
 * imports. Type-only imports disappear during transpilation; value imports
 * are rewritten to the transpiled dependency.
 */
async function loadTsModule(root, relativePath, cache = new Map()) {
  if (cache.has(relativePath)) return cache.get(relativePath)
  const source = await readFile(new URL(relativePath, root), 'utf8')
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const specifiers = new Set([...output.matchAll(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g)].map(m => m[2]))
  for (const specifier of specifiers) {
    const dependency = path.posix.join(path.posix.dirname(relativePath), `${specifier}.ts`)
    const url = await loadTsModule(root, dependency, cache)
    output = output.replaceAll(`'${specifier}'`, JSON.stringify(url)).replaceAll(`"${specifier}"`, JSON.stringify(url))
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
  cache.set(relativePath, url)
  return url
}

export async function loadBlueprintSyncModules(root = DEFAULT_ROOT) {
  const cache = new Map()
  const load = async file => import(await loadTsModule(root, file, cache))
  const [dataset, rewards, payload] = await Promise.all([
    load('lib/blueprints/blueprint-dataset.ts'),
    load('lib/blueprints/blueprint-reward-extractor.ts'),
    load('lib/blueprints/blueprint-sync-payload.ts'),
  ])
  return {
    prepareScmdbBlueprintDataset: dataset.prepareScmdbBlueprintDataset,
    extractScmdbBlueprintRewards: rewards.extractScmdbBlueprintRewards,
    unresolvedRewardBlueprints: rewards.unresolvedRewardBlueprints,
    buildScmdbBlueprintSyncPayload: payload.buildScmdbBlueprintSyncPayload,
    // Policy-free field mapping, exposed for database contract tests only;
    // run() never calls it.
    mapScmdbBlueprintSyncRows: payload.mapScmdbBlueprintSyncRows,
    SCMDB_BLUEPRINT_LIVE_SYNC_PIN: payload.SCMDB_BLUEPRINT_LIVE_SYNC_PIN,
  }
}

/** Reads one channel of the mirrored SCMDB data through the PR 1 readers. */
export async function readScmdbBlueprintChannel(channel, { root = DEFAULT_ROOT, modules } = {}) {
  const m = modules ?? await loadBlueprintSyncModules(root)
  const readJson = async file => JSON.parse(await readFile(new URL(`data/scmdb/${file}`, root), 'utf8'))
  const manifest = await readJson('latest.json')
  const files = manifest?.channels?.[String(channel).toLowerCase()]?.files
  if (!files) throw new Error('SCMDB_BLUEPRINT_SYNC_MANIFEST_CHANNEL_MISSING')
  const catalog = m.prepareScmdbBlueprintDataset(manifest, await readJson(files.crafting_blueprints), channel)
  const rewards = m.extractScmdbBlueprintRewards(manifest, await readJson(files.merged), channel)
  return { catalog, rewards }
}

/** Builds the payload of the repository-pinned LIVE dataset; fails closed. */
export async function buildPinnedLivePayload({ root = DEFAULT_ROOT, modules } = {}) {
  const m = modules ?? await loadBlueprintSyncModules(root)
  const { catalog, rewards } = await readScmdbBlueprintChannel('LIVE', { root, modules: m })
  return { payload: m.buildScmdbBlueprintSyncPayload(catalog, rewards), pin: m.SCMDB_BLUEPRINT_LIVE_SYNC_PIN }
}

// --- Command line ------------------------------------------------------------

export function parseArgs(argv) {
  const options = { apply: false, expectVersion: null, channel: 'LIVE', help: false }
  const args = [...argv]
  const value = (flag, inline) => {
    if (inline !== undefined) return inline
    const next = args.shift()
    if (next === undefined || next.startsWith('--')) throw new Error(`USAGE: ${flag} needs a value`)
    return next
  }
  while (args.length) {
    const arg = args.shift()
    const [flag, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined]
    switch (flag) {
      case '--apply':
        if (inline !== undefined) throw new Error('USAGE: --apply takes no value')
        options.apply = true
        break
      case '--expect-version':
        options.expectVersion = value(flag, inline)
        break
      case '--channel':
        options.channel = value(flag, inline)
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new Error(`USAGE: unknown argument ${JSON.stringify(arg)}`)
    }
  }
  return options
}

const HELP = `Usage:
  node scripts/sync-scmdb-blueprint-catalog.mjs
      Dry run: reads the pinned LIVE mirror, builds and validates the payload.
      No network, no database, no secret.

  node --env-file=.env.local scripts/sync-scmdb-blueprint-catalog.mjs --apply --expect-version <version>
      Calls only the RPC ${SYNC_RPC}() with the service_role secret.
      Writes to Supabase Production: needs a separate explicit owner GO (DB-ENV-04).
      Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.

LIVE only. PTU is rejected.`

async function defaultCreateClient(url, key) {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Runs the sync command. All side effects are injected so that the contract
 * can be tested without network or database. Returns the process exit code.
 */
export async function run({
  argv = [],
  env = {},
  stdout = process.stdout,
  stderr = process.stderr,
  createClient = defaultCreateClient,
  root = DEFAULT_ROOT,
} = {}) {
  let secret = ''
  const redact = text => {
    const s = String(text)
    return secret ? s.split(secret).join('[REDACTED]') : s
  }
  const out = text => stdout.write(`${redact(text)}\n`)
  const err = text => stderr.write(`${redact(text)}\n`)

  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    err(error.message)
    err(HELP)
    return EXIT_USAGE
  }
  if (options.help) {
    out(HELP)
    return EXIT_OK
  }
  if (options.channel !== 'LIVE') {
    err(`SCMDB_BLUEPRINT_SYNC_CHANNEL_UNSUPPORTED: only LIVE is supported (got ${JSON.stringify(options.channel)}); PTU is out of scope`)
    return EXIT_USAGE
  }
  if (!options.apply && options.expectVersion !== null) {
    err('USAGE: --expect-version is only valid together with --apply')
    return EXIT_USAGE
  }

  try {
    const modules = await loadBlueprintSyncModules(root)
    const pin = modules.SCMDB_BLUEPRINT_LIVE_SYNC_PIN

    let url = ''
    if (options.apply) {
      if (options.expectVersion === null) {
        err(`USAGE: --apply requires --expect-version ${pin.version}`)
        return EXIT_USAGE
      }
      if (options.expectVersion !== pin.version) {
        err(`SCMDB_BLUEPRINT_SYNC_VERSION_MISMATCH: expected ${JSON.stringify(options.expectVersion)}, repository pin is ${JSON.stringify(pin.version)}`)
        return EXIT_USAGE
      }
      url = typeof env.NEXT_PUBLIC_SUPABASE_URL === 'string' ? env.NEXT_PUBLIC_SUPABASE_URL.trim() : ''
      secret = typeof env.SUPABASE_SECRET_KEY === 'string' ? env.SUPABASE_SECRET_KEY.trim() : ''
      const missing = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !secret && 'SUPABASE_SECRET_KEY'].filter(Boolean)
      if (missing.length) {
        err(`SUPABASE_SERVER_ENV_MISSING: ${missing.join(', ')}`)
        return EXIT_USAGE
      }
    }

    // Build and validate before any client exists; a failure stops here.
    const { payload } = await buildPinnedLivePayload({ root, modules })
    if (payload.p_version !== pin.version) throw new Error('SCMDB_BLUEPRINT_PAYLOAD_PIN_MISMATCH')

    const counts = [
      `blueprints: ${payload.p_blueprint_total} (valid ${payload.p_blueprint_valid}, review required ${payload.p_blueprint_review_required})`,
      `rewards: ${payload.p_reward_total} (duplicate source rows ${payload.p_duplicate_source_rows})`,
    ]

    if (!options.apply) {
      // Dry run: non-sensitive validation details only.
      out('SCMDB blueprint catalog sync — DRY RUN (no network, no database)')
      out(`channel: ${payload.p_channel}`)
      out(`version: ${payload.p_version}`)
      out(`catalog file: ${payload.p_catalog_source_file}`)
      out(`reward file: ${payload.p_reward_source_file}`)
      counts.forEach(out)
      out('payload: valid')
      out(`Writing needs a separate owner GO and: --apply --expect-version ${pin.version}`)
      return EXIT_OK
    }

    // Apply: the successful result is the dataset id and the counts, nothing else.
    const client = await createClient(url, secret)
    const { data, error } = await client.rpc(SYNC_RPC, payload)
    if (error) {
      err(`SCMDB_BLUEPRINT_SYNC_RPC_FAILED: ${[error.code, error.message].filter(Boolean).join(' ')}`)
      return EXIT_FAILED
    }
    if (typeof data !== 'string' || !UUID.test(data)) {
      err('SCMDB_BLUEPRINT_SYNC_RPC_UNEXPECTED_RESULT')
      return EXIT_FAILED
    }
    out(`dataset id: ${data}`)
    counts.forEach(out)
    return EXIT_OK
  } catch (error) {
    err(error instanceof Error ? error.message : 'SCMDB_BLUEPRINT_SYNC_FAILED')
    return EXIT_FAILED
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  process.exitCode = await run({ argv: process.argv.slice(2), env: process.env })
}
