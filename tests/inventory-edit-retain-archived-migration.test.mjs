import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../database/migrations/inventory/${path}`, import.meta.url), 'utf8')
const [original, migration] = await Promise.all([
  read('003_edit_identity_conflict_atomic_merge.sql'),
  read('004_edit_retain_archived_location.sql'),
])

test('replacement preserves the original atomic RPC except the locked source location validation', () => {
  const extract = text => text.replace(/\r\n/g, '\n').match(/create(?: or replace)? function public\.update_or_merge_inventory_lot\([\s\S]*?\n\$function\$;/i)?.[0]
  let expected = extract(original)
  assert.ok(expected)
  const replacements = [
    ['create function public.update_or_merge_inventory_lot(', 'create or replace function public.update_or_merge_inventory_lot('],
    ['  v_source_material text;\n', '  v_source_material text;\n  v_source_location_id uuid;\n'],
    ['    i.material,\n    i.input_unit\n  into\n    v_source_id,\n    v_source_material,\n    v_source_input_unit', '    i.material,\n    i.input_unit,\n    i.location_id\n  into\n    v_source_id,\n    v_source_material,\n    v_source_input_unit,\n    v_source_location_id'],
    ['  if not exists (\n    select 1\n    from public.inventory_locations il\n    where il.id = p_location_id\n      and il.is_archived = false\n  ) then', '  if p_location_id is distinct from v_source_location_id and not exists (\n    select 1\n    from public.inventory_locations il\n    where il.id = p_location_id\n      and il.is_archived = false\n  ) then'],
  ]
  for (const [before, after] of replacements) {
    assert.equal(expected.split(before).length, 2)
    expected = expected.replace(before, after)
  }
  assert.equal(extract(migration), expected)
  assert.match(migration, /and i\.user_id = v_actor\s+for update;/)
  assert.doesNotMatch(migration, /\balter table\b/i)
})

test('only authenticated can execute the exact edit RPC signature', () => {
  const permissions = migration.match(/\b(?:REVOKE|GRANT)\b[^;]*;/gi) ?? []
  assert.equal(permissions.length, 2)
  const signature = String.raw`public\.update_or_merge_inventory_lot\(\s*bigint\s*,\s*numeric\s*,\s*bigint\s*,\s*text\s*,\s*text\s*,\s*integer\s*,\s*uuid\s*\)`
  assert.match(permissions[0], new RegExp(String.raw`^REVOKE\s+ALL\s+ON\s+FUNCTION\s+${signature}\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*service_role\s*;$`, 'i'))
  assert.match(permissions[1], new RegExp(String.raw`^GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+${signature}\s+TO\s+authenticated\s*;$`, 'i'))
})
