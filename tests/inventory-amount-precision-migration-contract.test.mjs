import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path =>
  readFile(new URL(`../database/migrations/inventory/${path}`, import.meta.url), 'utf8')

const migration001 = await read('001_lot_identity_v1_and_atomic_merge.sql')
const migration002 = await read('002_inventory_amount_precision.sql')
const migration003 = await read('003_edit_identity_conflict_atomic_merge.sql')

test('migration ordering keeps precision foundation before Edit Identity Conflict', () => {
  assert.match(migration001, /LOT_IDENTITY_V1/)
  assert.match(migration002, /EXACT INVENTORY AMOUNT PRECISION/)
  assert.match(migration003, /ATOMIC EDIT IDENTITY CONFLICT RESOLUTION/)
})

test('precision migration accepts only the original or target amount contract', () => {
  assert.match(
    migration002,
    /\(v_precision, v_scale\) <> \(12, 3\)[\s\S]*?\(v_precision, v_scale\) <> \(25, 6\)/,
  )

  assert.match(
    migration002,
    /message = 'INVENTORY_AMOUNT_TYPE_MISMATCH'/,
  )

  assert.match(
    migration002,
    /v_nullable <> 'NO'/,
  )
})

test('precision migration fails closed on invalid Inventory units', () => {
  assert.match(
    migration002,
    /i\.input_unit is null[\s\S]*?i\.input_unit ~ '\^\[\[:space:\]\]\*\$'/,
  )

  assert.match(
    migration002,
    /i\.input_unit not in \([\s\S]*?'COUNT'[\s\S]*?'SCU'[\s\S]*?'cSCU'[\s\S]*?'mSCU'[\s\S]*?U&'\\00B5SCU'[\s\S]*?\)/,
  )

  assert.match(
    migration002,
    /message = 'INVENTORY_UNIT_CONTRACT_INVALID'/,
  )
})

test('precision migration validates existing COUNT and VOLUME against canonical bigint quantities', () => {
  assert.match(
    migration002,
    /i\.input_unit = 'COUNT'[\s\S]*?i\.amount <> i\.amount_micro_scu::numeric/,
  )

  assert.match(
    migration002,
    /i\.amount_micro_scu::numeric\s*\*\s*0\.000001::numeric/,
  )

  assert.match(
    migration002,
    /message = 'INVENTORY_AMOUNT_CANONICAL_MISMATCH'/,
  )
})

test('amount column widens exactly to numeric(25,6)', () => {
  assert.match(
    migration002,
    /alter table public\.inventory\s+alter column amount\s+type numeric\(25,6\)\s+using amount::numeric\(25,6\);/,
  )

  assert.doesNotMatch(
    migration002,
    /alter column amount_micro_scu/i,
  )
})

test('Add-or-Merge keeps its historical signature and security model', () => {
  assert.match(
    migration002,
    /create or replace function public\.add_or_merge_inventory_lot\(\s*p_material text,\s*p_amount numeric,\s*p_amount_micro_scu bigint,\s*p_input_unit text,\s*p_quantity_kind text,\s*p_quality integer,\s*p_location_id uuid\s*\)/,
  )

  assert.match(migration002, /\bvolatile\b/)
  assert.match(migration002, /\bsecurity invoker\b/)
  assert.match(migration002, /set search_path = ''/)
})

test('Add-or-Merge reconstructs VOLUME using exact decimal multiplication only', () => {
  const rpc = migration002.match(
    /create or replace function public\.add_or_merge_inventory_lot\([\s\S]*?\$function\$;/,
  )?.[0]

  assert.ok(rpc)

  const exactConversions = rpc.match(
    /\*\s*0\.000001::numeric/g,
  ) ?? []

  assert.equal(exactConversions.length, 2)

  assert.doesNotMatch(
    rpc,
    /\/\s*1000000::numeric/,
  )
})

test('COUNT representation remains exact and does not use VOLUME scaling', () => {
  assert.match(
    migration002,
    /when v_kind = 'COUNT'\s+then \(\s*i\.amount_micro_scu::numeric\s*\+\s*p_amount_micro_scu::numeric\s*\)/,
  )

  assert.match(
    migration002,
    /if p_amount <>\s*p_amount_micro_scu::numeric then/,
  )
})

test('positive bigint overflow guard remains intact', () => {
  assert.match(
    migration002,
    /v_bigint_max constant numeric :=\s*9223372036854775807::numeric/,
  )

  assert.match(
    migration002,
    /i\.amount_micro_scu::numeric\s*<= v_bigint_max\s*-\s*p_amount_micro_scu::numeric/,
  )

  assert.match(
    migration002,
    /message = 'AMOUNT_OUT_OF_RANGE'/,
  )
})

test('precision migration restores authenticated-only Add-or-Merge execution', () => {
  assert.match(
    migration002,
    /revoke all[\s\S]*?public\.add_or_merge_inventory_lot[\s\S]*?from public;/i,
  )

  assert.match(
    migration002,
    /revoke all[\s\S]*?public\.add_or_merge_inventory_lot[\s\S]*?from anon;/i,
  )

  assert.match(
    migration002,
    /grant execute[\s\S]*?public\.add_or_merge_inventory_lot[\s\S]*?to authenticated;/i,
  )
})

test('precision migration verifies its final schema contract', () => {
  assert.match(
    migration002,
    /\(v_precision, v_scale\) <> \(25, 6\)/,
  )

  assert.match(
    migration002,
    /message = 'INVENTORY_AMOUNT_PRECISION_POSTCHECK_FAILED'/,
  )
})

test('precision migration does not change identity, RLS, policies, triggers or Edit RPC', () => {
  assert.doesNotMatch(migration002, /LOT_IDENTITY_V2/i)

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
    /create(?:\s+or\s+replace)?\s+function\s+public\.update_or_merge_inventory_lot/i,
  )
})

test('historical migration 001 remains unchanged in responsibility', () => {
  assert.match(
    migration001,
    /create or replace function public\.add_or_merge_inventory_lot/,
  )

  assert.doesNotMatch(
    migration001,
    /numeric\(25,6\)|EXACT INVENTORY AMOUNT PRECISION/,
  )
})