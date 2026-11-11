// Shared PGlite fixture for the Blueprint PR 2 database contract tests.
//
// The crew and profile tables exist in Supabase Production but not as
// repository migrations. This fixture reproduces only the contract verified by
// the read-only prechecks recorded in docs/handover/VECTOR_RESTART_HANDOVER.md
// (section 5, prechecks A to D, EXECUTE precheck) and the PR 2 precheck of
// columns, auth.uid() and default privileges. It is not a baseline of the
// historical Production schema.
//
// Policies of groups, group_members and user_settings are not reproduced: RLS
// stays enabled with no policy (deny), which is stricter than Production and
// irrelevant for the new SECURITY DEFINER functions under test.
//
// Default privileges are deliberately wider than Production (ALL to every
// application role) so the tests prove that the migration's explicit REVOKE
// and GRANT statements decide the result, not the project's defaults.

import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'

export const migration = await readFile(
  new URL('../database/migrations/blueprints/001_blueprint_ownership_foundation.sql', import.meta.url),
  'utf8',
)

export const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const productionContractFixture = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE public.groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(name) BETWEEN 3 AND 60),
    description text,
    created_by_user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
  );
  CREATE TABLE public.group_members (
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    invited_by_user_id uuid,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE INDEX group_members_user_idx ON public.group_members (user_id, group_id);
  CREATE TABLE public.user_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    active_group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
    preferred_unit text NOT NULL DEFAULT 'AUTO',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname text NOT NULL CHECK (nickname ~ '^[A-Za-z0-9_-]{3,24}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    primary_game_account_id uuid
  );
  CREATE UNIQUE INDEX profiles_nickname_lower_uidx ON public.profiles (lower(nickname));

  ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  GRANT SELECT ON public.profiles TO authenticated;
  CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (true);

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`

export async function createDb({ withMigration = true } = {}) {
  const db = new PGlite()
  await db.exec(productionContractFixture)
  if (withMigration) await db.exec(migration)
  return db
}

/**
 * Runs `fn` inside a rolled-back-on-error transaction as `role`, with
 * `auth.uid()` returning `uid` (or NULL when `uid` is null).
 */
export async function as(db, role, uid, fn) {
  return db.transaction(async tx => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await tx.exec(`SET LOCAL ROLE ${role}`)
    return fn(tx)
  })
}

export async function addUser(db, id, nickname) {
  await db.query('INSERT INTO auth.users (id) VALUES ($1)', [id])
  if (nickname !== null) {
    await db.query('INSERT INTO public.profiles (id, nickname) VALUES ($1, $2)', [id, nickname])
  }
}

export async function addBlueprint(db, n) {
  const guid = uuid(5000 + n)
  const { rows } = await db.query(
    `INSERT INTO public.blueprints (source, source_guid) VALUES ('SCMDB', $1) RETURNING id`,
    [guid],
  )
  return rows[0].id
}

// --- sync payloads from the real PR 1 readers ------------------------------

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const moduleUrl = source => {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
}

async function loadReaders() {
  const [extractor, normalizer, composer, rewards] = await Promise.all([
    read('lib/blueprints/blueprint-extractor.ts'),
    read('lib/blueprints/blueprint-normalizer.ts'),
    read('lib/blueprints/blueprint-dataset.ts'),
    read('lib/blueprints/blueprint-reward-extractor.ts'),
  ])
  const source = composer
    .replace("'./blueprint-extractor'", JSON.stringify(moduleUrl(extractor)))
    .replace("'./blueprint-normalizer'", JSON.stringify(moduleUrl(normalizer)))
  return {
    prepareScmdbBlueprintDataset: (await import(moduleUrl(source))).prepareScmdbBlueprintDataset,
    extractScmdbBlueprintRewards: (await import(moduleUrl(rewards))).extractScmdbBlueprintRewards,
  }
}

export function toSyncPayload(catalog, rewards) {
  return {
    source: 'SCMDB',
    channel: catalog.channel,
    version: catalog.version,
    catalogSourceFile: catalog.sourceFile,
    rewardSourceFile: rewards.sourceFile,
    blueprintTotal: catalog.counts.total,
    blueprintValid: catalog.counts.valid,
    blueprintReviewRequired: catalog.counts.reviewRequired,
    rewardTotal: rewards.counts.rewards,
    duplicateSourceRows: rewards.counts.duplicateSourceRows,
    blueprints: catalog.blueprints.map(b => ({
      source_guid: b.sourceGuid,
      source_tag: b.sourceTag,
      product_entity_class: b.productEntityClass,
      product_name: b.productName,
      gear: b.gear,
      type: b.type,
      subtype: b.subtype,
      manufacturer: b.manufacturer,
      recipe: b.recipe,
      scmdb_is_default: b.scmdbIsDefault,
      cig_data_error: b.scmdbCigDataError,
      scmdb_suggested_name: b.scmdbSuggestedName,
      review_state: b.reviewState,
      issues: b.issues,
    })),
    rewards: rewards.rewards.map(r => ({
      source_contract_id: r.contractId,
      source_reward_index: r.sourceRewardIndex,
      source_pool_guid: r.poolGuid,
      source_pool_entry_index: r.sourcePoolEntryIndex,
      blueprint_source_guid: r.blueprintSourceGuid,
      pool_name: r.poolName,
      pool_source: r.poolSource,
      contract_debug_name: r.contractDebugName,
      contract_category: r.contractCategory,
      contract_mission_type: r.contractMissionType,
      trigger: r.trigger,
      chance: r.chance,
      weight: r.weight,
      has_source_known_issue: r.hasSourceKnownIssue,
    })),
  }
}

export async function realPayload(channel) {
  const { prepareScmdbBlueprintDataset, extractScmdbBlueprintRewards } = await loadReaders()
  const manifest = JSON.parse(await read('data/scmdb/latest.json'))
  const files = manifest.channels[channel.toLowerCase()].files
  const catalog = prepareScmdbBlueprintDataset(
    manifest, JSON.parse(await read(`data/scmdb/${files.crafting_blueprints}`)), channel)
  const rewards = extractScmdbBlueprintRewards(
    manifest, JSON.parse(await read(`data/scmdb/${files.merged}`)), channel)
  return toSyncPayload(catalog, rewards)
}

export const syncSql = `SELECT public.sync_scmdb_blueprint_catalog(
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb) AS id`

export const syncParams = p => [
  p.source, p.channel, p.version, p.catalogSourceFile, p.rewardSourceFile,
  p.blueprintTotal, p.blueprintValid, p.blueprintReviewRequired, p.rewardTotal,
  p.duplicateSourceRows, JSON.stringify(p.blueprints), JSON.stringify(p.rewards),
]

export async function sync(db, payload, role = 'service_role') {
  const { rows } = await as(db, role, null, tx => tx.query(syncSql, syncParams(payload)))
  return rows[0].id
}
