import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = await readFile(
  new URL('../database/migrations/security/002_security_hardening_h2.sql', import.meta.url),
  'utf8',
)
const code = sql.replace(/^--.*$/gm, '')

// --- static contract --------------------------------------------------------

test('migration runs in one transaction with local timeouts', () => {
  assert.match(code, /^\s*begin;/m)
  assert.match(code, /commit;\s*$/)
  assert.equal((code.match(/^\s*begin;/gm) ?? []).length, 1)
  assert.equal((code.match(/^\s*commit;/gm) ?? []).length, 1)
  assert.match(code, /set local lock_timeout/)
  assert.match(code, /set local statement_timeout/)
})

test('migration carries no environment specific content', () => {
  assert.doesNotMatch(code, /md5\s*\(/i)
  assert.doesNotMatch(code, /set_config\s*\(/)
  assert.doesNotMatch(sql, /[A-Za-z]:\\|OneDrive|supabase\.co/)
  assert.doesNotMatch(sql, /\b[0-9a-f]{32,}\b/i)
  assert.doesNotMatch(code, /\boid\s*=\s*\d+/i)
  assert.doesNotMatch(code, /(?<![a-z_])current_user(?![a-z_])/)
})

test('migration touches no data, auth schema, roles or policies', () => {
  assert.doesNotMatch(code, /\b(insert\s+into|update\s+\w|delete\s+from|truncate)\b/i)
  assert.doesNotMatch(code, /\bauth\./)
  assert.doesNotMatch(code, /create (or replace )?policy|drop policy|alter policy/i)
  assert.doesNotMatch(code, /create role|alter role|drop role/i)
  assert.doesNotMatch(code, /\bdrop (function|schema|table)\b/i)
  assert.doesNotMatch(code, /\bgrant\b(?!\s+usage on schema private)/i)
})

test('migration only touches authenticated, never anon or PUBLIC', () => {
  assert.doesNotMatch(code, /\b(from|to)\s+(public|anon)\b/i)
})

test('revokes are exactly the pinned set', () => {
  assert.equal((code.match(/^\s*revoke\b/gim) ?? []).length, 4)
})

// --- behaviour on PGlite ----------------------------------------------------

const crewCallers = [
  ['archive_group', 'p_group_id uuid', 'uuid', 'private.is_group_admin(p_group_id, auth.uid())'],
  ['invite_group_member', 'p_group_id uuid, p_nickname text', 'uuid, text', 'private.is_group_admin(p_group_id, auth.uid())'],
  ['restore_group', 'p_group_id uuid', 'uuid', 'private.is_group_owner(p_group_id, auth.uid())'],
  ['revoke_group_invite', 'p_invite_id uuid', 'uuid', 'private.is_group_admin(p_invite_id, auth.uid())'],
  ['transfer_group_ownership', 'p_group_id uuid, p_new uuid, p_keep boolean', 'uuid, uuid, boolean', 'private.is_group_owner(p_group_id, auth.uid())'],
  ['update_group_details', 'p_group_id uuid, p_name text, p_description text', 'uuid, text, text', 'private.is_group_member(p_group_id, auth.uid())'],
]
const otherCrew = [
  ['create_group', 'p_name text, p_description text'],
  ['respond_group_invite', 'p_invite_id uuid, p_accept boolean'],
  ['change_member_role', 'p_group_id uuid, p_target uuid, p_role text'],
  ['remove_group_member', 'p_group_id uuid, p_target uuid'],
  ['leave_group', 'p_group_id uuid'],
  ['upsert_my_profile', 'p_nickname text'],
]

// Pre-hardening contract, reduced to what the migration touches. Default
// privileges are deliberately wide (ALL to every application role); the
// fixture then strips PUBLIC and anon from the functions, as the existing
// environments have it, so authenticated keeps EXECUTE exactly as before.
const baseline = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

  CREATE TABLE public.groups (id uuid PRIMARY KEY, name text);
  CREATE TABLE public.group_members (
    group_id uuid NOT NULL, user_id uuid NOT NULL, role text NOT NULL,
    PRIMARY KEY (group_id, user_id));
  CREATE TABLE public.inventory (id bigint PRIMARY KEY, user_id uuid, amount numeric);

  CREATE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
    AS $$ SELECT EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = p_group_id AND m.user_id = p_user_id) $$;
  CREATE FUNCTION public.is_group_admin(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
    AS $$ SELECT EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = p_group_id AND m.user_id = p_user_id AND m.role IN ('OWNER','ADMIN')) $$;
  CREATE FUNCTION public.is_group_owner(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
    AS $$ SELECT EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = p_group_id AND m.user_id = p_user_id AND m.role = 'OWNER') $$;

  ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
  CREATE POLICY groups_read_member ON public.groups FOR SELECT TO authenticated
    USING (public.is_group_member(id, (SELECT auth.uid())));
  CREATE POLICY groups_update_admin ON public.groups FOR UPDATE TO authenticated
    USING (public.is_group_admin(id, (SELECT auth.uid())))
    WITH CHECK (public.is_group_admin(id, (SELECT auth.uid())));
  CREATE POLICY group_members_read ON public.group_members FOR SELECT TO authenticated
    USING (public.is_group_member(group_id, (SELECT auth.uid())));

  CREATE FUNCTION public.users_share_group(a uuid, b uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT true $$;
  CREATE FUNCTION public.is_current_user_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT false $$;

  ${crewCallers.map(([n, a, , call]) => `
  CREATE FUNCTION public.${n}(${a}) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
    AS $$ BEGIN RETURN ${call.replace('private.', 'public.')}; END $$;`).join('')}
  ${otherCrew.map(([n, a]) => `
  CREATE FUNCTION public.${n}(${a}) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
    AS $$ BEGIN RETURN true; END $$;`).join('')}

  CREATE FUNCTION public.add_or_merge_inventory_lot(p_material text, p_amount numeric, p_amount_micro_scu bigint,
      p_input_unit text, p_quantity_kind text, p_quality integer, p_location_id uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
    AS $$ BEGIN INSERT INTO public.inventory (id, user_id, amount) VALUES (1, auth.uid(), p_amount); RETURN 1; END $$;
  CREATE FUNCTION public.update_or_merge_inventory_lot(p_inventory_id bigint, p_amount numeric, p_amount_micro_scu bigint,
      p_input_unit text, p_quantity_kind text, p_quality integer, p_location_id uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
    AS $$ BEGIN UPDATE public.inventory SET amount = p_amount WHERE id = p_inventory_id; RETURN p_inventory_id; END $$;

  DO $$ DECLARE f record; BEGIN
    FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
    END LOOP; END $$;
`

const newDb = async () => {
  const db = new PGlite()
  await db.exec(baseline)
  return db
}

// Everything the migration can change, as one comparable string.
async function snapshot(db) {
  const { rows } = await db.query(`
    SELECT 'fn' AS k, p.oid::text || ' ' || p.oid::regprocedure::text || ' sd=' || p.prosecdef
           || ' cfg=' || coalesce(array_to_string(p.proconfig, ';'), '')
           || ' acl=' || coalesce(p.proacl::text, '')
           || ' def=' || md5(pg_get_functiondef(p.oid)) AS v
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
    UNION ALL
    SELECT 'schema', nspname || ' ' || coalesce(nspacl::text, '') FROM pg_namespace WHERE nspname = 'private'
    UNION ALL
    SELECT 'table', c.relname || ' ' || coalesce(c.relacl::text, '') FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    UNION ALL
    SELECT 'policy', po.oid::text || ' ' || po.polname || ' ' || coalesce(pg_get_expr(po.polqual, po.polrelid), '')
      FROM pg_policy po
    UNION ALL
    SELECT 'dep', d.objid::text || '>' || d.refobjid::text
      FROM pg_depend d WHERE d.classid = 'pg_policy'::regclass AND d.refclassid = 'pg_proc'::regclass
    ORDER BY 1, 2`)
  return rows.map(r => `${r.k}: ${r.v}`).join('\n')
}

const asRole = async (db, role, uid, fn) =>
  db.transaction(async tx => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })

const u1 = '00000000-0000-4000-8000-000000000001'
const u2 = '00000000-0000-4000-8000-000000000002'
const g1 = '00000000-0000-4000-8000-0000000000a1'

test('fresh application reaches the hardened end state', async () => {
  const db = await newDb()
  const before = await snapshot(db)
  await db.exec(sql)
  const after = await snapshot(db)
  assert.notEqual(after, before)

  const q = async text => (await db.query(text)).rows
  assert.deepEqual(await q(`SELECT proname FROM pg_proc WHERE pronamespace = 'private'::regnamespace ORDER BY 1`),
    [{ proname: 'is_group_admin' }, { proname: 'is_group_member' }, { proname: 'is_group_owner' }])
  assert.deepEqual(await q(`SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'is_group_%'`), [])

  for (const [name] of crewCallers) {
    const [r] = await q(`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p WHERE p.proname = '${name}'`)
    assert.match(r.d, /private\.is_group_/)
    assert.doesNotMatch(r.d, /public\.is_group_/)
  }

  const crew = [...crewCallers.map(c => c[0]), ...otherCrew.map(c => c[0])]
  for (const name of crew) {
    const [r] = await q(`SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') AS e
                           FROM pg_proc p WHERE p.proname = '${name}' AND p.pronamespace = 'public'::regnamespace`)
    assert.equal(r.e, false, name)
  }
  for (const name of ['users_share_group', 'is_current_user_admin']) {
    const [r] = await q(`SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') AS e FROM pg_proc p WHERE p.proname = '${name}'`)
    assert.equal(r.e, false, name)
  }
  const rpcs = await q(`SELECT p.prosecdef AS sd, array_to_string(p.proconfig, ';') AS cfg,
                               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS e
                          FROM pg_proc p WHERE p.proname LIKE '%_or_merge_inventory_lot' ORDER BY p.proname`)
  assert.deepEqual(rpcs, [
    { sd: true, cfg: 'search_path=""', e: true },
    { sd: true, cfg: 'search_path=""', e: true },
  ])
  const [t] = await q(`SELECT has_table_privilege('authenticated', 'public.inventory', 'INSERT') AS i,
                              has_table_privilege('authenticated', 'public.inventory', 'UPDATE') AS u,
                              has_table_privilege('authenticated', 'public.inventory', 'SELECT') AS s,
                              has_table_privilege('authenticated', 'public.inventory', 'DELETE') AS d`)
  assert.deepEqual(t, { i: false, u: false, s: true, d: true })
})

test('policies keep working through the moved helpers', async () => {
  const db = await newDb()
  await db.exec(sql)
  await db.query(`INSERT INTO public.groups VALUES ($1, 'crew')`, [g1])
  await db.query(`INSERT INTO public.group_members VALUES ($1, $2, 'MEMBER')`, [g1, u1])
  const seen = async uid => (await asRole(db, 'authenticated', uid, tx => tx.query('SELECT id FROM public.groups'))).rows.length
  assert.equal(await seen(u1), 1)
  assert.equal(await seen(u2), 0)
})

test('inventory is writable only through the RPCs after the migration', async () => {
  const db = await newDb()
  await db.exec(sql)
  await assert.rejects(asRole(db, 'authenticated', u1, tx =>
    tx.query(`INSERT INTO public.inventory (id, user_id, amount) VALUES (9, $1, 1)`, [u1])), /permission denied/)
  await assert.rejects(asRole(db, 'authenticated', u1, tx =>
    tx.query(`UPDATE public.inventory SET amount = 2`)), /permission denied/)
  const r = await asRole(db, 'authenticated', u1, tx =>
    tx.query(`SELECT public.add_or_merge_inventory_lot('m', 1, 1000000, 'SCU', 'T', 1, NULL) AS id`))
  assert.equal(String(r.rows[0].id), '1')
  const s = await asRole(db, 'authenticated', u1, tx => tx.query('SELECT count(*)::int AS n FROM public.inventory'))
  assert.equal(s.rows[0].n, 1)
})

test('second run on an already hardened database changes nothing', async () => {
  const db = await newDb()
  await db.exec(sql)
  const once = await snapshot(db)
  await db.exec(sql)
  assert.equal(await snapshot(db), once)
  await db.exec(sql)
  assert.equal(await snapshot(db), once)
})

test('partially hardened databases converge to the same end state', async () => {
  const full = await newDb()
  await full.exec(sql)
  const target = await snapshot(full)

  const partial = await newDb()
  await partial.exec(`
    REVOKE EXECUTE ON FUNCTION public.users_share_group(uuid, uuid) FROM authenticated;
    CREATE SCHEMA private;
    GRANT USAGE ON SCHEMA private TO authenticated;
    ALTER FUNCTION public.is_group_member(uuid, uuid) SET SCHEMA private;
    ALTER FUNCTION public.is_group_admin(uuid, uuid) SET SCHEMA private;
    ALTER FUNCTION public.is_group_owner(uuid, uuid) SET SCHEMA private;`)
  await partial.exec(sql)
  // Object identities (OIDs) differ between the two databases; compare everything else.
  const norm = t => t.replace(/\b\d{4,}\b/g, '#').split('\n').sort().join('\n')
  assert.equal(norm(await snapshot(partial)), norm(target))
})

const failsAndRollsBack = async (mutate, pattern) => {
  const db = await newDb()
  await db.exec(mutate)
  const before = await snapshot(db)
  await assert.rejects(db.exec(sql), pattern)
  // The failed migration leaves its transaction open and aborted; closing it rolls everything back.
  await db.exec('ROLLBACK')
  assert.equal(await snapshot(db), before)
}

test('mixed helper placement aborts and leaves nothing changed', async () => {
  await failsAndRollsBack(`
    CREATE SCHEMA private;
    ALTER FUNCTION public.is_group_member(uuid, uuid) SET SCHEMA private;`, /neither all in public nor all in private/)
})

test('a missing expected function aborts and leaves nothing changed', async () => {
  await failsAndRollsBack(`DROP FUNCTION public.leave_group(uuid);`, /H2 part 3: function public\.leave_group\(uuid\) not found/)
  await failsAndRollsBack(`DROP FUNCTION public.users_share_group(uuid, uuid);`, /H2 part 1: function/)
  await failsAndRollsBack(`DROP FUNCTION public.archive_group(uuid);`, /H2 part 2: caller/)
})

test('an RPC without an empty search_path is never made SECURITY DEFINER', async () => {
  await failsAndRollsBack(`
    ALTER FUNCTION public.add_or_merge_inventory_lot(text, numeric, bigint, text, text, integer, uuid) RESET search_path;`,
  /does not have an empty search_path/)
})

test('a lingering reference to public.is_group_* aborts and leaves nothing changed', async () => {
  await failsAndRollsBack(`
    CREATE FUNCTION public.extra_caller(p uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
      AS $$ BEGIN RETURN public.is_group_member(p, auth.uid()); END $$;`, /still references public\.is_group_/)
})

test('an inherited PUBLIC grant is detected instead of silently leaving access open', async () => {
  await failsAndRollsBack(`GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO PUBLIC;`, /authenticated can still execute public\.leave_group/)
})
