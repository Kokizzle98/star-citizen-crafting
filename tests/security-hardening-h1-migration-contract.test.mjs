import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(
  new URL('../database/migrations/security/001_security_hardening_h1.sql', import.meta.url),
  'utf8',
)
const code = sql.replace(/^--.*$/gm, '')

test('migration runs in one transaction', () => {
  assert.match(code, /^\s*begin;/m)
  assert.match(code, /commit;\s*$/)
})

test('profiles_read is replaced idempotently and limited to authenticated SELECT', () => {
  assert.match(code, /drop policy if exists profiles_read on public\.profiles;/)
  assert.match(
    code,
    /create policy profiles_read\s+on public\.profiles\s+for select\s+to authenticated/,
  )
  assert.doesNotMatch(code, /using\s*\(\s*true\s*\)/i)
})

test('profiles_read allows only own profile and shared non-archived crew members', () => {
  assert.match(code, /id = \(select auth\.uid\(\)\)/)
  assert.match(code, /g\.archived_at is null/)
  assert.match(code, /me\.user_id = \(select auth\.uid\(\)\)/)
  assert.match(code, /other\.user_id = profiles\.id/)
})

test('profiles_read does not depend on helper functions reserved for H2', () => {
  for (const name of ['is_group_member', 'is_group_admin', 'is_group_owner', 'users_share_group']) {
    assert.doesNotMatch(code, new RegExp(name))
  }
})

test('both trigger functions lose EXECUTE for PUBLIC, anon and authenticated', () => {
  for (const fn of ['rls_auto_enable', 'validate_profile_primary_game_account']) {
    assert.match(
      code,
      new RegExp(
        `revoke execute on function public\\.${fn}\\(\\)\\s+from public, anon, authenticated;`,
      ),
    )
  }
})

test('migration touches nothing else', () => {
  assert.doesNotMatch(code, /\b(insert|update|delete|truncate)\b/i)
  assert.doesNotMatch(code, /create (or replace )?function|drop function|drop trigger|alter function/i)
  assert.doesNotMatch(code, /profiles_update_own/)
  assert.equal((code.match(/create policy/gi) ?? []).length, 1)
  assert.equal((code.match(/\brevoke\b/gi) ?? []).length, 2)
  assert.doesNotMatch(code, /\bgrant\b/i)
})
