import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [sql, promotion] = await Promise.all([
  read('database/migrations/scmdb/006_legacy_location_binding.sql'),
  read('database/migrations/scmdb/005_atomic_location_promotion.sql'),
])

test('exposes an explicit, service-only binding boundary with shared transaction locks', () => {
  assert.match(sql, /CREATE FUNCTION public\.bind_scmdb_legacy_location\(\s*p_source_key text,\s*p_inventory_location_id uuid\s*\) RETURNS jsonb/i)
  assert.match(sql, /LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public/i)
  for (const key of ['scmdb_location_promotion:LIVE', 'scmdb_location_catalog:SCMDB:LIVE']) {
    const lock = `pg_advisory_xact_lock(hashtextextended('${key}', 0))`
    assert.ok(sql.includes(lock))
    assert.ok(promotion.includes(lock))
  }
  assert.ok(sql.indexOf('scmdb_location_promotion:LIVE') < sql.indexOf('scmdb_location_catalog:SCMDB:LIVE'))
  assert.ok(sql.indexOf('LOCK TABLE public.inventory_locations') < sql.indexOf('LOCK TABLE public.scmdb_location_mappings'))
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bind_scmdb_legacy_location\(text, uuid\) FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.bind_scmdb_legacy_location\(text, uuid\) TO service_role/i)
  assert.doesNotMatch(sql, /pg_advisory_lock\s*\(|\bEXECUTE\s+['"`]/i)
})

test('requires a valid promotable source in exactly one active LIVE dataset', () => {
  assert.match(sql, /p_source_key IS NULL OR btrim\(p_source_key\) = ''[\s\S]*?SCMDB_LEGACY_SOURCE_REQUIRED/i)
  assert.match(sql, /source = 'SCMDB' AND channel = 'LIVE' AND status = 'ACTIVE'/i)
  assert.match(sql, /v_dataset_count <> 1[\s\S]*?SCMDB_LEGACY_ACTIVE_DATASET_INVALID/i)
  assert.match(sql, /c\.dataset_id = v_dataset_id AND c\.source_key = p_source_key\s+AND c\.classification = 'VALID'\s+AND c\.location_type IN \('LandingZone', 'Station', 'Outpost'\)/i)
  assert.match(sql, /SCMDB_LEGACY_SOURCE_NOT_PROMOTABLE/)
  assert.ok(sql.indexOf('SCMDB_LEGACY_SOURCE_NOT_PROMOTABLE') < sql.indexOf('INSERT INTO public.scmdb_location_mappings'))
})

test('location identity uses UUID and blocks missing, archived and system locations', () => {
  assert.match(sql, /FROM public\.inventory_locations l\s+WHERE l\.id = p_inventory_location_id/i)
  assert.match(sql, /IF NOT FOUND THEN\s+RAISE EXCEPTION 'SCMDB_LEGACY_LOCATION_INVALID'/i)
  assert.match(sql, /v_location\.is_system IS DISTINCT FROM false OR v_location\.normalized_name = 'unbekannt'[\s\S]*?SCMDB_LEGACY_SYSTEM_LOCATION_FORBIDDEN/i)
  assert.match(sql, /v_location\.is_archived IS DISTINCT FROM false[\s\S]*?SCMDB_LEGACY_LOCATION_INVALID/i)
  assert.equal((sql.match(/normalized_name/gi) || []).length, 1)
  assert.doesNotMatch(sql, /canonical_name/i)
})

test('binding is idempotent and refuses conflicts in either identity direction', () => {
  assert.match(sql, /m\.channel = 'LIVE' AND m\.source_key = p_source_key[\s\S]*?v_existing_location_id IS DISTINCT FROM p_inventory_location_id[\s\S]*?SCMDB_LEGACY_SOURCE_ALREADY_BOUND/i)
  assert.match(sql, /m\.channel = 'LIVE' AND m\.inventory_location_id = p_inventory_location_id[\s\S]*?v_existing_source_key IS DISTINCT FROM p_source_key[\s\S]*?SCMDB_LEGACY_LOCATION_ALREADY_BOUND/i)
  assert.match(sql, /UPDATE public\.scmdb_location_mappings\s+SET last_dataset_id = v_dataset_id, mapping_kind = 'LEGACY_CONFIRMED',\s+is_active = true/i)
  const update = sql.match(/UPDATE public\.scmdb_location_mappings[\s\S]*?;/i)?.[0]
  assert.ok(update)
  assert.doesNotMatch(update, /\bfirst_dataset_id\b|SET\s+inventory_location_id/i)
  assert.match(update, /last_dataset_id IS DISTINCT FROM v_dataset_id[\s\S]*?is_active IS DISTINCT FROM true/i)
  assert.match(sql, /INSERT INTO public\.scmdb_location_mappings[\s\S]*?VALUES \('LIVE', p_source_key, p_inventory_location_id, v_dataset_id, v_dataset_id, 'LEGACY_CONFIRMED', true\)/i)
  for (const label of ['BOUND', 'ALREADY_BOUND', 'dataset_id', 'channel', 'source_key', 'inventory_location_id', 'outcome']) assert.ok(sql.includes(`'${label}'`))
})

test('writes only mapping rows and never hard-codes a legacy identity', () => {
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+public\.(?:inventory_locations|inventory|scmdb_location_catalog|scmdb_location_datasets)\b/i)
  assert.doesNotMatch(sql, /LOT_IDENTITY_V1|promote_active_scmdb_locations|levski|new babbage|98a57fa1|69f77d46|8e0e5a8ab2b1|7e8f8b436c21/i)
  assert.equal((sql.match(/\bINSERT INTO public\./gi) || []).length, 1)
  assert.equal((sql.match(/\bUPDATE public\./gi) || []).length, 1)
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b|\bTRUNCATE\b/i)
})
