import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

// Blueprint PR 4: personal manual ownership write boundary and server action.
// Supabase is replaced by a recording fake; no RPC reaches a database.

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [resultSource, writeSource, actionSource] = await Promise.all([
  read('lib/blueprints/blueprint-catalog-result.ts'),
  read('lib/blueprints/blueprint-ownership-write.ts'),
  read('app/vector/blueprints/actions.ts'),
])
const code = source => source.replace(/\/\/.*$/gm, '')
const stripImports = source => source.replace(/^import\s[\s\S]*?['"][^'"\n]+['"];?[ \t]*$/gm, '')
const transpile = source => ts.transpileModule(stripImports(source), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const BP = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
let state
const calls = []
globalThis.__blueprintWriteTest = {
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
    rpc: async (name, args) => {
      calls.push({ name, args })
      if (state.throws) throw new Error('network details')
      return { data: null, error: state.rpcError }
    },
    from: () => { throw new Error('direct table access is not allowed') },
  }),
  setBlueprintOwnership: async (...args) => { calls.push({ action: args }); return state.actionResult },
}
const { setBlueprintOwnership } = await load(`
  const { createSupabaseServerClient } = globalThis.__blueprintWriteTest;
  ${transpile(resultSource + '\n' + writeSource)}
`)
const { submitBlueprintOwnership } = await load(`
  const { setBlueprintOwnership } = globalThis.__blueprintWriteTest;
  ${transpile(actionSource)}
`)
function reset() {
  calls.length = 0
  state = { user: { id: 'user-1' }, authError: null, rpcError: null, throws: false, actionResult: { ok: false, code: 'OWNERSHIP_UPDATE_FAILED' } }
}
const failure = code => ({ ok: false, code })

test('invalid ids and missing sessions stop before any RPC', async () => {
  for (const value of ['', 'abc', '123', `${BP}0`]) {
    reset()
    assert.deepEqual(await setBlueprintOwnership(value, 'MARK'), failure('BLUEPRINT_ID_INVALID'))
    assert.equal(calls.length, 0)
  }
  reset(); state.user = null
  assert.deepEqual(await setBlueprintOwnership(BP, 'MARK'), failure('AUTH_REQUIRED'))
  reset(); state.authError = { message: 'expired' }
  assert.deepEqual(await setBlueprintOwnership(BP, 'UNMARK'), failure('AUTH_REQUIRED'))
  assert.equal(calls.length, 0)
})

test('mark and unmark call only their RPC with the canonical id and no user id', async () => {
  reset()
  const marked = await setBlueprintOwnership(` ${BP.toUpperCase()} `, 'MARK')
  assert.equal(marked.ok, true)
  assert.equal(marked.code, 'OWNERSHIP_MARKED')
  assert.equal(marked.blueprintId, BP)
  assert.equal(typeof marked.confirmedAt, 'number')
  const unmarked = await setBlueprintOwnership(BP, 'UNMARK')
  assert.equal(unmarked.code, 'OWNERSHIP_UNMARKED')
  assert.deepEqual(calls, [
    { name: 'mark_blueprint_owned', args: { p_blueprint_id: BP } },
    { name: 'unmark_blueprint_owned', args: { p_blueprint_id: BP } },
  ])
})

test('repeating an action gives the same confirmed result (idempotent RPCs)', async () => {
  reset()
  const first = await setBlueprintOwnership(BP, 'MARK')
  const second = await setBlueprintOwnership(BP, 'MARK')
  assert.deepEqual([first.ok, first.code], [second.ok, second.code])
  const third = await setBlueprintOwnership(BP, 'UNMARK')
  const fourth = await setBlueprintOwnership(BP, 'UNMARK')
  assert.deepEqual([third.ok, third.code], [fourth.ok, fourth.code])
})

test('maps RPC errors without leaking database details', async () => {
  for (const [error, code] of [
    [{ message: 'AUTH_REQUIRED', code: '42501' }, 'AUTH_REQUIRED'],
    [{ message: 'BLUEPRINT_NOT_FOUND', code: 'P0002' }, 'BLUEPRINT_NOT_FOUND'],
    [{ message: 'permission denied for function x', details: 'secret' }, 'OWNERSHIP_UPDATE_FAILED'],
    [{}, 'OWNERSHIP_UPDATE_FAILED'],
  ]) {
    reset(); state.rpcError = error
    assert.deepEqual(await setBlueprintOwnership(BP, 'MARK'), failure(code))
  }
  reset(); state.throws = true
  assert.deepEqual(await setBlueprintOwnership(BP, 'MARK'), failure('OWNERSHIP_UPDATE_FAILED'))
})

test('the action forwards only blueprintId and a valid intent and does not revalidate the catalog', async () => {
  reset()
  const data = new FormData()
  data.set('blueprintId', BP)
  data.set('intent', 'MARK')
  data.set('user_id', 'someone-else')
  state.actionResult = { ok: true, code: 'OWNERSHIP_MARKED', blueprintId: BP, confirmedAt: 1 }
  assert.deepEqual(await submitBlueprintOwnership(data), state.actionResult)
  assert.deepEqual(calls, [{ action: [BP, 'MARK'] }])
  for (const intent of ['', 'DELETE', 'mark']) {
    reset(); data.set('intent', intent)
    assert.deepEqual(await submitBlueprintOwnership(data), failure('OWNERSHIP_ACTION_INVALID'))
    assert.equal(calls.length, 0)
  }
  assert.match(actionSource, /^'use server'/)
  assert.doesNotMatch(code(actionSource), /revalidatePath|user_id|userId/)
})

test('the write boundary uses the user session and the two ownership RPCs only', () => {
  assert.match(writeSource, /^import 'server-only'/)
  assert.match(writeSource, /createSupabaseServerClient\(\)/)
  assert.doesNotMatch(code(writeSource), /supabase\/admin|service_role|SECRET/i)
  assert.doesNotMatch(code(writeSource), /\.from\(|user_id|provenance/)
  assert.deepEqual([...writeSource.matchAll(/'([a-z_]+_blueprint_owned)'/g)].map(m => m[1]).sort(),
    ['mark_blueprint_owned', 'unmark_blueprint_owned'])
})
