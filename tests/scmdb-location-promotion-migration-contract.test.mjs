import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(new URL('../database/migrations/scmdb/005_atomic_location_promotion.sql', import.meta.url), 'utf8')

test('promotion boundary is LIVE-only, serialized with catalog sync, and privileged', () => {
  for (const pattern of [
    /CREATE FUNCTION public\.promote_active_scmdb_locations\(p_channel text\) RETURNS jsonb/i,
    /SECURITY DEFINER SET search_path = pg_catalog, public/i,
    /p_channel IS DISTINCT FROM 'LIVE'[\s\S]*?SCMDB_PROMOTION_CHANNEL_UNSUPPORTED/i,
    /pg_advisory_xact_lock\(hashtextextended\('scmdb_location_promotion:LIVE', 0\)\)/i,
    /pg_advisory_xact_lock\(hashtextextended\('scmdb_location_catalog:SCMDB:LIVE', 0\)\)/i,
    /LOCK TABLE public\.inventory_locations IN SHARE ROW EXCLUSIVE MODE/i,
    /LOCK TABLE public\.scmdb_location_mappings IN SHARE ROW EXCLUSIVE MODE/i,
    /v_dataset_count <> 1[\s\S]*?SCMDB_PROMOTION_ACTIVE_DATASET_INVALID/i,
    /REVOKE ALL ON FUNCTION public\.promote_active_scmdb_locations\(text\) FROM PUBLIC, anon, authenticated, service_role/i,
    /GRANT EXECUTE ON FUNCTION public\.promote_active_scmdb_locations\(text\) TO service_role/i,
  ]) assert.match(sql, pattern)
  assert.doesNotMatch(sql, /pg_advisory_lock\s*\(|GRANT EXECUTE[^;]*\b(?:anon|authenticated)\b/i)
})

test('complete plan uses source identity and detects all name conflicts before writes', () => {
  assert.match(sql, /m\.channel = 'LIVE' AND m\.source_key = c\.source_key/i)
  assert.match(sql, /c\.dataset_id = v_dataset_id AND c\.classification = 'VALID'\s+AND c\.location_type IN \('LandingZone', 'Station', 'Outpost'\)/i)
  assert.match(sql, /lower\(btrim\(c\.canonical_name\)\) AS normalized_name/i)
  assert.match(sql, /d\.inventory_location_id IS NULL AND d\.normalized_name = c\.normalized_name\) > 1/i)
  assert.match(sql, /l\.normalized_name = c\.normalized_name/i)
  assert.match(sql, /c\.normalized_name = 'unbekannt'/i)
  assert.ok(sql.indexOf('INTO v_plan FROM classified') < sql.indexOf('UPDATE public.inventory_locations'))
  assert.doesNotMatch(sql, /JOIN public\.scmdb_location_mappings[^\r\n]*(?:canonical_name|normalized_name)\s*=/i)
  assert.doesNotMatch(sql, /LIMIT\s+1|ON CONFLICT/i)
  for (const label of ['ALREADY_MAPPED', 'SAFE_NEW', 'EXISTING_VECTOR_NAME', 'DUPLICATE_SCMDB_NAME']) assert.match(sql, new RegExp(`'${label}'`))
})

test('writes preserve existing UUIDs and create location and mapping atomically', () => {
  assert.match(sql, /l\.is_system IS DISTINCT FROM false[\s\S]*?SCMDB_PROMOTION_SYSTEM_LOCATION_FORBIDDEN/i)
  assert.match(sql, /SET is_archived = false[\s\S]*?is_archived = true AND is_system = false/i)
  assert.match(sql, /SET last_dataset_id = v_dataset_id, is_active = true[\s\S]*?inventory_location_id = \(v_row->>'inventory_location_id'\)::uuid/i)
  assert.match(sql, /INSERT INTO public\.inventory_locations[\s\S]*?RETURNING id INTO v_location_id[\s\S]*?INSERT INTO public\.scmdb_location_mappings[\s\S]*?v_location_id, v_dataset_id, v_dataset_id, 'AUTO_CREATED'/i)
  assert.doesNotMatch(sql, /SET\s+(?:id|inventory_location_id)\s*=|SET\s+is_archived\s*=\s*true/i)
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\.inventory\b/i)
  assert.doesNotMatch(sql, /LOT_IDENTITY_V1|sync_scmdb_location_catalog|EXCEPTION\s+WHEN|COMMIT|ROLLBACK/i)
  for (const field of ['dataset_id', 'channel', 'promotable_count', 'already_mapped_count', 'created_count', 'conflict_count', 'conflicts', 'source_key', 'reason']) {
    assert.match(sql, new RegExp(`'${field}'`))
  }
})
