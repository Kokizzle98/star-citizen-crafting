-- Blueprint Ownership / Tracking PR 2 — database foundation.
--
-- Repository migration only. Applying it to VECTOR Supabase Production needs a
-- separate, explicit, named owner GO (DB-ENV-04, DB-ENV-07) and read-only
-- postchecks recorded on the migration pull request (DB-ENV-08).
-- This migration creates objects only; it imports no data.
-- Contracts: database/migrations/blueprints/README.md.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preconditions. The crew and profile tables exist in Production but not as
-- repository migrations. Their verified contract is required here; anything
-- else fails closed instead of creating functions against an unknown schema.
-- New objects are created without IF NOT EXISTS / OR REPLACE, so an unexpected
-- existing blueprint table makes the migration fail. Functions can be
-- overloaded, so any existing public function with one of the four new names
-- is rejected here, whatever its argument list; nothing is dropped or replaced.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[];
  v_existing_functions text[];
BEGIN
  SELECT array_agg(p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
           ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid))
    INTO v_existing_functions
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('sync_scmdb_blueprint_catalog', 'mark_blueprint_owned',
      'unmark_blueprint_owned', 'get_active_crew_blueprint_status');
  IF v_existing_functions IS NOT NULL THEN
    RAISE EXCEPTION 'BLUEPRINT_MIGRATION_EXISTING_FUNCTION: %', v_existing_functions;
  END IF;

  SELECT array_agg(r.table_name || '.' || r.column_name ORDER BY r.table_name, r.column_name)
    INTO v_missing
  FROM (VALUES
    ('auth', 'users', 'id', 'uuid'),
    ('public', 'profiles', 'id', 'uuid'),
    ('public', 'profiles', 'nickname', 'text'),
    ('public', 'groups', 'id', 'uuid'),
    ('public', 'groups', 'archived_at', 'timestamp with time zone'),
    ('public', 'group_members', 'group_id', 'uuid'),
    ('public', 'group_members', 'user_id', 'uuid'),
    ('public', 'user_settings', 'user_id', 'uuid'),
    ('public', 'user_settings', 'active_group_id', 'uuid')
  ) AS r(table_schema, table_name, column_name, data_type)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = r.table_schema AND c.table_name = r.table_name
      AND c.column_name = r.column_name AND c.data_type = r.data_type
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'BLUEPRINT_MIGRATION_PRECONDITION_FAILED: %', v_missing;
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'BLUEPRINT_MIGRATION_PRECONDITION_FAILED: auth.uid()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'BLUEPRINT_MIGRATION_PRECONDITION_FAILED: roles';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Catalog: one imported SCMDB blueprint dataset per channel and version.
-- ---------------------------------------------------------------------------
CREATE TABLE public.scmdb_blueprint_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source = 'SCMDB'),
  channel text NOT NULL CHECK (channel IN ('LIVE', 'PTU')),
  version text NOT NULL CHECK (length(btrim(version)) > 0),
  catalog_source_file text NOT NULL CHECK (length(btrim(catalog_source_file)) > 0),
  reward_source_file text NOT NULL CHECK (length(btrim(reward_source_file)) > 0),
  status text NOT NULL CHECK (status IN ('STAGING', 'ACTIVE', 'FAILED', 'SUPERSEDED')),
  blueprint_total integer NOT NULL CHECK (blueprint_total >= 0),
  blueprint_valid integer NOT NULL CHECK (blueprint_valid >= 0),
  blueprint_review_required integer NOT NULL CHECK (blueprint_review_required >= 0),
  reward_total integer NOT NULL CHECK (reward_total >= 0),
  duplicate_source_rows integer NOT NULL CHECK (duplicate_source_rows >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scmdb_blueprint_datasets_identity_key UNIQUE (source, channel, version),
  CONSTRAINT scmdb_blueprint_datasets_blueprint_counts_check
    CHECK (blueprint_total::bigint = blueprint_valid::bigint + blueprint_review_required::bigint),
  CONSTRAINT scmdb_blueprint_datasets_duplicate_rows_check
    CHECK (duplicate_source_rows <= reward_total)
);

CREATE UNIQUE INDEX scmdb_blueprint_datasets_active_channel_idx
  ON public.scmdb_blueprint_datasets (source, channel) WHERE status = 'ACTIVE';

-- Stable VECTOR identity of a blueprint across dataset revisions
-- (PERSISTENCE_PROVENANCE_V1 §3). The SCMDB GUID is a provider-scoped external
-- identity; every observed GUID is a lowercase canonical UUID, so another form
-- fails closed instead of creating a case-variant second identity.
CREATE TABLE public.blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source = 'SCMDB'),
  source_guid text NOT NULL
    CHECK (source_guid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blueprints_source_guid_key UNIQUE (source, source_guid)
);

-- Dataset-specific content of one blueprint. `recipe` is the single SCMDB
-- recipe tier as normalized by lib/blueprints (more than one tier fails closed
-- in the extractor). `scmdb_is_default` is a raw source value only and never
-- creates or implies ownership.
CREATE TABLE public.scmdb_blueprint_catalog (
  dataset_id uuid NOT NULL REFERENCES public.scmdb_blueprint_datasets(id) ON DELETE CASCADE,
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE RESTRICT,
  source_tag text NOT NULL CHECK (length(btrim(source_tag)) > 0),
  product_entity_class text NOT NULL CHECK (length(btrim(product_entity_class)) > 0),
  product_name text CHECK (product_name IS NULL OR length(btrim(product_name)) > 0),
  gear text NOT NULL CHECK (length(btrim(gear)) > 0),
  type text CHECK (type IS NULL OR length(btrim(type)) > 0),
  subtype text CHECK (subtype IS NULL OR length(btrim(subtype)) > 0),
  manufacturer text CHECK (manufacturer IS NULL OR length(btrim(manufacturer)) > 0),
  recipe jsonb NOT NULL CHECK (jsonb_typeof(recipe) = 'object'),
  scmdb_is_default boolean NOT NULL,
  cig_data_error boolean NOT NULL,
  scmdb_suggested_name text
    CHECK (scmdb_suggested_name IS NULL OR length(btrim(scmdb_suggested_name)) > 0),
  review_state text NOT NULL CHECK (review_state IN ('VALID', 'REVIEW_REQUIRED')),
  issues text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id, blueprint_id),
  CONSTRAINT scmdb_blueprint_catalog_issue_vocabulary_check CHECK (
    array_position(issues, NULL) IS NULL
    AND issues <@ ARRAY['PRODUCT_NAME_MISSING', 'CIG_DATA_ERROR', 'SOURCE_SUGGESTED_NAME', 'RECIPE_MISSING']::text[]
  ),
  CONSTRAINT scmdb_blueprint_catalog_review_consistency_check CHECK (
    (review_state = 'VALID' AND cardinality(issues) = 0) OR
    (review_state = 'REVIEW_REQUIRED' AND cardinality(issues) > 0)
  )
);
CREATE INDEX scmdb_blueprint_catalog_blueprint_id_idx ON public.scmdb_blueprint_catalog (blueprint_id);

-- One concrete reward source occurrence inside one dataset. The business
-- identity is the composite source-occurrence key; `blueprint_id` is stored but
-- deliberately not part of it, so a wrong mapping surfaces as a conflict
-- instead of a second row. Duplicate business references stay separate rows.
-- The composite foreign key makes an unresolved blueprint reference impossible.
CREATE TABLE public.scmdb_blueprint_reward_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.scmdb_blueprint_datasets(id) ON DELETE CASCADE,
  source_contract_id text NOT NULL CHECK (length(btrim(source_contract_id)) > 0),
  source_reward_index integer NOT NULL CHECK (source_reward_index >= 0),
  source_pool_guid text NOT NULL CHECK (length(btrim(source_pool_guid)) > 0),
  source_pool_entry_index integer NOT NULL CHECK (source_pool_entry_index >= 0),
  blueprint_id uuid NOT NULL,
  pool_name text NOT NULL CHECK (length(btrim(pool_name)) > 0),
  pool_source text NOT NULL CHECK (length(btrim(pool_source)) > 0),
  contract_debug_name text NOT NULL CHECK (length(btrim(contract_debug_name)) > 0),
  contract_category text CHECK (contract_category IS NULL OR length(btrim(contract_category)) > 0),
  contract_mission_type text
    CHECK (contract_mission_type IS NULL OR length(btrim(contract_mission_type)) > 0),
  trigger text NOT NULL CHECK (length(btrim(trigger)) > 0),
  chance numeric NOT NULL,
  weight numeric NOT NULL,
  has_source_known_issue boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scmdb_blueprint_reward_sources_occurrence_key UNIQUE
    (dataset_id, source_contract_id, source_reward_index, source_pool_guid, source_pool_entry_index),
  CONSTRAINT scmdb_blueprint_reward_sources_catalog_fkey FOREIGN KEY (dataset_id, blueprint_id)
    REFERENCES public.scmdb_blueprint_catalog(dataset_id, blueprint_id) ON DELETE CASCADE
);
CREATE INDEX scmdb_blueprint_reward_sources_dataset_blueprint_idx
  ON public.scmdb_blueprint_reward_sources (dataset_id, blueprint_id);

-- Personal VECTOR ownership. A row means VECTOR knows the blueprint as owned by
-- this user; no row means ownership is not known, never "not owned". Ownership
-- depends on auth.users only, never on a game account, crew or dataset.
CREATE TABLE public.user_blueprint_ownership (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE RESTRICT,
  provenance text NOT NULL CHECK (provenance IN ('MANUAL', 'GAME_LOG', 'COMPANION')),
  source_reference text CHECK (source_reference IS NULL OR length(btrim(source_reference)) > 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blueprint_id)
);
CREATE INDEX user_blueprint_ownership_blueprint_id_idx ON public.user_blueprint_ownership (blueprint_id);

-- ---------------------------------------------------------------------------
-- RLS and grants. Grants are stated explicitly for every application role so
-- the result does not depend on the project's default privileges.
-- ---------------------------------------------------------------------------
ALTER TABLE public.scmdb_blueprint_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scmdb_blueprint_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scmdb_blueprint_reward_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blueprint_ownership ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.scmdb_blueprint_datasets, public.blueprints, public.scmdb_blueprint_catalog,
  public.scmdb_blueprint_reward_sources, public.user_blueprint_ownership
  FROM PUBLIC, anon, authenticated, service_role;

-- Catalog: readable by signed-in users only. anon and authenticated have no
-- write privilege. service_role is the trusted server path and technically
-- holds direct write privileges; its intended application path is
-- sync_scmdb_blueprint_catalog(), which enforces the LIVE-only,
-- classification and count checks. Those checks are not a database boundary
-- against a deliberate direct service_role write. service_role credentials
-- stay server-side only.
GRANT SELECT ON public.scmdb_blueprint_datasets, public.blueprints, public.scmdb_blueprint_catalog,
  public.scmdb_blueprint_reward_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scmdb_blueprint_datasets, public.scmdb_blueprint_catalog,
  public.scmdb_blueprint_reward_sources TO service_role;
GRANT SELECT, INSERT ON public.blueprints TO service_role;

CREATE POLICY scmdb_blueprint_datasets_read ON public.scmdb_blueprint_datasets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY blueprints_read ON public.blueprints
  FOR SELECT TO authenticated USING (true);
CREATE POLICY scmdb_blueprint_catalog_read ON public.scmdb_blueprint_catalog
  FOR SELECT TO authenticated USING (true);
CREATE POLICY scmdb_blueprint_reward_sources_read ON public.scmdb_blueprint_reward_sources
  FOR SELECT TO authenticated USING (true);

-- Ownership: own rows readable directly; writes only through the RPCs below;
-- other users' ownership only through the crew RPC.
GRANT SELECT ON public.user_blueprint_ownership TO authenticated;
CREATE POLICY user_blueprint_ownership_read_own ON public.user_blueprint_ownership
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- sync_scmdb_blueprint_catalog: executable by service_role only.
-- SECURITY INVOKER: it runs with service_role's own table grants above, so no
-- definer rights are needed; its checks bind callers of this function, not a
-- direct service_role write. LIVE only in this version; PTU import stays
-- out of scope. Validation completes before anything is written; the whole
-- call is one transaction.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.sync_scmdb_blueprint_catalog(
  p_source text, p_channel text, p_version text,
  p_catalog_source_file text, p_reward_source_file text,
  p_blueprint_total integer, p_blueprint_valid integer, p_blueprint_review_required integer,
  p_reward_total integer, p_duplicate_source_rows integer,
  p_blueprints jsonb, p_rewards jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_existing public.scmdb_blueprint_datasets%ROWTYPE;
  v_row jsonb;
  v_recipe jsonb;
  v_expected_issues text[];
  v_valid integer := 0;
  v_review integer := 0;
  v_count bigint;
  v_stored jsonb;
  v_input jsonb;
BEGIN
  IF p_source IS DISTINCT FROM 'SCMDB'
    OR p_version IS NULL OR length(pg_catalog.btrim(p_version)) = 0
    OR p_catalog_source_file IS NULL OR length(pg_catalog.btrim(p_catalog_source_file)) = 0
    OR p_reward_source_file IS NULL OR length(pg_catalog.btrim(p_reward_source_file)) = 0
    OR p_blueprint_total IS NULL OR p_blueprint_valid IS NULL OR p_blueprint_review_required IS NULL
    OR p_reward_total IS NULL OR p_duplicate_source_rows IS NULL
    OR least(p_blueprint_total, p_blueprint_valid, p_blueprint_review_required, p_reward_total, p_duplicate_source_rows) < 0
    OR p_blueprint_total::bigint <> p_blueprint_valid::bigint + p_blueprint_review_required::bigint
    OR p_duplicate_source_rows > p_reward_total
    OR p_blueprints IS NULL OR jsonb_typeof(p_blueprints) <> 'array'
    OR p_rewards IS NULL OR jsonb_typeof(p_rewards) <> 'array' THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_INVALID_METADATA' USING ERRCODE = '22023';
  END IF;
  IF p_channel IS DISTINCT FROM 'LIVE' THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_CHANNEL_UNSUPPORTED' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_blueprints) <> p_blueprint_total
    OR jsonb_array_length(p_rewards) <> p_reward_total THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_COUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  -- Blueprint rows: exact shape, normalized recipe, recomputed issues.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_blueprints) LOOP
    IF jsonb_typeof(v_row) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(v_row)) <> 14
      OR NOT (v_row ?& ARRAY['source_guid', 'source_tag', 'product_entity_class', 'product_name', 'gear',
        'type', 'subtype', 'manufacturer', 'recipe', 'scmdb_is_default', 'cig_data_error',
        'scmdb_suggested_name', 'review_state', 'issues'])
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['source_guid', 'source_tag', 'product_entity_class', 'gear', 'review_state']) AS k
                 WHERE jsonb_typeof(v_row->k) IS DISTINCT FROM 'string' OR length(pg_catalog.btrim(v_row->>k)) = 0)
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['product_name', 'type', 'subtype', 'manufacturer', 'scmdb_suggested_name']) AS k
                 WHERE jsonb_typeof(v_row->k) NOT IN ('string', 'null')
                   OR (jsonb_typeof(v_row->k) = 'string' AND length(pg_catalog.btrim(v_row->>k)) = 0))
      OR jsonb_typeof(v_row->'scmdb_is_default') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_row->'cig_data_error') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_row->'issues') IS DISTINCT FROM 'array'
      OR (v_row->>'source_guid') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_INVALID_BLUEPRINT' USING ERRCODE = '22023';
    END IF;
    v_recipe := v_row->'recipe';
    IF jsonb_typeof(v_recipe) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(v_recipe)) <> 2
      OR (CASE WHEN jsonb_typeof(v_recipe->'craftTimeSeconds') = 'number'
           THEN (v_recipe->'craftTimeSeconds')::numeric < 0 ELSE true END)
      OR jsonb_typeof(v_recipe->'slots') IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_recipe->'slots') AS s
        WHERE jsonb_typeof(s) <> 'object'
          OR (SELECT count(*) FROM jsonb_object_keys(s)) <> 2
          OR jsonb_typeof(s->'name') IS DISTINCT FROM 'string' OR length(pg_catalog.btrim(s->>'name')) = 0
          OR jsonb_typeof(s->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'options') = 0
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(s->'options') AS o
            WHERE jsonb_typeof(o) <> 'object'
              OR (SELECT count(*) FROM jsonb_object_keys(o)) <> 4
              OR jsonb_typeof(o->'kind') IS DISTINCT FROM 'string' OR (o->>'kind') NOT IN ('RESOURCE', 'ITEM')
              OR jsonb_typeof(o->'name') IS DISTINCT FROM 'string' OR length(pg_catalog.btrim(o->>'name')) = 0
              OR (CASE WHEN jsonb_typeof(o->'quantity') = 'number' THEN (o->'quantity')::numeric <= 0 ELSE true END)
              OR (CASE WHEN jsonb_typeof(o->'minQuality') = 'number' THEN (o->'minQuality')::numeric < 0 ELSE true END)
          )
      ) THEN
      RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_INVALID_BLUEPRINT' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') AS i WHERE jsonb_typeof(i) <> 'string') THEN
      RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_INVALID_BLUEPRINT' USING ERRCODE = '22023';
    END IF;
    -- Issues are observations recomputed from the row itself, in the fixed
    -- order of lib/blueprints/blueprint-normalizer.ts; any difference fails.
    v_expected_issues := ARRAY[]::text[];
    IF jsonb_typeof(v_row->'product_name') = 'null' THEN
      v_expected_issues := v_expected_issues || 'PRODUCT_NAME_MISSING'::text;
    END IF;
    IF (v_row->>'cig_data_error')::boolean THEN
      v_expected_issues := v_expected_issues || 'CIG_DATA_ERROR'::text;
    END IF;
    IF jsonb_typeof(v_row->'scmdb_suggested_name') = 'string' THEN
      v_expected_issues := v_expected_issues || 'SOURCE_SUGGESTED_NAME'::text;
    END IF;
    IF jsonb_array_length(v_recipe->'slots') = 0 THEN
      v_expected_issues := v_expected_issues || 'RECIPE_MISSING'::text;
    END IF;
    IF ARRAY(SELECT jsonb_array_elements_text(v_row->'issues')) IS DISTINCT FROM v_expected_issues
      OR (v_row->>'review_state') IS DISTINCT FROM
         (CASE WHEN cardinality(v_expected_issues) = 0 THEN 'VALID' ELSE 'REVIEW_REQUIRED' END) THEN
      RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_CLASSIFICATION_MISMATCH' USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_expected_issues) = 0 THEN
      v_valid := v_valid + 1;
    ELSE
      v_review := v_review + 1;
    END IF;
  END LOOP;
  IF v_valid <> p_blueprint_valid OR v_review <> p_blueprint_review_required THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_COUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT value->>'source_guid') FROM jsonb_array_elements(p_blueprints)) <> p_blueprint_total THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_DUPLICATE_SOURCE_GUID' USING ERRCODE = '22023';
  END IF;

  -- Reward rows: exact shape and integer source-occurrence indices.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rewards) LOOP
    IF jsonb_typeof(v_row) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(v_row)) <> 14
      OR NOT (v_row ?& ARRAY['source_contract_id', 'source_reward_index', 'source_pool_guid',
        'source_pool_entry_index', 'blueprint_source_guid', 'pool_name', 'pool_source',
        'contract_debug_name', 'contract_category', 'contract_mission_type', 'trigger', 'chance',
        'weight', 'has_source_known_issue'])
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['source_contract_id', 'source_pool_guid', 'blueprint_source_guid',
                   'pool_name', 'pool_source', 'contract_debug_name', 'trigger']) AS k
                 WHERE jsonb_typeof(v_row->k) IS DISTINCT FROM 'string' OR length(pg_catalog.btrim(v_row->>k)) = 0)
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['contract_category', 'contract_mission_type']) AS k
                 WHERE jsonb_typeof(v_row->k) NOT IN ('string', 'null')
                   OR (jsonb_typeof(v_row->k) = 'string' AND length(pg_catalog.btrim(v_row->>k)) = 0))
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['source_reward_index', 'source_pool_entry_index']) AS k
                 WHERE CASE WHEN jsonb_typeof(v_row->k) = 'number'
                   THEN (v_row->k)::numeric < 0 OR (v_row->k)::numeric > 2147483647
                     OR (v_row->k)::numeric <> trunc((v_row->k)::numeric)
                   ELSE true END)
      OR jsonb_typeof(v_row->'chance') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_row->'weight') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_row->'has_source_known_issue') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_INVALID_REWARD' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Source occurrence identity: unique per dataset.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rewards) AS r
    GROUP BY r->>'source_contract_id', (r->>'source_reward_index')::integer,
      r->>'source_pool_guid', (r->>'source_pool_entry_index')::integer
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_DUPLICATE_REWARD_OCCURRENCE' USING ERRCODE = '22023';
  END IF;

  -- LIVE references must resolve inside the same dataset: no fallback, no
  -- synthetic blueprint, no mapping onto a similar blueprint.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rewards) AS r
    LEFT JOIN jsonb_array_elements(p_blueprints) AS b ON b->>'source_guid' = r->>'blueprint_source_guid'
    WHERE b IS NULL
  ) THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_REWARD_BLUEPRINT_UNRESOLVED' USING ERRCODE = '22023';
  END IF;

  -- Stable assignments: one reward points to one pool with one set of reward
  -- and contract attributes; one pool entry is one blueprint with one weight;
  -- every reward expands its pool completely (entry positions 0..n-1) and
  -- every use of the same pool expands it to the same length.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT r->>'source_pool_guid' AS pool_guid, count(*) AS entries
      FROM jsonb_array_elements(p_rewards) AS r
      GROUP BY r->>'source_contract_id', (r->>'source_reward_index')::integer, r->>'source_pool_guid'
    ) AS expansion
    GROUP BY expansion.pool_guid
    HAVING count(DISTINCT expansion.entries) <> 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rewards) AS r
    GROUP BY r->>'source_contract_id', (r->>'source_reward_index')::integer
    HAVING count(DISTINCT r->>'source_pool_guid') <> 1
      OR count(DISTINCT r->>'trigger') <> 1
      OR count(DISTINCT (r->>'chance')::numeric) <> 1
      OR max((r->>'source_pool_entry_index')::integer) + 1 <> count(*)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rewards) AS r
    GROUP BY r->>'source_contract_id'
    HAVING count(DISTINCT r->>'contract_debug_name') <> 1
      OR count(DISTINCT r->'contract_category') <> 1
      OR count(DISTINCT r->'contract_mission_type') <> 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rewards) AS r
    GROUP BY r->>'source_pool_guid'
    HAVING count(DISTINCT r->>'pool_name') <> 1 OR count(DISTINCT r->>'pool_source') <> 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rewards) AS r
    GROUP BY r->>'source_pool_guid', (r->>'source_pool_entry_index')::integer
    HAVING count(DISTINCT r->>'blueprint_source_guid') <> 1
      OR count(DISTINCT (r->>'weight')::numeric) <> 1
      OR count(DISTINCT (r->>'has_source_known_issue')::boolean) <> 1
  ) THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_UNSTABLE_REWARD_ASSIGNMENT' USING ERRCODE = '22023';
  END IF;

  -- duplicateSourceRows: rows that repeat a contract + pool + blueprint
  -- combination. Recomputed here; a mismatch with the declared value fails.
  SELECT count(*) - count(DISTINCT (r->>'source_contract_id', r->>'source_pool_guid', r->>'blueprint_source_guid'))
    INTO v_count FROM jsonb_array_elements(p_rewards) AS r;
  IF v_count <> p_duplicate_source_rows THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_DUPLICATE_COUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  -- Write phase.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scmdb_blueprint_catalog:' || p_source || ':' || p_channel, 0));

  SELECT d.* INTO v_existing FROM public.scmdb_blueprint_datasets d
    WHERE d.source = p_source AND d.channel = p_channel AND d.version = p_version FOR UPDATE;
  IF v_existing.id IS NOT NULL AND v_existing.status = 'ACTIVE'
    AND v_existing.catalog_source_file = p_catalog_source_file
    AND v_existing.reward_source_file = p_reward_source_file
    AND v_existing.blueprint_total = p_blueprint_total AND v_existing.blueprint_valid = p_blueprint_valid
    AND v_existing.blueprint_review_required = p_blueprint_review_required
    AND v_existing.reward_total = p_reward_total
    AND v_existing.duplicate_source_rows = p_duplicate_source_rows THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'source_guid', b.source_guid, 'source_tag', c.source_tag,
        'product_entity_class', c.product_entity_class, 'product_name', c.product_name,
        'gear', c.gear, 'type', c.type, 'subtype', c.subtype, 'manufacturer', c.manufacturer,
        'recipe', c.recipe, 'scmdb_is_default', c.scmdb_is_default, 'cig_data_error', c.cig_data_error,
        'scmdb_suggested_name', c.scmdb_suggested_name, 'review_state', c.review_state,
        'issues', to_jsonb(c.issues)) ORDER BY b.source_guid COLLATE "C"), '[]'::jsonb)
      INTO v_stored
    FROM public.scmdb_blueprint_catalog c JOIN public.blueprints b ON b.id = c.blueprint_id
    WHERE c.dataset_id = v_existing.id;
    SELECT coalesce(jsonb_agg(value ORDER BY (value->>'source_guid') COLLATE "C"), '[]'::jsonb)
      INTO v_input FROM jsonb_array_elements(p_blueprints);
    IF v_stored = v_input THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
          'source_contract_id', r.source_contract_id, 'source_reward_index', r.source_reward_index,
          'source_pool_guid', r.source_pool_guid, 'source_pool_entry_index', r.source_pool_entry_index,
          'blueprint_source_guid', b.source_guid, 'pool_name', r.pool_name, 'pool_source', r.pool_source,
          'contract_debug_name', r.contract_debug_name, 'contract_category', r.contract_category,
          'contract_mission_type', r.contract_mission_type, 'trigger', r.trigger,
          'chance', r.chance, 'weight', r.weight, 'has_source_known_issue', r.has_source_known_issue)
          ORDER BY r.source_contract_id COLLATE "C", r.source_reward_index,
            r.source_pool_guid COLLATE "C", r.source_pool_entry_index), '[]'::jsonb)
        INTO v_stored
      FROM public.scmdb_blueprint_reward_sources r JOIN public.blueprints b ON b.id = r.blueprint_id
      WHERE r.dataset_id = v_existing.id;
      SELECT coalesce(jsonb_agg(value ORDER BY (value->>'source_contract_id') COLLATE "C",
          (value->>'source_reward_index')::integer, (value->>'source_pool_guid') COLLATE "C",
          (value->>'source_pool_entry_index')::integer), '[]'::jsonb)
        INTO v_input FROM jsonb_array_elements(p_rewards);
      IF v_stored = v_input THEN
        RETURN v_existing.id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.scmdb_blueprint_datasets (source, channel, version, catalog_source_file,
    reward_source_file, status, blueprint_total, blueprint_valid, blueprint_review_required,
    reward_total, duplicate_source_rows)
  VALUES (p_source, p_channel, p_version, p_catalog_source_file, p_reward_source_file, 'STAGING',
    p_blueprint_total, p_blueprint_valid, p_blueprint_review_required, p_reward_total, p_duplicate_source_rows)
  ON CONFLICT (source, channel, version) DO UPDATE SET
    catalog_source_file = EXCLUDED.catalog_source_file, reward_source_file = EXCLUDED.reward_source_file,
    status = 'STAGING', blueprint_total = EXCLUDED.blueprint_total,
    blueprint_valid = EXCLUDED.blueprint_valid, blueprint_review_required = EXCLUDED.blueprint_review_required,
    reward_total = EXCLUDED.reward_total, duplicate_source_rows = EXCLUDED.duplicate_source_rows,
    updated_at = now()
  RETURNING id INTO v_id;

  -- Replacing the catalog rows of this dataset also removes its reward rows.
  DELETE FROM public.scmdb_blueprint_catalog WHERE dataset_id = v_id;

  -- Stable identities are created once and never deleted by a sync.
  INSERT INTO public.blueprints (source, source_guid)
  SELECT 'SCMDB', b->>'source_guid' FROM jsonb_array_elements(p_blueprints) AS b
  ON CONFLICT (source, source_guid) DO NOTHING;

  INSERT INTO public.scmdb_blueprint_catalog (dataset_id, blueprint_id, source_tag, product_entity_class,
    product_name, gear, type, subtype, manufacturer, recipe, scmdb_is_default, cig_data_error,
    scmdb_suggested_name, review_state, issues)
  SELECT v_id, bp.id, b->>'source_tag', b->>'product_entity_class', b->>'product_name', b->>'gear',
    b->>'type', b->>'subtype', b->>'manufacturer', b->'recipe', (b->>'scmdb_is_default')::boolean,
    (b->>'cig_data_error')::boolean, b->>'scmdb_suggested_name', b->>'review_state',
    ARRAY(SELECT jsonb_array_elements_text(b->'issues'))
  FROM jsonb_array_elements(p_blueprints) AS b
  JOIN public.blueprints bp ON bp.source = 'SCMDB' AND bp.source_guid = b->>'source_guid';

  INSERT INTO public.scmdb_blueprint_reward_sources (dataset_id, source_contract_id, source_reward_index,
    source_pool_guid, source_pool_entry_index, blueprint_id, pool_name, pool_source, contract_debug_name,
    contract_category, contract_mission_type, trigger, chance, weight, has_source_known_issue)
  SELECT v_id, r->>'source_contract_id', (r->>'source_reward_index')::integer, r->>'source_pool_guid',
    (r->>'source_pool_entry_index')::integer, bp.id, r->>'pool_name', r->>'pool_source',
    r->>'contract_debug_name', r->>'contract_category', r->>'contract_mission_type', r->>'trigger',
    (r->>'chance')::numeric, (r->>'weight')::numeric, (r->>'has_source_known_issue')::boolean
  FROM jsonb_array_elements(p_rewards) AS r
  JOIN public.blueprints bp ON bp.source = 'SCMDB' AND bp.source_guid = r->>'blueprint_source_guid';

  -- Verify what was stored, not only what was sent.
  IF (SELECT count(*) FROM public.scmdb_blueprint_catalog WHERE dataset_id = v_id) <> p_blueprint_total
    OR (SELECT count(*) FROM public.scmdb_blueprint_reward_sources WHERE dataset_id = v_id) <> p_reward_total THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_COUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) - count(DISTINCT (r.source_contract_id, r.source_pool_guid, r.blueprint_id))
    INTO v_count FROM public.scmdb_blueprint_reward_sources r WHERE r.dataset_id = v_id;
  IF v_count <> p_duplicate_source_rows THEN
    RAISE EXCEPTION 'SCMDB_BLUEPRINT_SYNC_DUPLICATE_COUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  UPDATE public.scmdb_blueprint_datasets SET status = 'SUPERSEDED', updated_at = now()
    WHERE source = p_source AND channel = p_channel AND status = 'ACTIVE' AND id <> v_id;
  UPDATE public.scmdb_blueprint_datasets SET status = 'ACTIVE', updated_at = now() WHERE id = v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_scmdb_blueprint_catalog(text, text, text, text, text, integer, integer,
  integer, integer, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_scmdb_blueprint_catalog(text, text, text, text, text, integer, integer,
  integer, integer, integer, jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Personal ownership writes. SECURITY DEFINER is required because signed-in
-- users have no direct write grant on user_blueprint_ownership. The functions
-- always act for auth.uid(); they take no user id and always write MANUAL.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.mark_blueprint_owned(p_blueprint_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;
  IF p_blueprint_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.blueprints b WHERE b.id = p_blueprint_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'BLUEPRINT_NOT_FOUND';
  END IF;
  -- Idempotent: an existing row keeps its original provenance and time.
  INSERT INTO public.user_blueprint_ownership (user_id, blueprint_id, provenance, source_reference)
  VALUES (v_actor, p_blueprint_id, 'MANUAL', NULL)
  ON CONFLICT (user_id, blueprint_id) DO NOTHING;
END;
$$;

CREATE FUNCTION public.unmark_blueprint_owned(p_blueprint_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;
  IF p_blueprint_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.blueprints b WHERE b.id = p_blueprint_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'BLUEPRINT_NOT_FOUND';
  END IF;
  -- Removes only the caller's own row; the state returns to "not known".
  DELETE FROM public.user_blueprint_ownership o
  WHERE o.user_id = v_actor AND o.blueprint_id = p_blueprint_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Derived crew view. Takes over the security contract of
-- get_active_group_inventory(): it validates auth.uid(), the active crew,
-- the caller's membership and the archive state itself before it reads any
-- other user's ownership. No self-only fallback. SECURITY DEFINER is required
-- because RLS hides other users' ownership rows from the caller.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_active_crew_blueprint_status()
RETURNS TABLE (blueprint_id uuid, status text, crew_owner_nicknames text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_actor uuid := auth.uid();
  v_active_group_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  SELECT us.active_group_id INTO v_active_group_id
  FROM public.user_settings us
  WHERE us.user_id = v_actor;

  IF v_active_group_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTIVE_GROUP_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = v_actor
      AND gm.group_id = v_active_group_id
      AND g.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTIVE_GROUP_NOT_ALLOWED';
  END IF;

  -- SELF > CREW. Blueprints without any known ownership are not returned:
  -- missing rows mean "not known", never "not owned". Other members are named
  -- by profiles.nickname only; a member without a profile contributes nothing.
  RETURN QUERY
  WITH own AS (
    SELECT o.blueprint_id
    FROM public.user_blueprint_ownership o
    WHERE o.user_id = v_actor
  ), crew AS (
    SELECT o.blueprint_id,
      array_agg(p.nickname ORDER BY lower(p.nickname) COLLATE "C") AS nicknames
    FROM public.group_members gm
    JOIN public.profiles p ON p.id = gm.user_id
    JOIN public.user_blueprint_ownership o ON o.user_id = gm.user_id
    WHERE gm.group_id = v_active_group_id
      AND gm.user_id <> v_actor
    GROUP BY o.blueprint_id
  )
  SELECT coalesce(own.blueprint_id, crew.blueprint_id),
    CASE WHEN own.blueprint_id IS NOT NULL THEN 'SELF' ELSE 'CREW' END,
    coalesce(crew.nicknames, ARRAY[]::text[])
  FROM own
  FULL JOIN crew ON crew.blueprint_id = own.blueprint_id
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_blueprint_owned(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.unmark_blueprint_owned(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_active_crew_blueprint_status() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_blueprint_owned(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmark_blueprint_owned(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_crew_blueprint_status() TO authenticated;

COMMIT;
