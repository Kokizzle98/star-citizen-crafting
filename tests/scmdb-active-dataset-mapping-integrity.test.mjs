import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [sql, sync] = await Promise.all([
  read('database/migrations/scmdb/004_active_dataset_mapping_integrity.sql'),
  read('database/migrations/scmdb/001_location_catalog.sql'),
])

test('activation guard is narrowly scoped and validates source identities', () => {
  assert.match(sql, /CREATE FUNCTION public\.validate_scmdb_active_dataset_mappings\(\) RETURNS trigger/i)
  assert.match(sql, /LANGUAGE plpgsql SET search_path = pg_catalog, public/i)
  assert.doesNotMatch(sql, /SECURITY DEFINER|EXECUTE\s+['"`]/i)
  assert.match(sql, /NEW\.status = 'ACTIVE' AND \(TG_OP = 'INSERT' OR OLD\.status IS DISTINCT FROM 'ACTIVE'\)/i)
  assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.scmdb_location_datasets\s+FOR EACH ROW EXECUTE FUNCTION public\.validate_scmdb_active_dataset_mappings\(\)/i)
  assert.match(sql, /m\.channel = NEW\.channel AND m\.is_active = true/i)
  assert.match(sql, /NOT EXISTS\s*\(\s*SELECT 1 FROM public\.scmdb_location_catalog c\s+WHERE c\.dataset_id = NEW\.id AND c\.source_key = m\.source_key\s+AND c\.classification = 'VALID'/i)
  assert.deepEqual([...sql.matchAll(/RAISE EXCEPTION '([^']+)'/gi)].map(match => match[1]), ['SCMDB_ACTIVE_DATASET_INVALIDATES_MAPPINGS'])
  assert.doesNotMatch(sql, /canonical_name|normalized_name|unbekannt|LOT_IDENTITY_V1/i)
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|ALTER|DROP)\b/i)
  assert.doesNotMatch(sql, /sync_scmdb_location_catalog|inventory_locations|\binventory\b/i)
})

test('sync stages the catalog before activation in the same function without exception handling', () => {
  const stage = sync.indexOf("'STAGING', p_total")
  const catalog = sync.indexOf('INSERT INTO public.scmdb_location_catalog', stage)
  const supersede = sync.indexOf("SET status = 'SUPERSEDED'", catalog)
  const activate = sync.indexOf("SET status = 'ACTIVE'", supersede)
  assert.ok(stage >= 0 && stage < catalog && catalog < supersede && supersede < activate)
  assert.doesNotMatch(sync, /\bEXCEPTION\s+WHEN\b|\bCOMMIT\b/i)
})

let DatabaseSync
try {
  ;({ DatabaseSync } = await import('node:sqlite'))
} catch {
  // Node 20 has no built-in SQLite.
}

test('activation query rejects only unsupported active mappings in the candidate channel', { skip: !DatabaseSync && 'node:sqlite requires a newer Node version' }, () => {
  const match = sql.match(/IF EXISTS\s*\(\s*(SELECT 1 FROM public\.scmdb_location_mappings m[\s\S]*?)\s*\) THEN/i)
  assert.ok(match)
  const query = match[1].replaceAll('public.', '').replaceAll('NEW.channel', '?1').replaceAll('NEW.id', '?2')
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE scmdb_location_mappings (channel TEXT, source_key TEXT, is_active BOOLEAN);
      CREATE TABLE scmdb_location_catalog (dataset_id TEXT, source_key TEXT, classification TEXT);
    `)
    const mapping = db.prepare('INSERT INTO scmdb_location_mappings VALUES (?, ?, ?)')
    const catalog = db.prepare('INSERT INTO scmdb_location_catalog VALUES (?, ?, ?)')
    const invalid = db.prepare(query)
    const rejects = () => invalid.get('LIVE', 'candidate') !== undefined
    mapping.run('LIVE', 'mapped', 1)
    assert.equal(rejects(), true, 'missing source')
    for (const classification of ['QUARANTINED', 'REJECTED_TECHNICAL', 'VALID']) {
      db.exec('DELETE FROM scmdb_location_catalog')
      catalog.run('candidate', 'mapped', classification)
      assert.equal(rejects(), classification !== 'VALID', classification)
    }
    db.exec('DELETE FROM scmdb_location_catalog; DELETE FROM scmdb_location_mappings')
    mapping.run('LIVE', 'inactive', 0)
    mapping.run('PTU', 'other-channel', 1)
    assert.equal(rejects(), false)
    mapping.run('LIVE', 'mapped', 1)
    catalog.run('different-dataset', 'mapped', 'VALID')
    assert.equal(rejects(), true, 'a different dataset cannot satisfy the mapping')
  } finally {
    db.close()
  }
})
