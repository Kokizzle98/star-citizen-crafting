import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration001 = await readFile(
  new URL(
    '../database/migrations/inventory/001_lot_identity_v1_and_atomic_merge.sql',
    import.meta.url,
  ),
  'utf8',
)

const migration002 = await readFile(
  new URL(
    '../database/migrations/inventory/003_edit_identity_conflict_atomic_merge.sql',
    import.meta.url,
  ),
  'utf8',
)

test('migration 001 remains the historical Add-or-Merge contract', () => {
  const functions = [
    ...migration001.matchAll(
      /create or replace function\s+public\.([a-z_]+)/gi,
    ),
  ]

  assert.deepEqual(
    functions.map((match) => match[1]),
    ['add_or_merge_inventory_lot'],
  )

  assert.doesNotMatch(
    migration001,
    /update_or_merge_inventory_lot/i,
  )
})

test('migration 002 creates the Edit Identity Conflict RPC fail closed', () => {
  assert.match(
    migration002,
    /create function\s+public\.update_or_merge_inventory_lot\s*\(/i,
  )

  assert.doesNotMatch(
    migration002,
    /create or replace function\s+public\.update_or_merge_inventory_lot/i,
  )

  assert.match(migration002, /\bvolatile\b/i)
  assert.match(migration002, /\bsecurity invoker\b/i)
  assert.match(migration002, /set search_path\s*=\s*''/i)
})

test('RPC derives actor ownership and serializes edits per actor', () => {
  assert.match(
    migration002,
    /v_actor uuid := auth\.uid\(\)/,
  )

  assert.match(
    migration002,
    /pg_catalog\.pg_advisory_xact_lock\s*\(/,
  )

  assert.match(
    migration002,
    /pg_catalog\.hashtextextended\s*\(/,
  )

  assert.match(
    migration002,
    /VECTOR:INVENTORY:EDIT:/,
  )
})

test('RPC locks and owns the source Lot without accepting material identity', () => {
  const signature = migration002.match(
    /create function public\.update_or_merge_inventory_lot\(([\s\S]*?)\)\s*returns table/i,
  )?.[1]

  assert.ok(signature)

  assert.doesNotMatch(signature, /\bp_material\b/i)
  assert.doesNotMatch(signature, /\bp_user_id\b/i)
  assert.doesNotMatch(signature, /\bp_player_name\b/i)

  assert.match(
    migration002,
    /where i\.id = p_inventory_id\s+and i\.user_id = v_actor\s+for update;/,
  )

  assert.match(
    migration002,
    /i\.material[\s\S]*?into[\s\S]*?v_source_material/,
  )
})

test('RPC preserves exact COUNT and VOLUME quantity contracts', () => {
  assert.match(
    migration002,
    /if v_source_input_unit = 'COUNT' then\s+v_source_kind := 'COUNT';/,
  )

  assert.match(
    migration002,
    /v_source_kind := 'VOLUME';/,
  )

  assert.match(
    migration002,
    /p_amount <> p_amount_micro_scu::numeric/,
  )

  assert.match(
    migration002,
    /p_amount_micro_scu::numeric\s*\*\s*0\.000001::numeric/,
  )

  assert.doesNotMatch(
    migration002,
    /\bdouble precision\b|\breal\b/i,
  )
})

test('RPC validates an active destination location', () => {
  assert.match(
    migration002,
    /from public\.inventory_locations il/,
  )

  assert.match(
    migration002,
    /il\.id = p_location_id\s+and il\.is_archived = false/,
  )
})

test('RPC locks a LOT_IDENTITY_V1 target owned by the actor', () => {
  assert.match(
    migration002,
    /i\.user_id = v_actor\s+and i\.material = v_source_material\s+and i\.quality = p_quality\s+and i\.location_id = p_location_id\s+and i\.id <> v_source_id\s+for update;/,
  )
})

test('RPC returns UPDATED when the destination identity is free', () => {
  assert.match(
    migration002,
    /update public\.inventory i[\s\S]*?where i\.id = v_source_id[\s\S]*?'UPDATED'::text/,
  )
})

test('late identity conflicts recover only the expected unique constraint', () => {
  assert.match(
    migration002,
    /when unique_violation then/,
  )

  assert.match(
    migration002,
    /get stacked diagnostics\s+v_constraint_name = constraint_name;/,
  )

  assert.match(
    migration002,
    /v_identity_constraint[\s\S]*?'inventory_lot_identity_v1_key'/,
  )

  assert.match(
    migration002,
    /if v_constraint_name is distinct from v_identity_constraint then\s+raise;/,
  )

  assert.match(
    migration002,
    /LOT_IDENTITY_CONFLICT_RECOVERY_FAILED/,
  )
})

test('merge guards bigint overflow and updates target before deleting source', () => {
  assert.match(
    migration002,
    /v_bigint_max[\s\S]*?9223372036854775807/,
  )

  assert.match(
    migration002,
    /v_target_amount_micro_scu::numeric[\s\S]*?v_bigint_max - p_amount_micro_scu::numeric/,
  )

  const targetUpdate = migration002.indexOf(
    'where i.id = v_target_id',
  )

  const sourceDelete = migration002.indexOf(
    'where i.id = v_source_id',
    targetUpdate,
  )

  assert.ok(targetUpdate >= 0)
  assert.ok(sourceDelete > targetUpdate)

  const mergedReturn = migration002.indexOf(
    "'MERGED'::text",
    sourceDelete,
  )

  assert.ok(mergedReturn > sourceDelete)
})

test('RPC grants execution only to authenticated application users', () => {
  assert.match(
    migration002,
    /revoke all[\s\S]*?update_or_merge_inventory_lot[\s\S]*?from public;/i,
  )

  assert.match(
    migration002,
    /revoke all[\s\S]*?update_or_merge_inventory_lot[\s\S]*?from anon;/i,
  )

  assert.match(
    migration002,
    /grant execute[\s\S]*?update_or_merge_inventory_lot[\s\S]*?to authenticated;/i,
  )
})

test('migration does not alter RLS, policies, triggers, identity version or Add RPC', () => {
  assert.doesNotMatch(
    migration002,
    /alter table\s+public\.inventory\s+(enable|disable|force|no force)\s+row level security/i,
  )

  assert.doesNotMatch(
    migration002,
    /\bcreate\s+policy\b|\balter\s+policy\b|\bdrop\s+policy\b/i,
  )

  assert.doesNotMatch(
    migration002,
    /\bcreate\s+trigger\b|\bdrop\s+trigger\b/i,
  )

  assert.doesNotMatch(
    migration002,
    /LOT_IDENTITY_V2/i,
  )

  assert.doesNotMatch(
    migration002,
    /create(?:\s+or\s+replace)?\s+function\s+public\.add_or_merge_inventory_lot/i,
  )
})

test('Edit RPC uses exact micro-SCU multiplication without canonical division', () => {
  const exactConversions = migration002.match(
    /\*\s*0\.000001::numeric/g,
  ) ?? []

  assert.equal(exactConversions.length, 2)

  assert.doesNotMatch(
    migration002,
    /\/\s*1000000::numeric/,
  )
})

test('Edit migration requires the numeric(25,6) precision foundation', () => {
  assert.match(
    migration002,
    /c\.numeric_precision[\s\S]*?c\.numeric_scale[\s\S]*?c\.is_nullable/,
  )

  assert.match(
    migration002,
    /\(v_precision, v_scale\) is distinct from \(25, 6\)/,
  )

  assert.match(
    migration002,
    /v_nullable is distinct from 'NO'/,
  )

  assert.match(
    migration002,
    /message = 'INVENTORY_AMOUNT_PRECISION_REQUIRED'/,
  )

  assert.match(
    migration002,
    /002_inventory_amount_precision\.sql/,
  )
})
