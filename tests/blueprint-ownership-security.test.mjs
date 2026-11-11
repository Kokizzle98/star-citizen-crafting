import assert from 'node:assert/strict'
import test from 'node:test'
import { addBlueprint, addUser, as, createDb, uuid } from './blueprint-db-fixture.mjs'

// Blueprint PR 2 contract tests C (personal ownership security) and
// D (derived crew view security). The crew error contract is the one of
// get_active_group_inventory(): errcode 42501 with AUTH_REQUIRED,
// ACTIVE_GROUP_REQUIRED or ACTIVE_GROUP_NOT_ALLOWED.

const alice = uuid(11)
const bob = uuid(12)
const carol = uuid(13) // member of another crew only
const dave = uuid(14) // crew member without a profile
const eve = uuid(15) // points at alice's crew but is not a member
const zed = uuid(16)
const adam = uuid(17)
const crew = uuid(21)
const otherCrew = uuid(22)
const archivedCrew = uuid(23)

async function setup() {
  const db = await createDb()
  await addUser(db, alice, 'alice')
  await addUser(db, bob, 'Bob')
  await addUser(db, carol, 'carol')
  await addUser(db, dave, null)
  await addUser(db, eve, 'eve')
  await addUser(db, zed, 'Zed')
  await addUser(db, adam, 'adam')
  for (const [id, name, archived] of [
    [crew, 'Crew One', null], [otherCrew, 'Crew Two', null], [archivedCrew, 'Old Crew', 'now()'],
  ]) {
    await db.query(
      `INSERT INTO public.groups (id, name, created_by_user_id, archived_at)
       VALUES ($1, $2, $3, ${archived ?? 'NULL'})`, [id, name, alice])
  }
  for (const [group, user, role] of [
    [crew, alice, 'MEMBER'], [crew, bob, 'OWNER'], [crew, dave, 'MEMBER'],
    [otherCrew, carol, 'OWNER'], [archivedCrew, alice, 'OWNER'], [archivedCrew, bob, 'MEMBER'],
  ]) {
    await db.query('INSERT INTO public.group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
      [group, user, role])
  }
  for (const [user, group] of [[alice, crew], [bob, crew], [dave, crew], [carol, otherCrew], [eve, crew]]) {
    await db.query('INSERT INTO public.user_settings (user_id, active_group_id) VALUES ($1, $2)', [user, group])
  }
  const bp = []
  for (let i = 1; i <= 5; i++) bp.push(await addBlueprint(db, i))
  return { db, bp }
}

const mark = (db, user, blueprintId) =>
  as(db, 'authenticated', user, tx => tx.query('SELECT public.mark_blueprint_owned($1)', [blueprintId]))
const unmark = (db, user, blueprintId) =>
  as(db, 'authenticated', user, tx => tx.query('SELECT public.unmark_blueprint_owned($1)', [blueprintId]))
const ownRows = (db, user) =>
  as(db, 'authenticated', user, tx => tx.query(
    'SELECT user_id, blueprint_id, provenance, source_reference FROM public.user_blueprint_ownership ORDER BY blueprint_id'))
    .then(r => r.rows)
const crewStatus = (db, user, role = 'authenticated') =>
  as(db, role, user, tx => tx.query('SELECT * FROM public.get_active_crew_blueprint_status()')).then(r => r.rows)
const allOwnership = db =>
  db.query('SELECT user_id, blueprint_id FROM public.user_blueprint_ownership ORDER BY user_id, blueprint_id')
    .then(r => r.rows)

// The crew view is ordered by blueprint id; expected rows are sorted the same way.
const byId = rows => [...rows].sort((a, b) => (a.blueprint_id < b.blueprint_id ? -1 : 1))

const authError = message => error => {
  assert.equal(error.code, '42501')
  assert.equal(error.message, message)
  return true
}

// ---------------------------------------------------------------------------
// C. Personal ownership
// ---------------------------------------------------------------------------

test('C: mark writes a MANUAL row for auth.uid() only and is idempotent', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, alice, bp[0])
    const first = await db.query('SELECT * FROM public.user_blueprint_ownership')
    assert.equal(first.rows.length, 1)
    assert.equal(first.rows[0].user_id, alice)
    assert.equal(first.rows[0].provenance, 'MANUAL')
    assert.equal(first.rows[0].source_reference, null)

    await mark(db, alice, bp[0])
    const second = await db.query('SELECT * FROM public.user_blueprint_ownership')
    assert.deepEqual(second.rows, first.rows, 'repeated mark keeps the original row')
  } finally { await db.close() }
})

test('C: own ownership is readable directly, other users\' ownership is not', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, alice, bp[0])
    await mark(db, bob, bp[0])
    await mark(db, bob, bp[1])
    assert.deepEqual((await ownRows(db, alice)).map(r => r.user_id), [alice])
    assert.deepEqual((await ownRows(db, bob)).map(r => r.user_id), [bob, bob])
    // Without a user, RLS yields nothing; anon has no table privilege at all.
    assert.deepEqual(await ownRows(db, null), [])
    await assert.rejects(as(db, 'anon', null, tx => tx.query('SELECT * FROM public.user_blueprint_ownership')),
      /permission denied/)
  } finally { await db.close() }
})

test('C: no direct write path, not even for own rows', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, alice, bp[0])
    await mark(db, bob, bp[1])
    const before = await allOwnership(db)
    for (const sql of [
      `INSERT INTO public.user_blueprint_ownership (user_id, blueprint_id, provenance) VALUES ('${alice}', '${bp[2]}', 'MANUAL')`,
      `INSERT INTO public.user_blueprint_ownership (user_id, blueprint_id, provenance) VALUES ('${bob}', '${bp[2]}', 'MANUAL')`,
      `UPDATE public.user_blueprint_ownership SET provenance = 'GAME_LOG'`,
      `DELETE FROM public.user_blueprint_ownership`,
      `TRUNCATE public.user_blueprint_ownership`,
    ]) {
      await assert.rejects(as(db, 'authenticated', alice, tx => tx.query(sql)), /permission denied/, sql)
      await assert.rejects(as(db, 'anon', null, tx => tx.query(sql)), /permission denied/, sql)
    }
    assert.deepEqual(await allOwnership(db), before)
  } finally { await db.close() }
})

test('C: unmark removes only the caller\'s row and returns to "not known"', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, alice, bp[0])
    await mark(db, bob, bp[0])
    await unmark(db, alice, bp[0])
    assert.deepEqual(await ownRows(db, alice), [])
    assert.deepEqual(await allOwnership(db), [{ user_id: bob, blueprint_id: bp[0] }])
    // Idempotent: unmarking an unknown ownership changes nothing.
    await unmark(db, alice, bp[0])
    assert.deepEqual(await allOwnership(db), [{ user_id: bob, blueprint_id: bp[0] }])
  } finally { await db.close() }
})

test('C: a crew owner or admin cannot change another member\'s ownership', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, alice, bp[0])
    // bob is OWNER of alice's active crew; his calls act only for himself.
    await unmark(db, bob, bp[0])
    await mark(db, bob, bp[1])
    assert.deepEqual(await allOwnership(db), [
      { user_id: alice, blueprint_id: bp[0] },
      { user_id: bob, blueprint_id: bp[1] },
    ])
  } finally { await db.close() }
})

test('C: ownership RPCs require auth.uid() and a valid stable blueprint identity', async () => {
  const { db, bp } = await setup()
  try {
    for (const call of [mark, unmark]) {
      await assert.rejects(call(db, null, bp[0]), authError('AUTH_REQUIRED'))
      await assert.rejects(call(db, alice, uuid(999)), e => e.code === 'P0002' && e.message === 'BLUEPRINT_NOT_FOUND')
      await assert.rejects(call(db, alice, null), e => e.code === 'P0002' && e.message === 'BLUEPRINT_NOT_FOUND')
      await assert.rejects(as(db, 'anon', null, tx => tx.query(
        `SELECT public.${call === mark ? 'mark' : 'unmark'}_blueprint_owned($1)`, [bp[0]])), /permission denied/)
    }
    // A foreign user id cannot be passed: the functions have exactly one argument.
    await assert.rejects(as(db, 'authenticated', alice, tx => tx.query(
      'SELECT public.mark_blueprint_owned($1, $2)', [bp[0], bob])), /does not exist/)
    assert.deepEqual(await allOwnership(db), [])
  } finally { await db.close() }
})

test('C: ownership does not need a profile, game account or crew', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, dave, bp[0]) // dave has no profile
    await mark(db, eve, bp[1]) // eve has no valid crew
    assert.deepEqual((await ownRows(db, dave)).map(r => r.blueprint_id), [bp[0]])
    assert.deepEqual((await ownRows(db, eve)).map(r => r.blueprint_id), [bp[1]])
  } finally { await db.close() }
})

// ---------------------------------------------------------------------------
// D. Derived crew view
// ---------------------------------------------------------------------------

test('D: AUTH_REQUIRED and ACTIVE_GROUP_REQUIRED', async () => {
  const { db } = await setup()
  try {
    await assert.rejects(crewStatus(db, null), authError('AUTH_REQUIRED'))
    // zed has no settings row, adam an empty active crew.
    await assert.rejects(crewStatus(db, zed), authError('ACTIVE_GROUP_REQUIRED'))
    await db.query('INSERT INTO public.user_settings (user_id, active_group_id) VALUES ($1, NULL)', [adam])
    await assert.rejects(crewStatus(db, adam), authError('ACTIVE_GROUP_REQUIRED'))
    await assert.rejects(crewStatus(db, null, 'anon'), /permission denied/)
  } finally { await db.close() }
})

test('D: ACTIVE_GROUP_NOT_ALLOWED for an archived crew or a missing membership, no self-only fallback', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, eve, bp[0])
    await assert.rejects(crewStatus(db, eve), authError('ACTIVE_GROUP_NOT_ALLOWED'))

    await mark(db, alice, bp[1])
    await db.query('UPDATE public.user_settings SET active_group_id = $1 WHERE user_id = $2', [archivedCrew, alice])
    await assert.rejects(crewStatus(db, alice), authError('ACTIVE_GROUP_NOT_ALLOWED'))

    await db.query('UPDATE public.groups SET archived_at = now() WHERE id = $1', [crew])
    await assert.rejects(crewStatus(db, bob), authError('ACTIVE_GROUP_NOT_ALLOWED'))
  } finally { await db.close() }
})

test('D: SELF has priority over CREW; only other members\' nicknames are listed', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, alice, bp[0])
    await mark(db, bob, bp[0])
    await mark(db, bob, bp[1])
    await mark(db, alice, bp[2])
    const rows = await crewStatus(db, alice)
    assert.deepEqual(rows, byId([
      { blueprint_id: bp[0], status: 'SELF', crew_owner_nicknames: ['Bob'] },
      { blueprint_id: bp[1], status: 'CREW', crew_owner_nicknames: ['Bob'] },
      { blueprint_id: bp[2], status: 'SELF', crew_owner_nicknames: [] },
    ]))
    assert.ok(rows.every(r => !r.crew_owner_nicknames.includes('alice')))
  } finally { await db.close() }
})

test('D: unknown ownership is not returned and never classified as "not owned"', async () => {
  const { db, bp } = await setup()
  try {
    assert.deepEqual(await crewStatus(db, alice), [])
    await mark(db, bob, bp[1])
    const rows = await crewStatus(db, alice)
    assert.deepEqual(rows.map(r => r.blueprint_id), [bp[1]])
    assert.ok(rows.every(r => r.status === 'SELF' || r.status === 'CREW'))
  } finally { await db.close() }
})

test('D: users outside the active crew stay invisible', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, carol, bp[3]) // other crew
    await mark(db, eve, bp[3]) // not a member, although her setting points at the crew
    await mark(db, zed, bp[3]) // no crew at all
    assert.deepEqual(await crewStatus(db, alice), [])
    // bob shares the archived crew with alice: it never contributes.
    await db.query('DELETE FROM public.group_members WHERE group_id = $1 AND user_id = $2', [crew, bob])
    await mark(db, bob, bp[4])
    assert.deepEqual(await crewStatus(db, alice), [])
  } finally { await db.close() }
})

test('D: leaving the crew removes the derived view in both directions', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, alice, bp[0])
    await mark(db, bob, bp[0])
    await mark(db, bob, bp[1])
    assert.equal((await crewStatus(db, alice)).length, 2)
    await db.query('DELETE FROM public.group_members WHERE group_id = $1 AND user_id = $2', [crew, bob])
    assert.deepEqual(await crewStatus(db, alice), [
      { blueprint_id: bp[0], status: 'SELF', crew_owner_nicknames: [] },
    ])
    // bob still points at the crew but is no longer a member.
    await assert.rejects(crewStatus(db, bob), authError('ACTIVE_GROUP_NOT_ALLOWED'))
    // His personal ownership is untouched and still readable by himself.
    assert.equal((await ownRows(db, bob)).length, 2)
  } finally { await db.close() }
})

test('D: a missing profile never widens access or creates an alternative identity', async () => {
  const { db, bp } = await setup()
  try {
    await mark(db, dave, bp[0])
    await mark(db, bob, bp[1])
    // dave (no profile) contributes no row and no name to alice's view.
    assert.deepEqual(await crewStatus(db, alice), [
      { blueprint_id: bp[1], status: 'CREW', crew_owner_nicknames: ['Bob'] },
    ])
    // dave himself gets exactly the membership-based view, nothing more.
    assert.deepEqual(await crewStatus(db, dave), byId([
      { blueprint_id: bp[0], status: 'SELF', crew_owner_nicknames: [] },
      { blueprint_id: bp[1], status: 'CREW', crew_owner_nicknames: ['Bob'] },
    ]))
    // Removing dave's membership still removes his access despite no profile.
    await db.query('DELETE FROM public.group_members WHERE group_id = $1 AND user_id = $2', [crew, dave])
    await assert.rejects(crewStatus(db, dave), authError('ACTIVE_GROUP_NOT_ALLOWED'))
  } finally { await db.close() }
})

test('D: crew nicknames are ordered case-insensitively and deterministically', async () => {
  const { db, bp } = await setup()
  try {
    for (const user of [zed, adam]) {
      await db.query('INSERT INTO public.group_members (group_id, user_id) VALUES ($1, $2)', [crew, user])
      await mark(db, user, bp[2])
    }
    await mark(db, bob, bp[2])
    assert.deepEqual(await crewStatus(db, alice), [
      { blueprint_id: bp[2], status: 'CREW', crew_owner_nicknames: ['adam', 'Bob', 'Zed'] },
    ])
  } finally { await db.close() }
})
