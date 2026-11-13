-- =====================================================================
-- READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN
-- =====================================================================
-- Inhalt:        Tabellen und Spalten (Typ, NOT NULL, DEFAULT, Identity, Generated) Schema public
-- Quelle:        Supabase Production (main), nur Katalog-SELECTs (pg_class, pg_attribute, pg_attrdef), keine Tabellenzeilen
-- Erfassungsdatum: 2026-11-13
-- Basis-Commit:  210cb07b4c23fcd003b1b12d01ee3655b7f44519 (develop)
-- Snapshot-Version: v1.0
--
-- Hinweise:
--  * Referenzdarstellung in CREATE-TABLE-Form, damit sie lesbar ist. Es sind NUR Spalten.
--    Constraints, Indizes, Trigger: 04_constraints_indexes_triggers.sql. RLS, Policies, Grants: 05_rls_policies_grants.sql.
--  * Spaltenreihenfolge = physische Reihenfolge (attnum). Die Tabelle inventory enthaelt
--    zusaetzlich die alte Spalte "location" (text, nullable) neben location_id.
--  * Fremdschluessel auf auth.users verweisen auf das Supabase-Auth-Schema (nicht Teil dieses Snapshots).
-- =====================================================================

DO $guard$ BEGIN RAISE EXCEPTION 'READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN'; END $guard$;

CREATE TABLE public.blueprints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_guid text NOT NULL,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.crew_audit_log (
  id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  group_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.game_account_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_account_id uuid NOT NULL,
  provider_code text NOT NULL,
  claim_code text NOT NULL,
  value_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'CURRENT'::text,
  issued_at timestamp with time zone,
  observed_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.game_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_code text NOT NULL,
  provider_code text,
  provider_subject text,
  external_account_id text,
  handle text NOT NULL,
  normalized_handle text GENERATED ALWAYS AS (lower(btrim(handle))) STORED,
  display_name text,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'::text,
  verification_method text NOT NULL DEFAULT 'NONE'::text,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamp with time zone,
  last_verified_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  stale_after timestamp with time zone,
  revoked_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.games (
  code text NOT NULL,
  display_name text NOT NULL,
  publisher text,
  status text NOT NULL DEFAULT 'ACTIVE'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.group_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  invited_user_id uuid NOT NULL,
  invited_by_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  responded_at timestamp with time zone
);

CREATE TABLE public.group_members (
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'MEMBER'::text,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  invited_by_user_id uuid
);

CREATE TABLE public.groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  archived_at timestamp with time zone
);

CREATE TABLE public.identity_audit_log (
  id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  user_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  provider_code text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.identity_oauth_flows (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  operation text NOT NULL,
  expected_provider text NOT NULL,
  pre_link_identity_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_path text NOT NULL DEFAULT '/app'::text,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  failed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.identity_providers (
  code text NOT NULL,
  display_name text NOT NULL,
  protocol text NOT NULL,
  issuer text,
  status text NOT NULL DEFAULT 'ACTIVE'::text,
  supports_login boolean NOT NULL DEFAULT false,
  supports_game_identity boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory (
  id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  player_name text NOT NULL,
  material text NOT NULL,
  amount numeric(25,6) NOT NULL,
  quality integer NOT NULL,
  location text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  amount_micro_scu bigint NOT NULL,
  input_unit text,
  location_id uuid NOT NULL
);

CREATE TABLE public.inventory_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  normalized_name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  nickname text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  primary_game_account_id uuid
);

CREATE TABLE public.scmdb_blueprint_catalog (
  dataset_id uuid NOT NULL,
  blueprint_id uuid NOT NULL,
  source_tag text NOT NULL,
  product_entity_class text NOT NULL,
  product_name text,
  gear text NOT NULL,
  type text,
  subtype text,
  manufacturer text,
  recipe jsonb NOT NULL,
  scmdb_is_default boolean NOT NULL,
  cig_data_error boolean NOT NULL,
  scmdb_suggested_name text,
  review_state text NOT NULL,
  issues text[] NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.scmdb_blueprint_datasets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  channel text NOT NULL,
  version text NOT NULL,
  catalog_source_file text NOT NULL,
  reward_source_file text NOT NULL,
  status text NOT NULL,
  blueprint_total integer NOT NULL,
  blueprint_valid integer NOT NULL,
  blueprint_review_required integer NOT NULL,
  reward_total integer NOT NULL,
  duplicate_source_rows integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.scmdb_blueprint_reward_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL,
  source_contract_id text NOT NULL,
  source_reward_index integer NOT NULL,
  source_pool_guid text NOT NULL,
  source_pool_entry_index integer NOT NULL,
  blueprint_id uuid NOT NULL,
  pool_name text NOT NULL,
  pool_source text NOT NULL,
  contract_debug_name text NOT NULL,
  contract_category text,
  contract_mission_type text,
  trigger text NOT NULL,
  chance numeric NOT NULL,
  weight numeric NOT NULL,
  has_source_known_issue boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.scmdb_location_catalog (
  dataset_id uuid NOT NULL,
  source_key text NOT NULL,
  canonical_name text NOT NULL,
  normalized_name text NOT NULL,
  location_type text NOT NULL,
  system_name text,
  planet_name text,
  moon_name text,
  classification text NOT NULL,
  issues text[] NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.scmdb_location_datasets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  channel text NOT NULL,
  version text NOT NULL,
  source_file text NOT NULL,
  status text NOT NULL,
  total integer NOT NULL,
  valid integer NOT NULL,
  quarantined integer NOT NULL,
  rejected_technical integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.scmdb_location_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  source_key text NOT NULL,
  inventory_location_id uuid NOT NULL,
  first_dataset_id uuid NOT NULL,
  last_dataset_id uuid NOT NULL,
  mapping_kind text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.user_app_roles (
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'USER'::text,
  granted_by uuid,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.user_blueprint_ownership (
  user_id uuid NOT NULL,
  blueprint_id uuid NOT NULL,
  provenance text NOT NULL,
  source_reference text,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.user_identities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider_code text NOT NULL,
  provider_subject text NOT NULL,
  identity_type text NOT NULL DEFAULT 'LOGIN'::text,
  handle text,
  display_name text,
  email_hint text,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'::text,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamp with time zone,
  last_verified_at timestamp with time zone,
  linked_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.user_settings (
  user_id uuid NOT NULL,
  active_group_id uuid,
  preferred_unit text NOT NULL DEFAULT 'AUTO'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
