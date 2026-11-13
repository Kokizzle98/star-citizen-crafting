-- =====================================================================
-- READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN
-- =====================================================================
-- Inhalt:        Constraints (CHECK, FOREIGN KEY, PRIMARY KEY, UNIQUE), Indizes und Trigger Schema public
-- Quelle:        Supabase Production (main), nur Katalog-SELECTs
--                (pg_constraint/pg_get_constraintdef, pg_indexes, pg_trigger/pg_get_triggerdef), keine Tabellenzeilen
-- Erfassungsdatum: 2026-11-13
-- Basis-Commit:  210cb07b4c23fcd003b1b12d01ee3655b7f44519 (develop)
-- Snapshot-Version: v1.0
--
-- Hinweise:
--  * Constraints sortiert nach Tabelle, Typ (c, f, p, u), Name. Keine Exclusion-Constraints vorhanden.
--  * Indizes: nur solche, die nicht schon als PRIMARY KEY/UNIQUE-Constraint oben stehen.
--  * Trigger: nur benutzerdefinierte (nicht interne FK-Trigger). Alle sind aktiv (tgenabled = O).
--  * Hinweis: Fuer scmdb_location_datasets existiert die Funktion validate_scmdb_active_dataset_mappings(),
--    aber KEIN Trigger darauf (siehe Trigger-Abschnitt und Overview, Drift/Beobachtungen).
-- =====================================================================

DO $guard$ BEGIN RAISE EXCEPTION 'READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN'; END $guard$;

-- ---------------------------------------------------------------------
-- CONSTRAINTS
-- ---------------------------------------------------------------------

ALTER TABLE public.blueprints ADD CONSTRAINT blueprints_source_check CHECK ((source = 'SCMDB'::text));
ALTER TABLE public.blueprints ADD CONSTRAINT blueprints_source_guid_check CHECK ((source_guid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text));
ALTER TABLE public.blueprints ADD CONSTRAINT blueprints_pkey PRIMARY KEY (id);
ALTER TABLE public.blueprints ADD CONSTRAINT blueprints_source_guid_key UNIQUE (source, source_guid);
ALTER TABLE public.crew_audit_log ADD CONSTRAINT crew_audit_action_check CHECK ((action = ANY (ARRAY['CREW_CREATED'::text, 'CREW_UPDATED'::text, 'CREW_ARCHIVED'::text, 'CREW_RESTORED'::text, 'MEMBER_INVITED'::text, 'INVITE_REVOKED'::text, 'INVITE_ACCEPTED'::text, 'INVITE_DECLINED'::text, 'ROLE_CHANGED'::text, 'MEMBER_REMOVED'::text, 'MEMBER_LEFT'::text, 'OWNERSHIP_TRANSFERRED'::text])));
ALTER TABLE public.crew_audit_log ADD CONSTRAINT crew_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.crew_audit_log ADD CONSTRAINT crew_audit_log_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.crew_audit_log ADD CONSTRAINT crew_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.crew_audit_log ADD CONSTRAINT crew_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.game_account_claims ADD CONSTRAINT game_account_claims_code_check CHECK ((claim_code ~ '^[A-Za-z0-9_.:-]{1,128}$'::text));
ALTER TABLE public.game_account_claims ADD CONSTRAINT game_account_claims_expiry_check CHECK (((expires_at IS NULL) OR (issued_at IS NULL) OR (expires_at > issued_at)));
ALTER TABLE public.game_account_claims ADD CONSTRAINT game_account_claims_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public.game_account_claims ADD CONSTRAINT game_account_claims_status_check CHECK ((status = ANY (ARRAY['CURRENT'::text, 'STALE'::text, 'REVOKED'::text, 'CONFLICT'::text])));
ALTER TABLE public.game_account_claims ADD CONSTRAINT game_account_claims_game_account_id_fkey FOREIGN KEY (game_account_id) REFERENCES game_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.game_account_claims ADD CONSTRAINT game_account_claims_provider_code_fkey FOREIGN KEY (provider_code) REFERENCES identity_providers(code) ON DELETE RESTRICT;
ALTER TABLE public.game_account_claims ADD CONSTRAINT game_account_claims_pkey PRIMARY KEY (id);
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_handle_check CHECK ((btrim(handle) <> ''::text));
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_method_check CHECK ((verification_method = ANY (ARRAY['NONE'::text, 'OIDC_CLAIM'::text, 'OAUTH_PROFILE'::text, 'RSI_PROFILE_VERIFICATION'::text, 'MANUAL_ADMIN'::text, 'MIGRATION'::text])));
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_provider_check CHECK (((provider_subject IS NULL) OR (provider_code IS NOT NULL)));
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_revoked_check CHECK (((verification_status = 'REVOKED'::text) = (revoked_at IS NOT NULL)));
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_verification_check CHECK ((verification_status = ANY (ARRAY['UNVERIFIED'::text, 'PENDING'::text, 'VERIFIED'::text, 'STALE'::text, 'REVOKED'::text, 'CONFLICT'::text])));
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_verified_at_check CHECK (((verification_status <> ALL (ARRAY['VERIFIED'::text, 'STALE'::text])) OR (verified_at IS NOT NULL)));
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_game_code_fkey FOREIGN KEY (game_code) REFERENCES games(code) ON DELETE RESTRICT;
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_provider_code_fkey FOREIGN KEY (provider_code) REFERENCES identity_providers(code) ON DELETE RESTRICT;
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.games ADD CONSTRAINT games_code_check CHECK ((code ~ '^[A-Z][A-Z0-9_]{1,31}$'::text));
ALTER TABLE public.games ADD CONSTRAINT games_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public.games ADD CONSTRAINT games_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text, 'DEPRECATED'::text])));
ALTER TABLE public.games ADD CONSTRAINT games_pkey PRIMARY KEY (code);
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'DECLINED'::text, 'REVOKED'::text])));
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_pkey PRIMARY KEY (id);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_role_check CHECK ((role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MEMBER'::text])));
ALTER TABLE public.group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, user_id);
ALTER TABLE public.groups ADD CONSTRAINT groups_name_length CHECK (((char_length(btrim(name)) >= 3) AND (char_length(btrim(name)) <= 60)));
ALTER TABLE public.groups ADD CONSTRAINT groups_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE public.identity_audit_log ADD CONSTRAINT identity_audit_action_check CHECK ((action ~ '^[A-Z][A-Z0-9_]{2,63}$'::text));
ALTER TABLE public.identity_audit_log ADD CONSTRAINT identity_audit_details_check CHECK ((jsonb_typeof(details) = 'object'::text));
ALTER TABLE public.identity_audit_log ADD CONSTRAINT identity_audit_target_check CHECK ((target_type = ANY (ARRAY['USER_IDENTITY'::text, 'GAME_ACCOUNT'::text, 'GAME_ACCOUNT_CLAIM'::text, 'PROFILE_LINK'::text])));
ALTER TABLE public.identity_audit_log ADD CONSTRAINT identity_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.identity_audit_log ADD CONSTRAINT identity_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.identity_audit_log ADD CONSTRAINT identity_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.identity_oauth_flows ADD CONSTRAINT identity_oauth_flows_check CHECK ((expires_at > created_at));
ALTER TABLE public.identity_oauth_flows ADD CONSTRAINT identity_oauth_flows_check1 CHECK ((NOT ((consumed_at IS NOT NULL) AND (failed_at IS NOT NULL))));
ALTER TABLE public.identity_oauth_flows ADD CONSTRAINT identity_oauth_flows_operation_check CHECK ((operation = ANY (ARRAY['LINK_LOGIN'::text, 'VERIFY_GAME_ACCOUNT'::text])));
ALTER TABLE public.identity_oauth_flows ADD CONSTRAINT identity_oauth_flows_pre_link_identity_keys_check CHECK ((jsonb_typeof(pre_link_identity_keys) = 'array'::text));
ALTER TABLE public.identity_oauth_flows ADD CONSTRAINT identity_oauth_flows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.identity_oauth_flows ADD CONSTRAINT identity_oauth_flows_pkey PRIMARY KEY (id);
ALTER TABLE public.identity_providers ADD CONSTRAINT identity_providers_code_check CHECK ((code ~ '^[A-Z][A-Z0-9_]{1,31}$'::text));
ALTER TABLE public.identity_providers ADD CONSTRAINT identity_providers_issuer_check CHECK (((protocol <> ALL (ARRAY['OIDC'::text, 'OAUTH2'::text])) OR (issuer IS NOT NULL)));
ALTER TABLE public.identity_providers ADD CONSTRAINT identity_providers_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public.identity_providers ADD CONSTRAINT identity_providers_protocol_check CHECK ((protocol = ANY (ARRAY['OIDC'::text, 'OAUTH2'::text, 'INTERNAL'::text, 'VERIFICATION_ONLY'::text])));
ALTER TABLE public.identity_providers ADD CONSTRAINT identity_providers_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text, 'DEPRECATED'::text])));
ALTER TABLE public.identity_providers ADD CONSTRAINT identity_providers_pkey PRIMARY KEY (code);
ALTER TABLE public.inventory ADD CONSTRAINT inventory_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.inventory ADD CONSTRAINT inventory_amount_micro_scu_positive CHECK ((amount_micro_scu > 0));
ALTER TABLE public.inventory ADD CONSTRAINT inventory_quality_check CHECK (((quality >= 0) AND (quality <= 1000)));
ALTER TABLE public.inventory ADD CONSTRAINT inventory_location_id_fkey FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory ADD CONSTRAINT inventory_lot_identity_v1_key UNIQUE (user_id, material, quality, location_id);
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_canonical_name_nonblank CHECK ((btrim(canonical_name) <> ''::text));
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_normalized_name_canonical CHECK ((normalized_name = lower(btrim(canonical_name))));
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_normalized_name_nonblank CHECK ((btrim(normalized_name) <> ''::text));
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_unbekannt_system_check CHECK (((normalized_name <> 'unbekannt'::text) OR is_system));
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_normalized_name_key UNIQUE (normalized_name);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_nickname_format CHECK ((nickname ~ '^[A-Za-z0-9_-]{3,24}$'::text));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_primary_game_account_fk FOREIGN KEY (primary_game_account_id) REFERENCES game_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_gear_check CHECK ((length(btrim(gear)) > 0));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_issue_vocabulary_check CHECK (((array_position(issues, NULL::text) IS NULL) AND (issues <@ ARRAY['PRODUCT_NAME_MISSING'::text, 'CIG_DATA_ERROR'::text, 'SOURCE_SUGGESTED_NAME'::text, 'RECIPE_MISSING'::text])));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_manufacturer_check CHECK (((manufacturer IS NULL) OR (length(btrim(manufacturer)) > 0)));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_product_entity_class_check CHECK ((length(btrim(product_entity_class)) > 0));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_product_name_check CHECK (((product_name IS NULL) OR (length(btrim(product_name)) > 0)));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_recipe_check CHECK ((jsonb_typeof(recipe) = 'object'::text));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_review_consistency_check CHECK ((((review_state = 'VALID'::text) AND (cardinality(issues) = 0)) OR ((review_state = 'REVIEW_REQUIRED'::text) AND (cardinality(issues) > 0))));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_review_state_check CHECK ((review_state = ANY (ARRAY['VALID'::text, 'REVIEW_REQUIRED'::text])));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_scmdb_suggested_name_check CHECK (((scmdb_suggested_name IS NULL) OR (length(btrim(scmdb_suggested_name)) > 0)));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_source_tag_check CHECK ((length(btrim(source_tag)) > 0));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_subtype_check CHECK (((subtype IS NULL) OR (length(btrim(subtype)) > 0)));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_type_check CHECK (((type IS NULL) OR (length(btrim(type)) > 0)));
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE RESTRICT;
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES scmdb_blueprint_datasets(id) ON DELETE CASCADE;
ALTER TABLE public.scmdb_blueprint_catalog ADD CONSTRAINT scmdb_blueprint_catalog_pkey PRIMARY KEY (dataset_id, blueprint_id);
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_blueprint_counts_check CHECK (((blueprint_total)::bigint = ((blueprint_valid)::bigint + (blueprint_review_required)::bigint)));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_blueprint_review_required_check CHECK ((blueprint_review_required >= 0));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_blueprint_total_check CHECK ((blueprint_total >= 0));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_blueprint_valid_check CHECK ((blueprint_valid >= 0));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_catalog_source_file_check CHECK ((length(btrim(catalog_source_file)) > 0));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_channel_check CHECK ((channel = ANY (ARRAY['LIVE'::text, 'PTU'::text])));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_duplicate_rows_check CHECK ((duplicate_source_rows <= reward_total));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_duplicate_source_rows_check CHECK ((duplicate_source_rows >= 0));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_reward_source_file_check CHECK ((length(btrim(reward_source_file)) > 0));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_reward_total_check CHECK ((reward_total >= 0));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_source_check CHECK ((source = 'SCMDB'::text));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_status_check CHECK ((status = ANY (ARRAY['STAGING'::text, 'ACTIVE'::text, 'FAILED'::text, 'SUPERSEDED'::text])));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_version_check CHECK ((length(btrim(version)) > 0));
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_pkey PRIMARY KEY (id);
ALTER TABLE public.scmdb_blueprint_datasets ADD CONSTRAINT scmdb_blueprint_datasets_identity_key UNIQUE (source, channel, version);
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_contract_category_check CHECK (((contract_category IS NULL) OR (length(btrim(contract_category)) > 0)));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_contract_debug_name_check CHECK ((length(btrim(contract_debug_name)) > 0));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_contract_mission_type_check CHECK (((contract_mission_type IS NULL) OR (length(btrim(contract_mission_type)) > 0)));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_pool_name_check CHECK ((length(btrim(pool_name)) > 0));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_pool_source_check CHECK ((length(btrim(pool_source)) > 0));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_source_contract_id_check CHECK ((length(btrim(source_contract_id)) > 0));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_source_pool_entry_index_check CHECK ((source_pool_entry_index >= 0));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_source_pool_guid_check CHECK ((length(btrim(source_pool_guid)) > 0));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_source_reward_index_check CHECK ((source_reward_index >= 0));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_trigger_check CHECK ((length(btrim(trigger)) > 0));
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_catalog_fkey FOREIGN KEY (dataset_id, blueprint_id) REFERENCES scmdb_blueprint_catalog(dataset_id, blueprint_id) ON DELETE CASCADE;
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES scmdb_blueprint_datasets(id) ON DELETE CASCADE;
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.scmdb_blueprint_reward_sources ADD CONSTRAINT scmdb_blueprint_reward_sources_occurrence_key UNIQUE (dataset_id, source_contract_id, source_reward_index, source_pool_guid, source_pool_entry_index);
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_canonical_name_check CHECK ((length(btrim(canonical_name)) > 0));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_check CHECK ((((classification = 'VALID'::text) AND (cardinality(issues) = 0)) OR ((classification = 'QUARANTINED'::text) AND (cardinality(issues) > 0) AND (NOT ('TECHNICAL_NAME'::text = ANY (issues)))) OR ((classification = 'REJECTED_TECHNICAL'::text) AND ('TECHNICAL_NAME'::text = ANY (issues)))));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_classification_check CHECK ((classification = ANY (ARRAY['VALID'::text, 'QUARANTINED'::text, 'REJECTED_TECHNICAL'::text])));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_issues_check CHECK ((array_position(issues, NULL::text) IS NULL));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_location_type_check CHECK ((length(btrim(location_type)) > 0));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_moon_name_check CHECK (((moon_name IS NULL) OR (length(btrim(moon_name)) > 0)));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_normalized_name_check CHECK ((length(btrim(normalized_name)) > 0));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_planet_name_check CHECK (((planet_name IS NULL) OR (length(btrim(planet_name)) > 0)));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_source_key_check CHECK ((length(btrim(source_key)) > 0));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_system_name_check CHECK (((system_name IS NULL) OR (length(btrim(system_name)) > 0)));
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES scmdb_location_datasets(id) ON DELETE CASCADE;
ALTER TABLE public.scmdb_location_catalog ADD CONSTRAINT scmdb_location_catalog_pkey PRIMARY KEY (dataset_id, source_key);
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_channel_check CHECK ((channel = ANY (ARRAY['LIVE'::text, 'PTU'::text])));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_check CHECK (((total)::bigint = (((valid)::bigint + (quarantined)::bigint) + (rejected_technical)::bigint)));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_quarantined_check CHECK ((quarantined >= 0));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_rejected_technical_check CHECK ((rejected_technical >= 0));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_source_check CHECK ((source = 'SCMDB'::text));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_source_file_check CHECK ((length(btrim(source_file)) > 0));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_status_check CHECK ((status = ANY (ARRAY['STAGING'::text, 'ACTIVE'::text, 'FAILED'::text, 'SUPERSEDED'::text])));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_total_check CHECK ((total >= 0));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_valid_check CHECK ((valid >= 0));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_version_check CHECK ((length(btrim(version)) > 0));
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_pkey PRIMARY KEY (id);
ALTER TABLE public.scmdb_location_datasets ADD CONSTRAINT scmdb_location_datasets_source_channel_version_key UNIQUE (source, channel, version);
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_channel_check CHECK ((channel = ANY (ARRAY['LIVE'::text, 'PTU'::text])));
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_mapping_kind_check CHECK ((mapping_kind = ANY (ARRAY['AUTO_CREATED'::text, 'LEGACY_CONFIRMED'::text])));
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_source_key_check CHECK ((btrim(source_key) <> ''::text));
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_first_dataset_id_fkey FOREIGN KEY (first_dataset_id) REFERENCES scmdb_location_datasets(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_inventory_location_id_fkey FOREIGN KEY (inventory_location_id) REFERENCES inventory_locations(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_last_dataset_id_fkey FOREIGN KEY (last_dataset_id) REFERENCES scmdb_location_datasets(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_pkey PRIMARY KEY (id);
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_channel_inventory_location_id_key UNIQUE (channel, inventory_location_id);
ALTER TABLE public.scmdb_location_mappings ADD CONSTRAINT scmdb_location_mappings_channel_source_key_key UNIQUE (channel, source_key);
ALTER TABLE public.user_app_roles ADD CONSTRAINT user_app_roles_role_check CHECK ((role = ANY (ARRAY['USER'::text, 'ONTOLOGY_ADMIN'::text, 'SYSTEM_ADMIN'::text])));
ALTER TABLE public.user_app_roles ADD CONSTRAINT user_app_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_app_roles ADD CONSTRAINT user_app_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_app_roles ADD CONSTRAINT user_app_roles_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_blueprint_ownership ADD CONSTRAINT user_blueprint_ownership_provenance_check CHECK ((provenance = ANY (ARRAY['MANUAL'::text, 'GAME_LOG'::text, 'COMPANION'::text])));
ALTER TABLE public.user_blueprint_ownership ADD CONSTRAINT user_blueprint_ownership_source_reference_check CHECK (((source_reference IS NULL) OR (length(btrim(source_reference)) > 0)));
ALTER TABLE public.user_blueprint_ownership ADD CONSTRAINT user_blueprint_ownership_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE RESTRICT;
ALTER TABLE public.user_blueprint_ownership ADD CONSTRAINT user_blueprint_ownership_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_blueprint_ownership ADD CONSTRAINT user_blueprint_ownership_pkey PRIMARY KEY (user_id, blueprint_id);
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_revoked_check CHECK (((verification_status = 'REVOKED'::text) = (revoked_at IS NOT NULL)));
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_subject_check CHECK ((btrim(provider_subject) <> ''::text));
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_type_check CHECK ((identity_type = ANY (ARRAY['LOGIN'::text, 'LINKED'::text, 'VERIFICATION'::text])));
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_verification_check CHECK ((verification_status = ANY (ARRAY['UNVERIFIED'::text, 'PENDING'::text, 'VERIFIED'::text, 'STALE'::text, 'REVOKED'::text, 'CONFLICT'::text])));
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_verified_at_check CHECK (((verification_status <> ALL (ARRAY['VERIFIED'::text, 'STALE'::text])) OR (verified_at IS NOT NULL)));
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_provider_code_fkey FOREIGN KEY (provider_code) REFERENCES identity_providers(code) ON DELETE RESTRICT;
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_pkey PRIMARY KEY (id);
ALTER TABLE public.user_identities ADD CONSTRAINT user_identities_provider_code_provider_subject_key UNIQUE (provider_code, provider_subject);
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_unit_check CHECK ((preferred_unit = ANY (ARRAY['AUTO'::text, 'SCU'::text, 'cSCU'::text, 'mSCU'::text, 'µSCU'::text, 'COUNT'::text])));
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_active_group_id_fkey FOREIGN KEY (active_group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);

-- ---------------------------------------------------------------------
-- INDIZES (ohne PK/UNIQUE-Constraint-Indizes)
-- ---------------------------------------------------------------------

CREATE INDEX crew_audit_actor_idx ON public.crew_audit_log USING btree (actor_user_id, created_at DESC);
CREATE INDEX crew_audit_group_created_idx ON public.crew_audit_log USING btree (group_id, created_at DESC);
CREATE UNIQUE INDEX uq_game_account_claim_current ON public.game_account_claims USING btree (game_account_id, provider_code, claim_code) WHERE (status = 'CURRENT'::text);
CREATE INDEX ix_game_accounts_handle ON public.game_accounts USING btree (game_code, normalized_handle) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX uq_game_accounts_primary ON public.game_accounts USING btree (user_id, game_code) WHERE (is_primary AND (revoked_at IS NULL));
CREATE UNIQUE INDEX uq_game_accounts_provider_subject ON public.game_accounts USING btree (game_code, provider_code, provider_subject) WHERE ((provider_subject IS NOT NULL) AND (revoked_at IS NULL));
CREATE UNIQUE INDEX group_invites_pending_uidx ON public.group_invites USING btree (group_id, invited_user_id) WHERE (status = 'PENDING'::text);
CREATE INDEX group_members_user_idx ON public.group_members USING btree (user_id, group_id);
CREATE INDEX ix_identity_audit_user ON public.identity_audit_log USING btree (user_id, created_at DESC);
CREATE INDEX inventory_location_id_idx ON public.inventory USING btree (location_id);
CREATE INDEX inventory_material_quality_idx ON public.inventory USING btree (material, quality DESC);
CREATE INDEX inventory_user_id_idx ON public.inventory USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX profiles_nickname_lower_uidx ON public.profiles USING btree (lower(nickname));
CREATE INDEX scmdb_blueprint_catalog_blueprint_id_idx ON public.scmdb_blueprint_catalog USING btree (blueprint_id);
CREATE UNIQUE INDEX scmdb_blueprint_datasets_active_channel_idx ON public.scmdb_blueprint_datasets USING btree (source, channel) WHERE (status = 'ACTIVE'::text);
CREATE INDEX scmdb_blueprint_reward_sources_dataset_blueprint_idx ON public.scmdb_blueprint_reward_sources USING btree (dataset_id, blueprint_id);
CREATE INDEX scmdb_location_catalog_classification_idx ON public.scmdb_location_catalog USING btree (classification);
CREATE INDEX scmdb_location_catalog_dataset_id_idx ON public.scmdb_location_catalog USING btree (dataset_id);
CREATE INDEX scmdb_location_catalog_normalized_name_idx ON public.scmdb_location_catalog USING btree (normalized_name);
CREATE INDEX scmdb_location_catalog_source_key_idx ON public.scmdb_location_catalog USING btree (source_key);
CREATE UNIQUE INDEX scmdb_location_datasets_active_channel_idx ON public.scmdb_location_datasets USING btree (source, channel) WHERE (status = 'ACTIVE'::text);
CREATE INDEX scmdb_location_mappings_channel_active_idx ON public.scmdb_location_mappings USING btree (channel, is_active);
CREATE INDEX scmdb_location_mappings_inventory_location_idx ON public.scmdb_location_mappings USING btree (inventory_location_id);
CREATE INDEX scmdb_location_mappings_last_dataset_idx ON public.scmdb_location_mappings USING btree (last_dataset_id);
CREATE INDEX user_blueprint_ownership_blueprint_id_idx ON public.user_blueprint_ownership USING btree (blueprint_id);
CREATE INDEX ix_user_identities_user ON public.user_identities USING btree (user_id, provider_code) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX uq_user_identities_primary ON public.user_identities USING btree (user_id) WHERE (is_primary AND (revoked_at IS NULL));

-- ---------------------------------------------------------------------
-- TRIGGER (benutzerdefiniert, alle aktiv)
-- ---------------------------------------------------------------------

CREATE TRIGGER groups_set_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_validate_primary_game_account BEFORE INSERT OR UPDATE OF primary_game_account_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_profile_primary_game_account();
CREATE TRIGGER scmdb_dataset_lifecycle AFTER INSERT OR UPDATE ON public.scmdb_location_datasets FOR EACH ROW EXECUTE FUNCTION apply_scmdb_location_lifecycle();
CREATE TRIGGER scmdb_dataset_lifecycle_locks BEFORE INSERT OR UPDATE ON public.scmdb_location_datasets FOR EACH STATEMENT EXECUTE FUNCTION lock_scmdb_location_dataset_lifecycle();
CREATE TRIGGER scmdb_location_mapping_validate BEFORE INSERT OR UPDATE ON public.scmdb_location_mappings FOR EACH ROW EXECUTE FUNCTION validate_scmdb_location_mapping();
CREATE TRIGGER user_settings_set_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
