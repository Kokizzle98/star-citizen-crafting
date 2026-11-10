import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(new URL('../database/migrations/scmdb/003_location_mapping_foundation.sql', import.meta.url), 'utf8')

test('mapping schema has required identities, references, defaults and indexes', () => {
  for (const pattern of [
    /CREATE TABLE public\.scmdb_location_mappings\s*\(/i,
    /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i,
    /channel text NOT NULL CHECK \(channel IN \('LIVE', 'PTU'\)\)/i,
    /source_key text NOT NULL CHECK \(btrim\(source_key\) <> ''\)/i,
    /mapping_kind text NOT NULL CHECK \(mapping_kind IN \('AUTO_CREATED', 'LEGACY_CONFIRMED'\)\)/i,
    /is_active boolean NOT NULL DEFAULT true/i,
    /created_at timestamptz NOT NULL DEFAULT now\(\)/i,
    /updated_at timestamptz NOT NULL DEFAULT now\(\)/i,
    /UNIQUE \(channel, source_key\)/i,
    /UNIQUE \(channel, inventory_location_id\)/i,
    /inventory_location_id uuid NOT NULL REFERENCES public\.inventory_locations\(id\) ON UPDATE RESTRICT ON DELETE RESTRICT/i,
    /first_dataset_id uuid NOT NULL REFERENCES public\.scmdb_location_datasets\(id\) ON UPDATE RESTRICT ON DELETE RESTRICT/i,
    /last_dataset_id uuid NOT NULL REFERENCES public\.scmdb_location_datasets\(id\) ON UPDATE RESTRICT ON DELETE RESTRICT/i,
    /CREATE INDEX \w+ ON public\.scmdb_location_mappings \(inventory_location_id\)/i,
    /CREATE INDEX \w+ ON public\.scmdb_location_mappings \(last_dataset_id\)/i,
    /CREATE INDEX \w+ ON public\.scmdb_location_mappings \(channel, is_active\)/i,
  ]) assert.match(sql, pattern)
})

test('mapping writes fail closed on channel, source validity and system fallback', () => {
  for (const pattern of [
    /SECURITY DEFINER SET search_path = pg_catalog, public/i,
    /d\.id = NEW\.first_dataset_id AND d\.channel = NEW\.channel/i,
    /d\.id = NEW\.last_dataset_id AND d\.channel = NEW\.channel/i,
    /c\.dataset_id = NEW\.last_dataset_id AND c\.source_key = NEW\.source_key\s+AND c\.classification = 'VALID'/i,
    /l\.id = NEW\.inventory_location_id AND l\.is_system IS FALSE/i,
    /BEFORE INSERT OR UPDATE ON public\.scmdb_location_mappings/i,
    /SCMDB_MAPPING_FIRST_DATASET_CHANNEL_MISMATCH/,
    /SCMDB_MAPPING_LAST_DATASET_CHANNEL_MISMATCH/,
    /SCMDB_MAPPING_SOURCE_NOT_VALID/,
    /SCMDB_MAPPING_SYSTEM_LOCATION_FORBIDDEN/,
  ]) assert.match(sql, pattern)
  assert.doesNotMatch(sql, /canonical_name|normalized_name/i)
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+public\.(?:inventory|inventory_locations|scmdb_location_catalog|scmdb_location_datasets)\b/i)
  assert.doesNotMatch(sql, /\b(?:ALTER|DROP)\s+(?:TABLE|FUNCTION)\s+public\.(?:inventory|inventory_locations|scmdb_location_catalog|scmdb_location_datasets)\b/i)
  assert.doesNotMatch(sql, /LOT_IDENTITY_V1|sync_scmdb_location_catalog/i)
  assert.equal((sql.match(/CREATE FUNCTION/gi) || []).length, 1)
  assert.match(sql, /CREATE FUNCTION public\.validate_scmdb_location_mapping\(\) RETURNS trigger/i)
})

test('mapping privileges expose reads only and no mutation policies', () => {
  assert.match(sql, /ALTER TABLE public\.scmdb_location_mappings ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /REVOKE ALL ON public\.scmdb_location_mappings FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT SELECT ON public\.scmdb_location_mappings TO authenticated, service_role/i)
  assert.match(sql, /FOR SELECT TO authenticated, service_role USING \(true\)/i)
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE)/i)
  assert.doesNotMatch(sql, /FOR\s+(?:ALL|INSERT|UPDATE|DELETE)\s+TO/i)
  assert.equal((sql.match(/CREATE POLICY/gi) || []).length, 1)
})
