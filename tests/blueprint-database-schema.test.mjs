import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { addBlueprint, addUser, as, createDb, migration, productionContractFixture, uuid } from './blueprint-db-fixture.mjs'

// Blueprint PR 2 contract tests A (schema), B (catalog security),
// E (function security) and migration quality.

const tables = [
  'scmdb_blueprint_datasets',
  'blueprints',
  'scmdb_blueprint_catalog',
  'scmdb_blueprint_reward_sources',
  'user_blueprint_ownership',
]
const catalogTables = tables.slice(0, 4)
const functions = {
  sync: 'public.sync_scmdb_blueprint_catalog(text, text, text, text, text, integer, integer, integer, integer, integer, jsonb, jsonb)',
  mark: 'public.mark_blueprint_owned(uuid)',
  unmark: 'public.unmark_blueprint_owned(uuid)',
  crew: 'public.get_active_crew_blueprint_status()',
}

const db = await createDb()
// Static checks look at executable SQL only, not at explanatory comments.
const code = migration.replace(/--.*$/gm, '')

async function constraints(table, type) {
  const { rows } = await db.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype = $2 ORDER BY conname`,
    [`public.${table}`, type],
  )
  return rows
}
const rejects = (promise, pattern) => assert.rejects(promise, pattern)

// ---------------------------------------------------------------------------
// A. Schema
// ---------------------------------------------------------------------------

test('A: all five tables exist with RLS enabled and not forced', async () => {
  const { rows } = await db.query(
    `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1) ORDER BY relname`,
    [tables],
  )
  assert.deepEqual(rows.map(r => r.relname).sort(), [...tables].sort())
  assert.ok(rows.every(r => r.relrowsecurity === true && r.relforcerowsecurity === false))
})

test('A: primary keys', async () => {
  const expected = {
    scmdb_blueprint_datasets: 'PRIMARY KEY (id)',
    blueprints: 'PRIMARY KEY (id)',
    scmdb_blueprint_catalog: 'PRIMARY KEY (dataset_id, blueprint_id)',
    scmdb_blueprint_reward_sources: 'PRIMARY KEY (id)',
    user_blueprint_ownership: 'PRIMARY KEY (user_id, blueprint_id)',
  }
  for (const [table, def] of Object.entries(expected)) {
    assert.deepEqual((await constraints(table, 'p')).map(c => c.def), [def], table)
  }
})

test('A: foreign keys; ownership points only at the stable blueprint identity', async () => {
  const fks = async table => (await constraints(table, 'f')).map(c => c.def).sort()
  assert.deepEqual(await fks('scmdb_blueprint_datasets'), [])
  assert.deepEqual(await fks('blueprints'), [])
  assert.deepEqual(await fks('scmdb_blueprint_catalog'), [
    'FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE RESTRICT',
    'FOREIGN KEY (dataset_id) REFERENCES scmdb_blueprint_datasets(id) ON DELETE CASCADE',
  ])
  assert.deepEqual(await fks('scmdb_blueprint_reward_sources'), [
    'FOREIGN KEY (dataset_id) REFERENCES scmdb_blueprint_datasets(id) ON DELETE CASCADE',
    'FOREIGN KEY (dataset_id, blueprint_id) REFERENCES scmdb_blueprint_catalog(dataset_id, blueprint_id) ON DELETE CASCADE',
  ])
  assert.deepEqual(await fks('user_blueprint_ownership'), [
    'FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE RESTRICT',
    'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
  ])
})

test('A: unique constraints; blueprint_id is not part of the source-occurrence key', async () => {
  assert.deepEqual((await constraints('scmdb_blueprint_datasets', 'u')).map(c => c.def),
    ['UNIQUE (source, channel, version)'])
  assert.deepEqual((await constraints('blueprints', 'u')).map(c => c.def),
    ['UNIQUE (source, source_guid)'])
  const occurrence = await constraints('scmdb_blueprint_reward_sources', 'u')
  assert.deepEqual(occurrence, [{
    conname: 'scmdb_blueprint_reward_sources_occurrence_key',
    def: 'UNIQUE (dataset_id, source_contract_id, source_reward_index, source_pool_guid, source_pool_entry_index)',
  }])
  assert.doesNotMatch(occurrence[0].def, /blueprint_id/)
  assert.deepEqual(await constraints('scmdb_blueprint_catalog', 'u'), [])
  assert.deepEqual(await constraints('user_blueprint_ownership', 'u'), [])
})

test('A: relevant indexes', async () => {
  const { rows } = await db.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [tables],
  )
  const byName = Object.fromEntries(rows.map(r => [r.indexname, r.indexdef]))
  assert.match(byName.scmdb_blueprint_datasets_active_channel_idx,
    /UNIQUE INDEX .* \(source, channel\) WHERE \(status = 'ACTIVE'::text\)/)
  assert.match(byName.scmdb_blueprint_catalog_blueprint_id_idx, /\(blueprint_id\)/)
  assert.match(byName.scmdb_blueprint_reward_sources_dataset_blueprint_idx, /\(dataset_id, blueprint_id\)/)
  assert.match(byName.user_blueprint_ownership_blueprint_id_idx, /\(blueprint_id\)/)
})

test('A: checks reject invalid catalog and ownership values', async () => {
  const dataset = (overrides = {}) => {
    const row = {
      source: 'SCMDB', channel: 'LIVE', version: 'v-check', catalog_source_file: 'c.json',
      reward_source_file: 'm.json', status: 'STAGING', blueprint_total: 1, blueprint_valid: 1,
      blueprint_review_required: 0, reward_total: 1, duplicate_source_rows: 0, ...overrides,
    }
    const keys = Object.keys(row)
    return db.query(
      `INSERT INTO public.scmdb_blueprint_datasets (${keys.join(',')})
       VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row))
  }
  await rejects(dataset({ source: 'UEX' }), /check constraint/)
  await rejects(dataset({ channel: 'TECH' }), /check constraint/)
  await rejects(dataset({ status: 'DONE' }), /check constraint/)
  await rejects(dataset({ blueprint_valid: 0 }), /scmdb_blueprint_datasets_blueprint_counts_check/)
  await rejects(dataset({ duplicate_source_rows: 2 }), /scmdb_blueprint_datasets_duplicate_rows_check/)
  await rejects(dataset({ version: '  ' }), /check constraint/)

  await rejects(db.query(`INSERT INTO public.blueprints (source, source_guid) VALUES ('SCMDB', 'ABC')`),
    /check constraint/)
  await rejects(db.query(`INSERT INTO public.blueprints (source, source_guid)
    VALUES ('SCMDB', '0000000A-0000-4000-8000-000000000001')`), /check constraint/)

  await dataset({ version: 'v-ok' })
  const { rows: [{ id: datasetId }] } = await db.query(
    `SELECT id FROM public.scmdb_blueprint_datasets WHERE version = 'v-ok'`)
  const blueprintId = await addBlueprint(db, 900)
  const catalog = (state, issues) => db.query(
    `INSERT INTO public.scmdb_blueprint_catalog (dataset_id, blueprint_id, source_tag, product_entity_class,
       gear, recipe, scmdb_is_default, cig_data_error, review_state, issues)
     VALUES ($1, $2, 't', 'c', 'g', '{"craftTimeSeconds":0,"slots":[]}', false, false, $3, $4::text[])`,
    [datasetId, blueprintId, state, issues])
  await rejects(catalog('VALID', ['RECIPE_MISSING']), /review_consistency_check/)
  await rejects(catalog('REVIEW_REQUIRED', []), /review_consistency_check/)
  await rejects(catalog('REVIEW_REQUIRED', ['GUESSED']), /issue_vocabulary_check/)
  await rejects(catalog('PENDING', []), /check constraint/)

  await addUser(db, uuid(901), 'checkuser')
  const own = provenance => db.query(
    `INSERT INTO public.user_blueprint_ownership (user_id, blueprint_id, provenance) VALUES ($1, $2, $3)`,
    [uuid(901), blueprintId, provenance])
  await rejects(own('PLEDGE'), /check constraint/)
  // Prepared provenance values are accepted by the table (not writable via RPC).
  await own('GAME_LOG')
  await db.query('DELETE FROM public.user_blueprint_ownership WHERE user_id = $1', [uuid(901)])
  await own('COMPANION')
  await rejects(own('MANUAL'), /duplicate key/)
  await db.query('DELETE FROM public.user_blueprint_ownership WHERE user_id = $1', [uuid(901)])
  await db.query('DELETE FROM public.scmdb_blueprint_datasets WHERE version = $1', ['v-ok'])
})

// ---------------------------------------------------------------------------
// B. Catalog security
// ---------------------------------------------------------------------------

test('B: authenticated reads the catalog; anon does not', async () => {
  for (const table of catalogTables) {
    await as(db, 'authenticated', uuid(1), tx => tx.query(`SELECT count(*) FROM public.${table}`))
    await rejects(as(db, 'anon', null, tx => tx.query(`SELECT count(*) FROM public.${table}`)),
      /permission denied/)
  }
})

test('B: no direct catalog write for authenticated or anon users', async () => {
  const writes = table => [
    `DELETE FROM public.${table}`,
    `UPDATE public.${table} SET created_at = now()`.replace(
      'created_at', table === 'blueprints' ? 'first_seen_at' : 'created_at'),
    `TRUNCATE public.${table} CASCADE`,
  ]
  for (const role of ['authenticated', 'anon']) {
    for (const table of catalogTables) {
      for (const sql of writes(table)) {
        await rejects(as(db, role, uuid(1), tx => tx.query(sql)), /permission denied/, `${role}: ${sql}`)
      }
    }
    await rejects(as(db, role, uuid(1), tx => tx.query(
      `INSERT INTO public.blueprints (source, source_guid) VALUES ('SCMDB', $1)`, [uuid(777)])),
    /permission denied/)
    await rejects(as(db, role, uuid(1), tx => tx.query(
      `SELECT ${functions.sync.replace(/\(.*/, '')}('SCMDB','LIVE','v','c','m',0,0,0,0,0,'[]','[]')`)),
    /permission denied/)
  }
})

test('B/C: explicit table privileges override wide default privileges', async () => {
  const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
  const expected = {
    authenticated: { catalog: ['SELECT'], blueprints: ['SELECT'], ownership: ['SELECT'] },
    anon: { catalog: [], blueprints: [], ownership: [] },
    service_role: {
      catalog: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      blueprints: ['SELECT', 'INSERT'],
      ownership: [],
    },
  }
  for (const [role, groups] of Object.entries(expected)) {
    for (const table of tables) {
      const group = table === 'blueprints' ? 'blueprints'
        : table === 'user_blueprint_ownership' ? 'ownership' : 'catalog'
      const granted = []
      for (const privilege of privileges) {
        const { rows } = await db.query('SELECT has_table_privilege($1, $2, $3) AS ok',
          [role, `public.${table}`, privilege])
        if (rows[0].ok) granted.push(privilege)
      }
      assert.deepEqual(granted, groups[group], `${role} on ${table}`)
    }
  }
  const { rows } = await db.query(
    `SELECT c.relname FROM pg_class c, aclexplode(c.relacl) a
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1) AND a.grantee = 0`, [tables])
  assert.deepEqual(rows, [], 'no PUBLIC table grants')
})

// ---------------------------------------------------------------------------
// E. Function security
// ---------------------------------------------------------------------------

test('E: SECURITY DEFINER only where required, always with search_path = \'\'', async () => {
  const expected = { sync: false, mark: true, unmark: true, crew: true }
  for (const [key, signature] of Object.entries(functions)) {
    const { rows: [fn] } = await db.query(
      `SELECT prosecdef, proconfig, provolatile FROM pg_proc WHERE oid = $1::regprocedure`, [signature])
    assert.equal(fn.prosecdef, expected[key], key)
    assert.deepEqual(fn.proconfig, ['search_path=""'], key)
  }
  const { rows: [crew] } = await db.query(
    `SELECT provolatile FROM pg_proc WHERE oid = $1::regprocedure`, [functions.crew])
  assert.equal(crew.provolatile, 's')
})

test('E: EXECUTE is revoked from PUBLIC and anon and granted only as required', async () => {
  const expected = {
    sync: { anon: false, authenticated: false, service_role: true },
    mark: { anon: false, authenticated: true, service_role: false },
    unmark: { anon: false, authenticated: true, service_role: false },
    crew: { anon: false, authenticated: true, service_role: false },
  }
  for (const [key, roles] of Object.entries(expected)) {
    for (const [role, ok] of Object.entries(roles)) {
      const { rows } = await db.query('SELECT has_function_privilege($1, $2, \'EXECUTE\') AS ok',
        [role, functions[key]])
      assert.equal(rows[0].ok, ok, `${role} ${key}`)
    }
    const { rows } = await db.query(
      `SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = $1::regprocedure AND a.grantee = 0`,
      [functions[key]])
    assert.deepEqual(rows, [], `no PUBLIC EXECUTE on ${key}`)
  }
})

test('E: ownership RPCs take no user id; function bodies use fully qualified names', async () => {
  for (const key of ['mark', 'unmark']) {
    const { rows: [fn] } = await db.query(
      `SELECT proargnames, pronargs FROM pg_proc WHERE oid = $1::regprocedure`, [functions[key]])
    assert.equal(fn.pronargs, 1)
    assert.deepEqual(fn.proargnames, ['p_blueprint_id'])
  }
  const { rows: [crew] } = await db.query(
    `SELECT pronargs FROM pg_proc WHERE oid = $1::regprocedure`, [functions.crew])
  assert.equal(crew.pronargs, 0)

  const relations = [...tables, 'profiles', 'groups', 'group_members', 'user_settings', 'users']
  for (const [key, signature] of Object.entries(functions)) {
    const { rows: [{ src }] } = await db.query(
      `SELECT prosrc AS src FROM pg_proc WHERE oid = $1::regprocedure`, [signature])
    for (const relation of relations) {
      const unqualified = new RegExp(`(?<![.\\w])${relation}(?=\\s|\\.|%|$)`, 'g')
      const hits = [...src.matchAll(unqualified)].filter(m => {
        const before = src.slice(Math.max(0, m.index - 30), m.index)
        // Column names and aliases are not relation references.
        return /(FROM|JOIN|INTO|UPDATE|TABLE)\s+$/i.test(before)
      })
      assert.deepEqual(hits.map(m => m[0]), [], `${key} references ${relation} unqualified`)
    }
    assert.match(src, /auth\.uid\(\)|p_source/, key)
  }
  assert.doesNotMatch(code, /is_group_member|is_group_admin|set_active_group|get_active_group_inventory\s*\(/)
})

// ---------------------------------------------------------------------------
// Migration quality
// ---------------------------------------------------------------------------

test('migration creates objects only and imports no data', async () => {
  const fresh = await createDb()
  try {
    for (const table of tables) {
      const { rows } = await fresh.query(`SELECT count(*)::int AS n FROM public.${table}`)
      assert.equal(rows[0].n, 0, table)
    }
  } finally { await fresh.close() }
  assert.doesNotMatch(code, /\bINSERT INTO public\.\w+[\s\S]*?VALUES\s*\('SCMDB'/)
})

test('migration does not modify existing tables, policies or functions', () => {
  const existing = /(ALTER|DROP)\s+(TABLE|POLICY|FUNCTION)\s+(IF EXISTS\s+)?(public\.)?(profiles|groups|group_members|user_settings|inventory\w*|scmdb_location\w*)/i
  assert.doesNotMatch(code, existing)
  assert.doesNotMatch(code, /CREATE OR REPLACE|(TABLE|INDEX|FUNCTION|SCHEMA|POLICY)\s+IF NOT EXISTS|\bDROP\s+(TABLE|FUNCTION|POLICY|INDEX|TRIGGER|COLUMN|CONSTRAINT)\b/i)
  assert.doesNotMatch(code, /ON public\.(profiles|groups|group_members|user_settings)\b/)
  assert.match(migration, /^BEGIN;/m)
  assert.match(migration, /^COMMIT;\s*$/m)
})

test('migration fails closed on an unexpected existing blueprint object', async () => {
  const fresh = new PGlite()
  try {
    await fresh.exec(productionContractFixture)
    await fresh.exec('CREATE TABLE public.blueprints (id integer PRIMARY KEY)')
    await rejects(fresh.exec(migration), /already exists/)
    await fresh.exec('ROLLBACK')
    const { rows } = await fresh.query(`SELECT to_regclass('public.scmdb_blueprint_datasets') AS t`)
    assert.equal(rows[0].t, null, 'nothing partial remains')
  } finally { await fresh.close() }

  const twice = await createDb()
  try {
    await rejects(twice.exec(migration), /BLUEPRINT_MIGRATION_EXISTING_FUNCTION/)
  } finally { await twice.close() }
})

test('migration fails closed on any existing overload of the new function names', async () => {
  const overloads = [
    'CREATE FUNCTION public.mark_blueprint_owned(p_blueprint_id uuid, p_user_id uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$',
    'CREATE FUNCTION public.sync_scmdb_blueprint_catalog() RETURNS void LANGUAGE sql AS $$ SELECT $$',
    'CREATE FUNCTION public.unmark_blueprint_owned(text) RETURNS void LANGUAGE sql AS $$ SELECT $$',
    'CREATE FUNCTION public.get_active_crew_blueprint_status(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$',
  ]
  for (const overload of overloads) {
    const fresh = new PGlite()
    try {
      await fresh.exec(productionContractFixture)
      await fresh.exec(overload)
      await rejects(fresh.exec(migration), /BLUEPRINT_MIGRATION_EXISTING_FUNCTION/)
      await fresh.exec('ROLLBACK')
      const { rows: [state] } = await fresh.query(`SELECT
        (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname IN ('scmdb_blueprint_datasets', 'blueprints',
            'scmdb_blueprint_catalog', 'scmdb_blueprint_reward_sources', 'user_blueprint_ownership')) AS tables,
        (SELECT array_agg(p.oid::regprocedure::text ORDER BY 1) FROM pg_catalog.pg_proc p
          JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname IN ('sync_scmdb_blueprint_catalog', 'mark_blueprint_owned',
            'unmark_blueprint_owned', 'get_active_crew_blueprint_status')) AS functions`)
      assert.equal(state.tables, 0, 'no table created')
      // Only the pre-existing overload remains, untouched: nothing created, dropped or replaced.
      assert.equal(state.functions.length, 1)
      assert.ok(overload.includes(state.functions[0].replace(/^public\./, '').split('(')[0]))
    } finally { await fresh.close() }
  }

  // The error names the exact overload; that overload keeps its own grants.
  const fresh = new PGlite()
  try {
    await fresh.exec(productionContractFixture)
    await fresh.exec(overloads[0])
    await rejects(fresh.exec(migration),
      /BLUEPRINT_MIGRATION_EXISTING_FUNCTION: \{"mark_blueprint_owned\(p_blueprint_id uuid, p_user_id uuid\)"\}/)
    await fresh.exec('ROLLBACK')
    const { rows: [{ untouched }] } = await fresh.query(`SELECT has_function_privilege('anon',
      'public.mark_blueprint_owned(uuid, uuid)', 'EXECUTE') AS untouched`)
    assert.equal(untouched, true, 'fixture default privileges are not revoked by a failed migration')
  } finally { await fresh.close() }
})

test('migration fails closed when the verified crew/profile contract is missing', async () => {
  const fresh = new PGlite()
  try {
    await fresh.exec(productionContractFixture)
    await fresh.exec('ALTER TABLE public.groups DROP COLUMN archived_at')
    await rejects(fresh.exec(migration), /BLUEPRINT_MIGRATION_PRECONDITION_FAILED.*groups\.archived_at/)
    await fresh.exec('ROLLBACK')
    const { rows } = await fresh.query(`SELECT to_regclass('public.blueprints') AS t`)
    assert.equal(rows[0].t, null)
  } finally { await fresh.close() }
})
