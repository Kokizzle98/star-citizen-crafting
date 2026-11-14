import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../database/migrations/inventory/001_lot_identity_v1_and_atomic_merge.sql', import.meta.url),
  'utf8',
)

test('legacy null and whitespace-only units fail before identity checks without mutation', () => {
  const precheck = migration.match(/do \$do\$[\s\S]*?\$do\$;/)?.[0]
  assert.ok(precheck)
  assert.match(precheck, /input_unit is null\s+or input_unit ~ '\^\[\[:space:\]\]\*\$'/)
  assert.match(precheck, /message = 'LEGACY_INVENTORY_INPUT_UNIT_MISSING'/)
  assert.doesNotMatch(precheck, /\b(update|insert|delete)\b/i)
  assert.ok(migration.indexOf(precheck) < migration.indexOf('LOT_IDENTITY_V1_DUPLICATES_EXIST'))
  assert.ok(migration.indexOf(precheck) < migration.indexOf('add constraint inventory_lot_identity_v1_key'))
})

test('RPC rejects null, blank, and unsupported kinds before processing units', () => {
  assert.match(migration, /if v_kind is null\s+or v_kind ~ '\^\[\[:space:\]\]\*\$'\s+or v_kind not in \('COUNT', 'VOLUME'\) then\s+raise exception\s+using errcode = '22023',\s+message = 'MATERIAL_UNIT_UNKNOWN';/)
  assert.ok(migration.indexOf('MATERIAL_UNIT_UNKNOWN') < migration.indexOf("if v_kind = 'COUNT'"))
})

test('RPC rejects null and blank units and retains COUNT and volume unit contracts', () => {
  assert.match(migration, /if v_input_unit is null\s+or v_input_unit ~ '\^\[\[:space:\]\]\*\$' then\s+raise exception\s+using errcode = '22023',\s+message = 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';/)
  assert.match(migration, /if v_kind = 'COUNT' then\s+if v_input_unit <> 'COUNT' then/)
  assert.match(migration, /if v_kind = 'VOLUME' then\s+if v_input_unit not in \(\s*'SCU',\s*'cSCU',\s*'mSCU',\s*'µSCU'\s*\) then/)
  assert.match(migration, /if p_amount <> p_amount_micro_scu::numeric then/)
  assert.match(migration, /p_amount_micro_scu::numeric\s*\/ 1000000::numeric/)
})

test('migration does not implement Edit Identity Conflict', () => {
  const functions = [...migration.matchAll(/create or replace function\s+public\.([a-z_]+)/gi)]
  assert.deepEqual(functions.map((match) => match[1]), ['add_or_merge_inventory_lot'])
  assert.doesNotMatch(migration, /EDIT_IDENTITY_CONFLICT/i)
})
