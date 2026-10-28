import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('VECTOR scaffold keeps safe defaults', () => {
  const env = fs.readFileSync('.env.example', 'utf8')
  assert.match(env, /CITIZEN_ID_ENABLED=false/)
  assert.doesNotMatch(env, /NEXT_PUBLIC_SUPABASE_SECRET/)
})
