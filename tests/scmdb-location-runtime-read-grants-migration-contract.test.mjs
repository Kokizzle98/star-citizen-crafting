import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(new URL('../database/migrations/scmdb/002_location_catalog_runtime_read_grants.sql', import.meta.url), 'utf8')

test('migration grants service_role only the required runtime reads', () => {
  const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean)
  const expected = [
    'public.inventory_locations',
    'public.inventory',
    'public.scmdb_location_datasets',
    'public.scmdb_location_catalog',
  ].map(table => `GRANT SELECT ON ${table} TO service_role`)

  assert.deepEqual(statements.sort(), expected.sort())
  assert.doesNotMatch(sql, /\bGRANT\b[^;]*\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|POLICY)\b/i)
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?inventory(?:_locations)?\b/i)
})
