import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

// Blueprint PR 4: result validation, status derivation and the server read
// boundary of /vector/blueprints (active LIVE catalog, own ownership, optional
// crew status). Supabase is replaced by a recording fake; no database access.

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [resultSource, readSource] = await Promise.all([
  read('lib/blueprints/blueprint-catalog-result.ts'),
  read('lib/blueprints/blueprint-catalog-read.ts'),
])
const code = source => source.replace(/\/\/.*$/gm, '')
const stripImports = source => source.replace(/^import\s[\s\S]*?['"][^'"\n]+['"];?[ \t]*$/gm, '')
const transpile = source => ts.transpileModule(stripImports(source), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const result = await load(transpile(resultSource))

const id = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const DATASET = { id: id(999999), source: 'SCMDB', channel: 'LIVE', version: '4.10.2-live.12913470', status: 'ACTIVE', blueprint_total: 1618 }
const catalogRow = (n, extra = {}) => ({
  blueprint_id: id(n), source_tag: `BP_CRAFT_${n}`, product_name: `Item ${n}`, gear: 'fpsgear',
  type: 'armour', subtype: 'combat', manufacturer: 'Behring', review_state: 'VALID', issues: [],
  scmdb_suggested_name: null, ...extra,
})

let state
const calls = []
function respond(call) {
  if (state.throwOn === call.table || state.throwOn === call.name) throw new Error('boom')
  const slice = rows => ({ data: rows.slice(call.range[0], call.range[1] + 1), error: null })
  if (call.table === 'scmdb_blueprint_datasets') return state.datasets
  if (call.table === 'scmdb_blueprint_catalog') return slice(state.catalog)
  if (call.table === 'user_blueprint_ownership') return state.ownError ? { data: null, error: state.ownError } : slice(state.own)
  if (call.name === 'get_active_crew_blueprint_status') return state.crewError ? { data: null, error: state.crewError } : slice(state.crew)
  throw new Error(`unexpected call ${JSON.stringify(call)}`)
}
function builder(call) {
  const b = {
    select(value) { call.select = value; return b },
    eq(key, value) { call.eq.push([key, value]); return b },
    order(key, options) { call.order = [key, options]; return b },
    range(from, to) { call.range = [from, to]; return b },
    then(resolve, reject) { return Promise.resolve().then(() => respond(call)).then(resolve, reject) },
  }
  return b
}
globalThis.__blueprintReadTest = {
  createSupabaseServerClient: () => ({
    from: table => { const call = { table, eq: [] }; calls.push(call); return builder(call) },
    rpc: (name, args) => { const call = { name, args, eq: [] }; calls.push(call); return builder(call) },
  }),
}
const boundary = await load(`
  const { createSupabaseServerClient } = globalThis.__blueprintReadTest;
  ${transpile(resultSource + '\n' + readSource)}
`)
function reset() {
  calls.length = 0
  state = {
    datasets: { data: [DATASET], error: null },
    catalog: Array.from({ length: 1618 }, (_, i) => catalogRow(i + 1)),
    own: [{ blueprint_id: id(1) }, { blueprint_id: id(2) }],
    crew: [
      { blueprint_id: id(1), status: 'SELF', crew_owner_nicknames: [] },
      { blueprint_id: id(2), status: 'SELF', crew_owner_nicknames: ['Bob'] },
      { blueprint_id: id(3), status: 'CREW', crew_owner_nicknames: ['adam', 'Bob'] },
    ],
    ownError: null,
    crewError: null,
    throwOn: null,
  }
}

test('reads only the active LIVE SCMDB dataset and pages the catalog without the recipe', async () => {
  reset()
  const data = await boundary.getBlueprintPageData()
  assert.equal(data.catalog.status, 'success')
  assert.equal(data.catalog.rows.length, 1618)
  assert.deepEqual(data.catalog.dataset, { id: DATASET.id, version: DATASET.version, blueprintTotal: 1618 })
  const datasetCall = calls.find(call => call.table === 'scmdb_blueprint_datasets')
  assert.deepEqual(datasetCall.eq, [['source', 'SCMDB'], ['channel', 'LIVE'], ['status', 'ACTIVE']])
  const catalogCalls = calls.filter(call => call.table === 'scmdb_blueprint_catalog')
  assert.deepEqual(catalogCalls.map(call => call.range), [[0, 999], [1000, 1999]])
  for (const call of catalogCalls) {
    assert.deepEqual(call.eq, [['dataset_id', DATASET.id]])
    assert.deepEqual(call.order, ['blueprint_id', { ascending: true }])
    assert.doesNotMatch(call.select, /recipe|scmdb_is_default|cig_data_error/)
  }
  assert.equal(calls.filter(call => call.table === 'scmdb_blueprint_reward_sources').length, 0)
})

test('an incomplete or malformed catalog fails closed', async () => {
  for (const mutate of [
    s => { s.catalog.pop() },
    s => { s.catalog.push(catalogRow(5000)) },
    s => { s.catalog[10] = catalogRow(10) },
    s => { s.catalog[3] = catalogRow(4, { review_state: 'VALID', issues: ['CIG_DATA_ERROR'] }) },
    s => { s.catalog[3] = catalogRow(4, { review_state: 'REVIEW_REQUIRED', issues: [] }) },
    s => { s.catalog[3] = catalogRow(4, { review_state: 'REVIEW_REQUIRED', issues: ['INVENTED'] }) },
    s => { s.catalog[3] = catalogRow(4, { blueprint_id: 'not-a-uuid' }) },
    s => { s.catalog[3] = catalogRow(4, { product_name: '  ' }) },
  ]) {
    reset(); mutate(state)
    assert.deepEqual((await boundary.getBlueprintPageData()).catalog, { status: 'read_error' })
  }
})

test('missing, duplicate or foreign-channel active datasets stop before further reads', async () => {
  reset(); state.datasets = { data: [], error: null }
  let data = await boundary.getBlueprintPageData()
  assert.deepEqual(data.catalog, { status: 'no_active_dataset' })
  assert.equal(calls.length, 1)
  for (const datasets of [
    { data: [DATASET, { ...DATASET, id: id(2) }], error: null },
    { data: [{ ...DATASET, channel: 'PTU' }], error: null },
    { data: [{ ...DATASET, status: 'STAGING' }], error: null },
    { data: null, error: { message: 'private details' } },
  ]) {
    reset(); state.datasets = datasets
    data = await boundary.getBlueprintPageData()
    assert.deepEqual(data, { catalog: { status: 'read_error' }, own: { status: 'read_error' }, crew: { status: 'read_error' } })
    assert.equal(calls.length, 1)
  }
})

test('own ownership comes from the RLS-scoped table and its failure never pretends "not known"', async () => {
  reset()
  let data = await boundary.getBlueprintPageData()
  assert.deepEqual(data.own, { status: 'success', ownedIds: [id(1), id(2)] })
  const ownCall = calls.find(call => call.table === 'user_blueprint_ownership')
  assert.equal(ownCall.select, 'blueprint_id')
  assert.deepEqual(ownCall.eq, [], 'no client-supplied user filter; RLS scopes the rows')
  reset(); state.ownError = { message: 'boom' }
  data = await boundary.getBlueprintPageData()
  assert.equal(data.catalog.status, 'success')
  assert.deepEqual(data.own, { status: 'read_error' })
  reset(); state.own = [{ blueprint_id: id(1) }, { blueprint_id: id(1) }]
  assert.deepEqual((await boundary.getBlueprintPageData()).own, { status: 'read_error' })
})

test('crew status is optional: its error contract maps without affecting catalog and own ownership', async () => {
  reset()
  let data = await boundary.getBlueprintPageData()
  assert.deepEqual(data.crew, { status: 'success', crewOwners: { [id(2)]: ['Bob'], [id(3)]: ['adam', 'Bob'] } })
  const crewCall = calls.find(call => call.name === 'get_active_crew_blueprint_status')
  assert.equal(crewCall.args, undefined, 'the crew RPC takes no arguments')
  for (const [message, status] of [
    ['ACTIVE_GROUP_REQUIRED', 'no_active_crew'],
    ['ACTIVE_GROUP_NOT_ALLOWED', 'not_allowed'],
    ['AUTH_REQUIRED', 'not_allowed'],
    ['private details', 'read_error'],
  ]) {
    reset(); state.crewError = { message }
    data = await boundary.getBlueprintPageData()
    assert.deepEqual(data.crew, { status })
    assert.equal(data.catalog.status, 'success')
    assert.equal(data.own.status, 'success')
  }
  reset(); state.crew = [{ blueprint_id: id(3), status: 'CREW', crew_owner_nicknames: [] }]
  assert.deepEqual((await boundary.getBlueprintPageData()).crew, { status: 'read_error' })
})

test('an unexpected exception makes every part unavailable', async () => {
  reset(); state.throwOn = 'scmdb_blueprint_catalog'
  assert.deepEqual(await boundary.getBlueprintPageData(),
    { catalog: { status: 'read_error' }, own: { status: 'read_error' }, crew: { status: 'read_error' } })
})

test('SELF > CREW > UNKNOWN; a missing row is "not known", never "not owned"', () => {
  assert.equal(result.deriveBlueprintStatus(true, ['Bob']), 'SELF')
  assert.equal(result.deriveBlueprintStatus(true, undefined), 'SELF')
  assert.equal(result.deriveBlueprintStatus(false, ['Bob']), 'CREW')
  assert.equal(result.deriveBlueprintStatus(false, []), 'UNKNOWN')
  assert.equal(result.deriveBlueprintStatus(false, undefined), 'UNKNOWN')
})

test('blueprint ids are canonical UUIDs only', () => {
  assert.equal(result.canonicalizeBlueprintId(` ${id(7).toUpperCase()} `), id(7))
  for (const value of ['', '7', 'abc', `${id(7)}x`, null, undefined, 7]) {
    assert.equal(result.canonicalizeBlueprintId(value), null)
  }
})

test('range paging stops on a short page and fails closed on errors or too many pages', async () => {
  const pages = []
  const fetchFrom = rows => async (from, to) => { pages.push([from, to]); return { data: rows.slice(from, to + 1), error: null } }
  let r = await result.readAllPages(fetchFrom(Array.from({ length: 4 }, (_, i) => i)), 2, 5)
  assert.deepEqual(r, { ok: true, rows: [0, 1, 2, 3] })
  assert.deepEqual(pages, [[0, 1], [2, 3], [4, 5]])
  r = await result.readAllPages(fetchFrom(Array.from({ length: 10 }, (_, i) => i)), 2, 3)
  assert.deepEqual(r, { ok: false, error: null })
  r = await result.readAllPages(async () => ({ data: null, error: { message: 'x' } }), 2, 3)
  assert.deepEqual(r, { ok: false, error: { message: 'x' } })
  r = await result.readAllPages(async () => ({ data: [1, 2, 3], error: null }), 2, 3)
  assert.deepEqual(r, { ok: false, error: null })
})

test('the read boundary uses the user session only', () => {
  assert.match(readSource, /^import 'server-only'/)
  assert.match(readSource, /createSupabaseServerClient\(\)/)
  assert.doesNotMatch(code(readSource), /supabase\/admin|service_role|SECRET/i)
  assert.doesNotMatch(code(readSource), /\.(insert|update|upsert|delete)\(/)
  assert.doesNotMatch(code(readSource), /PTU/)
})
