import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFile(new URL(`../database/migrations/scmdb/${path}`, import.meta.url), 'utf8')
const [catalog, mapping, guard, lifecycle] = await Promise.all([
  read('001_location_catalog.sql'), read('003_location_mapping_foundation.sql'),
  read('004_active_dataset_mapping_integrity.sql'), read('007_location_lifecycle.sql'),
])
const keys = ['keep', 'missing', 'quarantined', 'rejected', 'destination', 'return']
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const datasetId = uuid(1)
const candidateId = uuid(2)
const locationId = n => uuid(100 + n)

async function setup() {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.inventory_locations (
      id uuid PRIMARY KEY, normalized_name text NOT NULL,
      is_system boolean NOT NULL DEFAULT false, is_archived boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.inventory (
      id integer PRIMARY KEY, location_id uuid NOT NULL REFERENCES public.inventory_locations(id) ON UPDATE RESTRICT ON DELETE RESTRICT
    );
  `)
  await db.exec(catalog)
  await db.exec(mapping)
  await db.exec(guard)
  await db.exec(lifecycle)
  await db.query(`INSERT INTO public.scmdb_location_datasets
    (id,source,channel,version,source_file,status,total,valid,quarantined,rejected_technical)
    VALUES ($1,'SCMDB','LIVE','old','old.json','ACTIVE',6,6,0,0)`, [datasetId])
  for (const [i, key] of keys.entries()) {
    await db.query(`INSERT INTO public.inventory_locations (id,normalized_name,is_archived) VALUES ($1,$2,$3)`,
      [locationId(i), key, key === 'return'])
    await db.query(`INSERT INTO public.scmdb_location_catalog
      (dataset_id,source_key,canonical_name,normalized_name,location_type,classification,issues)
      VALUES ($1,$2,$2,$2,'Station','VALID',ARRAY[]::text[])`, [datasetId, key])
    await db.query(`INSERT INTO public.scmdb_location_mappings
      (id,channel,source_key,inventory_location_id,first_dataset_id,last_dataset_id,mapping_kind,is_active)
      VALUES ($1,'LIVE',$2,$3,$4,$4,'AUTO_CREATED',$5)`, [uuid(200 + i), key, locationId(i), datasetId, key !== 'return'])
  }
  await db.query('INSERT INTO public.inventory VALUES (1,$1)', [locationId(1)])
  await db.query("INSERT INTO public.inventory_locations (id,normalized_name,is_system) VALUES ($1,'unbekannt',true)", [uuid(999)])
  await db.query(`INSERT INTO public.scmdb_location_datasets
    (id,source,channel,version,source_file,status,total,valid,quarantined,rejected_technical)
    VALUES ($1,'SCMDB','LIVE','new','new.json','STAGING',5,3,1,1)`, [candidateId])
  for (const [key, classification, type, issues] of [
    ['keep', 'VALID', 'Station', []],
    ['quarantined', 'QUARANTINED', 'Station', ['UNKNOWN_SYSTEM']],
    ['rejected', 'REJECTED_TECHNICAL', 'Station', ['TECHNICAL_NAME']],
    ['destination', 'VALID', 'Destination', []],
    ['return', 'VALID', 'Outpost', []],
  ]) {
    await db.query(`INSERT INTO public.scmdb_location_catalog
      (dataset_id,source_key,canonical_name,normalized_name,location_type,classification,issues)
      VALUES ($1,$2,$2,$2,$3,$4,$5::text[])`, [candidateId, key, type, classification, issues])
  }
  return db
}

async function snapshot(db) {
  const mappings = await db.query(`SELECT m.id,m.source_key,m.inventory_location_id,m.first_dataset_id,m.last_dataset_id,
    m.mapping_kind,m.is_active,l.is_archived,m.updated_at AS mapping_updated_at,l.updated_at AS location_updated_at
    FROM public.scmdb_location_mappings m
    JOIN public.inventory_locations l ON l.id=m.inventory_location_id ORDER BY m.source_key`)
  return mappings.rows
}

test('migration supersedes only the activation blocker and keeps identity protections', () => {
  assert.match(lifecycle, /DROP TRIGGER scmdb_active_dataset_mapping_validate ON public\.scmdb_location_datasets/i)
  assert.match(lifecycle, /AFTER INSERT OR UPDATE ON public\.scmdb_location_datasets\s+FOR EACH ROW EXECUTE FUNCTION public\.apply_scmdb_location_lifecycle/i)
  assert.match(lifecycle, /NEW\.channel IS DISTINCT FROM 'LIVE'/i)
  assert.match(lifecycle, /OLD\.status IS NOT DISTINCT FROM 'ACTIVE'/i)
  assert.match(lifecycle, /NEW\.first_dataset_id IS DISTINCT FROM OLD\.first_dataset_id/i)
  assert.match(lifecycle, /SCMDB_LIFECYCLE_MAPPING_LOCATION_MISSING/)
  assert.match(lifecycle, /SCMDB_LIFECYCLE_SYSTEM_LOCATION_FORBIDDEN/)
  assert.match(lifecycle, /SCMDB_LIFECYCLE_ACCOUNTING_MISMATCH/)
  const body = lifecycle.match(/CREATE FUNCTION public\.apply_scmdb_location_lifecycle\(\)[\s\S]*?\n\$\$;/i)?.[0]
  assert.ok(body)
  assert.doesNotMatch(body, /canonical_name|DELETE\s+FROM|promote_active_scmdb_locations|UPDATE\s+public\.inventory\b/i)
  assert.doesNotMatch(body, /SET\s+(?:first_dataset_id|inventory_location_id|mapping_kind)\s*=/i)
  assert.match(body, /LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public/i)
  assert.match(lifecycle, /REVOKE ALL ON FUNCTION public\.apply_scmdb_location_lifecycle\(\) FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(lifecycle, /pg_advisory_xact_lock\(hashtextextended\('scmdb_location_promotion:LIVE', 0\)\)[\s\S]*?pg_advisory_xact_lock\(hashtextextended\('scmdb_location_catalog:SCMDB:LIVE', 0\)\)/i)
  assert.match(lifecycle, /BEFORE INSERT OR UPDATE ON public\.scmdb_location_datasets\s+FOR EACH STATEMENT/i)
  assert.doesNotMatch(lifecycle, /\bGRANT\b/i)
  const originalSync = catalog.match(/CREATE FUNCTION public\.sync_scmdb_location_catalog\([\s\S]*?\n\$\$;/i)?.[0]
  const replacement = lifecycle.match(/CREATE OR REPLACE FUNCTION public\.sync_scmdb_location_catalog\([\s\S]*?\n\$\$;/i)?.[0]
  assert.ok(originalSync && replacement)
  const expected = originalSync.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
    "  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_catalog:' || p_source || ':' || p_channel, 0));",
    "  IF p_channel = 'LIVE' THEN\n    PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_promotion:LIVE', 0));\n  END IF;\n  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_catalog:' || p_source || ':' || p_channel, 0));",
  )
  assert.equal(replacement.replace(/\r\n/g, '\n'), expected.replace(/\r\n/g, '\n'))
})

test('inactive unsupported mapping advances its dataset without changing identity', async () => {
  const db = await setup()
  try {
    await db.query("UPDATE public.scmdb_location_mappings SET is_active=false WHERE source_key='missing'")
    await db.query("UPDATE public.inventory_locations SET is_archived=true WHERE id=$1", [locationId(1)])
    const before = (await snapshot(db)).find(row => row.source_key === 'missing')
    await db.query("UPDATE public.scmdb_location_datasets SET status='SUPERSEDED' WHERE id=$1", [datasetId])
    await db.query("UPDATE public.scmdb_location_datasets SET status='ACTIVE' WHERE id=$1", [candidateId])
    const after = (await snapshot(db)).find(row => row.source_key === 'missing')
    assert.deepEqual(after, { ...before, last_dataset_id: candidateId, mapping_updated_at: after.mapping_updated_at })
    await assert.rejects(db.query("UPDATE public.scmdb_location_mappings SET source_key='other' WHERE id=$1", [after.id]), /SCMDB_MAPPING_INACTIVE_IDENTITY_CHANGED/)
    await assert.rejects(db.query('UPDATE public.scmdb_location_mappings SET is_active=true WHERE id=$1', [after.id]), /SCMDB_MAPPING_SOURCE_NOT_VALID/)
  } finally { await db.close() }
})

test('internal lifecycle functions remain unavailable to application roles', async () => {
  const db = await setup()
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const fn of ['public.apply_scmdb_location_lifecycle()', 'public.lock_scmdb_location_dataset_lifecycle()']) {
        const permissions = await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed', [role, fn, 'EXECUTE'])
        assert.equal(permissions.rows[0].allowed, false)
      }
    }
  } finally { await db.close() }
})

test('real PostgreSQL lifecycle retires and reactivates without moving lots', async () => {
  const db = await setup()
  try {
    const original = await snapshot(db)
    await db.query("UPDATE public.scmdb_location_datasets SET status='SUPERSEDED' WHERE id=$1", [datasetId])
    await db.query("UPDATE public.scmdb_location_datasets SET status='ACTIVE' WHERE id=$1", [candidateId])
    const rows = await snapshot(db)
    assert.equal(rows.length, 6)
    for (const row of rows) {
      const active = ['keep', 'return'].includes(row.source_key)
      assert.equal(row.is_active, active, row.source_key)
      assert.equal(row.is_archived, !active, row.source_key)
      assert.equal(row.first_dataset_id, datasetId)
      assert.equal(row.last_dataset_id, candidateId)
      assert.equal(row.inventory_location_id, locationId(keys.indexOf(row.source_key)))
    }
    assert.deepEqual((await db.query('SELECT location_id FROM public.inventory WHERE id=1')).rows, [{ location_id: locationId(1) }])
    const before = await snapshot(db)
    await db.query("UPDATE public.scmdb_location_datasets SET source_file='again.json' WHERE id=$1", [candidateId])
    assert.deepEqual(await snapshot(db), before)
    assert.deepEqual((await db.query("SELECT is_archived FROM public.inventory_locations WHERE normalized_name='unbekannt'")).rows, [{ is_archived: false }])
    const previous = new Map(original.map(row => [row.source_key, row]))
    const counts = { stillActive: 0, retired: 0, reactivated: 0 }
    for (const row of rows) {
      const old = previous.get(row.source_key)
      if (row.is_active && old.is_active) counts.stillActive++
      else if (!row.is_active && old.is_active) counts.retired++
      else if (row.is_active && !old.is_active) counts.reactivated++
    }
    assert.deepEqual(counts, { stillActive: 1, retired: 4, reactivated: 1 })
    assert.equal(counts.stillActive + counts.retired + counts.reactivated, rows.length)
    await db.query("UPDATE public.scmdb_location_datasets SET status='STAGING' WHERE id=$1", [candidateId])
    await db.query("UPDATE public.scmdb_location_datasets SET status='ACTIVE' WHERE id=$1", [candidateId])
    assert.deepEqual(await snapshot(db), before)
    assert.equal((await snapshot(db)).filter(row => row.is_active && !before.find(old => old.id === row.id).is_active).length, 0)
  } finally { await db.close() }
})

test('sync activates atomically and is idempotent on a repeated dataset', async () => {
  const db = await setup()
  try {
    const row = (key, classification, type, issues = []) => ({
      source_key: key, canonical_name: key, normalized_name: key, location_type: type,
      system_name: null, planet_name: null, moon_name: null, classification, issues,
    })
    const rows = [
      row('keep', 'VALID', 'Station'), row('destination', 'VALID', 'Destination'),
      row('return', 'VALID', 'Outpost'), row('quarantined', 'QUARANTINED', 'Station', ['UNKNOWN_SYSTEM']),
      row('rejected', 'REJECTED_TECHNICAL', 'Station', ['TECHNICAL_NAME']),
    ]
    const sql = `SELECT public.sync_scmdb_location_catalog('SCMDB','LIVE','new','new.json',5,3,1,1,$1::jsonb) AS id`
    assert.equal((await db.query(sql, [JSON.stringify(rows)])).rows[0].id, candidateId)
    const before = await snapshot(db)
    assert.equal(before.find(row => row.source_key === 'missing').is_active, false)
    assert.equal(before.find(row => row.source_key === 'return').is_active, true)
    assert.equal((await db.query(sql, [JSON.stringify(rows)])).rows[0].id, candidateId)
    assert.deepEqual(await snapshot(db), before)
  } finally { await db.close() }
})

test('PTU activation leaves LIVE mappings untouched and LIVE activation ignores PTU mappings', async () => {
  const db = await setup()
  try {
    const ptu = uuid(3)
    const otherLocation = uuid(700)
    await db.query(`INSERT INTO public.scmdb_location_datasets
      (id,source,channel,version,source_file,status,total,valid,quarantined,rejected_technical)
      VALUES ($1,'SCMDB','PTU','v','ptu','STAGING',1,1,0,0)`, [ptu])
    await db.query("INSERT INTO public.inventory_locations (id,normalized_name) VALUES ($1,'ptu')", [otherLocation])
    await db.query(`INSERT INTO public.scmdb_location_catalog
      (dataset_id,source_key,canonical_name,normalized_name,location_type,classification,issues)
      VALUES ($1,'ptu','ptu','ptu','Station','VALID',ARRAY[]::text[])`, [ptu])
    await db.query(`INSERT INTO public.scmdb_location_mappings
      (channel,source_key,inventory_location_id,first_dataset_id,last_dataset_id,mapping_kind)
      VALUES ('PTU','ptu',$1,$2,$2,'AUTO_CREATED')`, [otherLocation, ptu])
    const before = await snapshot(db)
    await db.query("UPDATE public.scmdb_location_datasets SET status='ACTIVE' WHERE id=$1", [ptu])
    assert.deepEqual(await snapshot(db), before)
    await db.query("UPDATE public.scmdb_location_datasets SET status='SUPERSEDED' WHERE id=$1", [datasetId])
    await db.query("UPDATE public.scmdb_location_datasets SET status='ACTIVE' WHERE id=$1", [candidateId])
    const after = await snapshot(db)
    assert.deepEqual(after.find(row => row.source_key === 'ptu'), before.find(row => row.source_key === 'ptu'))
  } finally { await db.close() }
})

test('a malformed system mapping fails closed without modifying fallback or dataset', async () => {
  const db = await setup()
  try {
    await db.exec('ALTER TABLE public.scmdb_location_mappings DISABLE TRIGGER scmdb_location_mapping_validate')
    await db.query("UPDATE public.scmdb_location_mappings SET inventory_location_id=$1 WHERE source_key='keep'", [uuid(999)])
    await db.exec('ALTER TABLE public.scmdb_location_mappings ENABLE TRIGGER scmdb_location_mapping_validate')
    const before = await snapshot(db)
    await assert.rejects(db.query("UPDATE public.scmdb_location_datasets SET status='ACTIVE' WHERE id=$1", [candidateId]), /unique|duplicate/i)
    await db.query("UPDATE public.scmdb_location_datasets SET status='SUPERSEDED' WHERE id=$1", [datasetId])
    await assert.rejects(db.query("UPDATE public.scmdb_location_datasets SET status='ACTIVE' WHERE id=$1", [candidateId]), /SCMDB_LIFECYCLE_SYSTEM_LOCATION_FORBIDDEN/)
    assert.deepEqual(await snapshot(db), before)
    assert.deepEqual((await db.query('SELECT is_archived FROM public.inventory_locations WHERE id=$1', [uuid(999)])).rows, [{ is_archived: false }])
    assert.deepEqual((await db.query('SELECT status FROM public.scmdb_location_datasets WHERE id=$1', [candidateId])).rows, [{ status: 'STAGING' }])
  } finally { await db.close() }
})

test('failure during activation rolls back dataset, mappings, locations and lots', async () => {
  const db = await setup()
  try {
    const before = await snapshot(db)
    await db.exec(`CREATE FUNCTION public.fail_archive() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.is_archived THEN RAISE EXCEPTION 'TEST_FORCED_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_archive BEFORE UPDATE ON public.inventory_locations FOR EACH ROW EXECUTE FUNCTION public.fail_archive();`)
    await db.exec('BEGIN')
    await db.query("UPDATE public.scmdb_location_datasets SET status='SUPERSEDED' WHERE id=$1", [datasetId])
    await assert.rejects(db.query("UPDATE public.scmdb_location_datasets SET status='ACTIVE' WHERE id=$1", [candidateId]), /TEST_FORCED_FAILURE/)
    await db.exec('ROLLBACK')
    assert.deepEqual(await snapshot(db), before)
    assert.deepEqual((await db.query('SELECT status FROM public.scmdb_location_datasets WHERE id=$1', [datasetId])).rows, [{ status: 'ACTIVE' }])
    assert.deepEqual((await db.query('SELECT status FROM public.scmdb_location_datasets WHERE id=$1', [candidateId])).rows, [{ status: 'STAGING' }])
    assert.deepEqual((await db.query('SELECT location_id FROM public.inventory WHERE id=1')).rows, [{ location_id: locationId(1) }])
  } finally { await db.close() }
})
