import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseArgs, run } from '../scripts/sync-scmdb-blueprint-catalog.mjs'

// Blueprint PR 3: contract of the owner-side runner
// scripts/sync-scmdb-blueprint-catalog.mjs. Network, environment and the
// Supabase client are injected or trapped; nothing here reaches Production.

const VERSION = '4.10.2-live.12913470'
const SECRET = 'sb_secret_TEST-ONLY-0123456789abcdefghijklmnop'
const URL_ = 'https://example.invalid'
const ENV = { NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: SECRET }
const DATASET_ID = '11111111-2222-4333-8444-555555555555'
const APPLY = ['--apply', '--expect-version', VERSION]

const capture = () => {
  const lines = []
  return { lines, write: text => { lines.push(String(text)) }, text: () => lines.join('') }
}

/** A client that only allows rpc() and records every call and any other access. */
function fakeClient(result = { data: DATASET_ID, error: null }) {
  const calls = []
  const forbidden = []
  const client = new Proxy({}, {
    get(_, prop) {
      if (prop === 'rpc') return async (name, args) => { calls.push({ name, args }); return result }
      if (prop === 'then') return undefined
      forbidden.push(String(prop))
      return () => { throw new Error(`forbidden client access: ${String(prop)}`) }
    },
  })
  const created = []
  const createClient = async (url, key) => { created.push({ url, key }); return client }
  return { calls, forbidden, created, createClient }
}

const noClient = async () => { throw new Error('a Supabase client must not be created') }

async function exec(argv, { env = ENV, createClient = noClient } = {}) {
  const stdout = capture()
  const stderr = capture()
  const code = await run({ argv, env, stdout, stderr, createClient })
  return { code, out: stdout.text(), err: stderr.text() }
}

test('PR 3 runner: the dry run needs no client, no environment and no network', async () => {
  const fetchCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (...args) => { fetchCalls.push(args); throw new Error('network is forbidden') }
  const env = new Proxy({}, { get(_, prop) { throw new Error(`environment read: ${String(prop)}`) } })
  try {
    const { code, out, err } = await exec([], { env })
    assert.equal(code, 0, err)
    assert.match(out, /DRY RUN \(no network, no database\)/)
    assert.match(out, new RegExp(`version: ${VERSION}`))
    assert.match(out, /blueprints: 1618 \(valid 1610, review required 8\)/)
    assert.match(out, /rewards: 7480 \(duplicate source rows 4\)/)
    assert.match(out, /payload: valid/)
    assert.equal(err, '')
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(fetchCalls.length, 0)
})

test('PR 3 runner: --apply requires --expect-version with the pinned version', async () => {
  const client = fakeClient()
  let r = await exec(['--apply'], { createClient: client.createClient })
  assert.equal(r.code, 2)
  assert.match(r.err, /--apply requires --expect-version 4\.10\.2-live\.12913470/)

  r = await exec(['--apply', '--expect-version', '4.10.3-ptu.13032516'], { createClient: client.createClient })
  assert.equal(r.code, 2)
  assert.match(r.err, /SCMDB_BLUEPRINT_SYNC_VERSION_MISMATCH/)

  r = await exec(['--apply', '--expect-version=4.10.2-live.1'], { createClient: client.createClient })
  assert.equal(r.code, 2)
  r = await exec(['--expect-version', VERSION], { createClient: client.createClient })
  assert.equal(r.code, 2)
  assert.match(r.err, /only valid together with --apply/)
  r = await exec(['--apply', '--expect-version'], { createClient: client.createClient })
  assert.equal(r.code, 2)

  assert.equal(client.created.length, 0)
  assert.equal(client.calls.length, 0)
})

test('PR 3 runner: missing environment values are rejected before any client exists', async () => {
  for (const env of [{}, { NEXT_PUBLIC_SUPABASE_URL: URL_ }, { SUPABASE_SECRET_KEY: SECRET },
    { NEXT_PUBLIC_SUPABASE_URL: ' ', SUPABASE_SECRET_KEY: SECRET }, { NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: '' }]) {
    const client = fakeClient()
    const { code, out, err } = await exec(APPLY, { env, createClient: client.createClient })
    assert.equal(code, 2)
    assert.match(err, /SUPABASE_SERVER_ENV_MISSING/)
    assert.ok(!(out + err).includes(SECRET))
    assert.equal(client.created.length, 0)
  }
})

test('PR 3 runner: PTU, other channels and unknown arguments are rejected', async () => {
  for (const argv of [['--channel', 'PTU'], ['--channel=ptu'], ['--channel', 'LIVE-PTU'], [...APPLY, '--channel', 'PTU'],
    ['--ptu'], ['--force'], ['--apply=yes', '--expect-version', VERSION], ['extra']]) {
    const client = fakeClient()
    const { code } = await exec(argv, { createClient: client.createClient })
    assert.equal(code, 2, argv.join(' '))
    assert.equal(client.created.length, 0)
  }
  assert.equal(parseArgs(['--channel', 'LIVE']).channel, 'LIVE')
})

test('PR 3 runner: apply makes exactly one RPC call to sync_scmdb_blueprint_catalog', async () => {
  const client = fakeClient()
  const { code, out, err } = await exec(APPLY, { createClient: client.createClient })
  assert.equal(code, 0, err)
  assert.deepEqual(client.created, [{ url: URL_, key: SECRET }])
  assert.deepEqual(client.forbidden, [])
  assert.equal(client.calls.length, 1)
  const [{ name, args }] = client.calls
  assert.equal(name, 'sync_scmdb_blueprint_catalog')
  assert.deepEqual(Object.keys(args), ['p_source', 'p_channel', 'p_version', 'p_catalog_source_file',
    'p_reward_source_file', 'p_blueprint_total', 'p_blueprint_valid', 'p_blueprint_review_required',
    'p_reward_total', 'p_duplicate_source_rows', 'p_blueprints', 'p_rewards'])
  assert.equal(args.p_channel, 'LIVE')
  assert.equal(args.p_version, VERSION)
  assert.equal(args.p_blueprints.length, 1618)
  assert.equal(args.p_rewards.length, 7480)
  assert.equal(args.p_duplicate_source_rows, 4)
  assert.match(out, new RegExp(`dataset id: ${DATASET_ID}`))
  assert.match(out, /blueprints: 1618 \(valid 1610, review required 8\)/)
  assert.match(out, /rewards: 7480 \(duplicate source rows 4\)/)
  assert.ok(!(out + err).includes(SECRET))
})

test('PR 3 runner: RPC errors and unexpected results fail; the secret is never printed', async () => {
  let client = fakeClient({ data: null, error: { code: '22023', message: `SCMDB_BLUEPRINT_SYNC_COUNT_MISMATCH ${SECRET}` } })
  let r = await exec(APPLY, { createClient: client.createClient })
  assert.equal(r.code, 1)
  assert.match(r.err, /SCMDB_BLUEPRINT_SYNC_RPC_FAILED: 22023 SCMDB_BLUEPRINT_SYNC_COUNT_MISMATCH \[REDACTED\]/)
  assert.ok(!(r.out + r.err).includes(SECRET))
  assert.equal(client.calls.length, 1)

  client = fakeClient({ data: 'not-a-uuid', error: null })
  r = await exec(APPLY, { createClient: client.createClient })
  assert.equal(r.code, 1)
  assert.match(r.err, /SCMDB_BLUEPRINT_SYNC_RPC_UNEXPECTED_RESULT/)

  r = await exec(APPLY, { createClient: async () => { throw new Error(`connect failed for ${SECRET}`) } })
  assert.equal(r.code, 1)
  assert.match(r.err, /connect failed for \[REDACTED\]/)
  assert.ok(!(r.out + r.err).includes(SECRET))
})

// --- Static guards -----------------------------------------------------------

const root = new URL('../', import.meta.url)
async function sourceFiles(dir) {
  const result = []
  let entries
  try { entries = await readdir(new URL(dir, root), { withFileTypes: true }) } catch { return result }
  for (const entry of entries) {
    const path = `${dir}${entry.name}`
    if (entry.isDirectory()) result.push(...await sourceFiles(`${path}/`))
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) result.push(path)
  }
  return result
}

test('PR 3 runner: no app, component or library code imports the runner', async () => {
  const files = [...await sourceFiles('app/'), ...await sourceFiles('components/'), ...await sourceFiles('lib/'),
    ...await sourceFiles('src/'), 'middleware.ts']
  assert.ok(files.length > 10)
  for (const file of files) {
    const text = await readFile(new URL(file, root), 'utf8')
    assert.doesNotMatch(text, /sync-scmdb-blueprint-catalog|scripts\//, file)
    assert.doesNotMatch(text, /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE)/, file)
    if (/^\s*['"]use client['"]/m.test(text)) assert.doesNotMatch(text, /blueprint-sync-payload|supabase\/admin/, file)
  }
})

test('PR 3 runner: the only database call in the runner is the sync RPC', async () => {
  const source = await readFile(new URL('scripts/sync-scmdb-blueprint-catalog.mjs', root), 'utf8')
  const code = source.replace(/^\s*\/\/.*$/gm, '')
  assert.equal([...code.matchAll(/\.rpc\(/g)].length, 1)
  assert.match(code, /const SYNC_RPC = 'sync_scmdb_blueprint_catalog'/)
  assert.match(code, /client\.rpc\(SYNC_RPC, payload\)/)
  assert.doesNotMatch(code, /(?<!Buffer)\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.schema\(|execute_sql|postgres:\/\//)
  // The apply path sends only the fail-closed builder's output.
  const runBody = code.slice(code.indexOf('export async function run('))
  assert.doesNotMatch(runBody, /mapScmdbBlueprintSyncRows/)
  assert.match(runBody, /buildPinnedLivePayload/)
  // The secret is only read on the apply path and only from the given env.
  assert.equal([...code.matchAll(/SUPABASE_SECRET_KEY/g)].length >= 1, true)
  assert.doesNotMatch(code, /process\.env\.SUPABASE_SECRET_KEY/)
})
