-- =====================================================================
-- READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN
-- =====================================================================
-- Inhalt:        RLS-Status, RLS-Policies, Tabellen-Grants (ACL) und Funktions-Grants (ACL) Schema public
-- Quelle:        Supabase Production (main), nur Katalog-SELECTs (pg_class.relacl/relrowsecurity, pg_policies, pg_proc.proacl),
--                keine Tabellenzeilen
-- Erfassungsdatum: 2026-11-13
-- Basis-Commit:  210cb07b4c23fcd003b1b12d01ee3655b7f44519 (develop)
-- Snapshot-Version: v1.0
--
-- Lesehilfe ACL (aclitem): <grantee>=<privilegien>/<grantor>
--   r = SELECT, a = INSERT, w = UPDATE, d = DELETE, D = TRUNCATE, x = REFERENCES, t = TRIGGER, m = MAINTAIN,
--   X = EXECUTE. Ein leerer Grantee-Teil waere PUBLIC (kommt hier nicht vor).
--   Beispiel: "authenticated=r/postgres" = Rolle authenticated darf SELECT, vergeben von postgres.
-- Es gibt keine Spalten-Grants (pg_attribute.attacl ist fuer Schema public leer).
-- Alle Tabellen haben RLS aktiv (relrowsecurity = true), keine mit FORCE ROW LEVEL SECURITY.
-- Tabellen mit aktivem RLS aber OHNE Policy (kein Zugriff fuer anon/authenticated ueber die Tabelle selbst;
--   service_role umgeht RLS): identity_audit_log, identity_oauth_flows, user_app_roles.
-- =====================================================================

DO $guard$ BEGIN RAISE EXCEPTION 'READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN'; END $guard$;

-- ---------------------------------------------------------------------
-- TABELLEN: RLS-Status und ACL (Eigentuemer jeweils postgres)
-- Format: <tabelle> | rls | forced | acl
-- ---------------------------------------------------------------------
-- blueprints | true | false | {postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}
-- crew_audit_log | true | false | {postgres=arwdDxtm/postgres,service_role=Dxtm/postgres,authenticated=r/postgres}
-- game_account_claims | true | false | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}
-- game_accounts | true | false | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}
-- games | true | false | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}
-- group_invites | true | false | {postgres=arwdDxtm/postgres,service_role=Dxtm/postgres,authenticated=r/postgres}
-- group_members | true | false | {postgres=arwdDxtm/postgres,service_role=Dxtm/postgres,authenticated=r/postgres}
-- groups | true | false | {postgres=arwdDxtm/postgres,service_role=Dxtm/postgres,authenticated=r/postgres}
-- identity_audit_log | true | false | {postgres=arwdDxtm/postgres,service_role=arDxtm/postgres}
-- identity_oauth_flows | true | false | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- identity_providers | true | false | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}
-- inventory | true | false | {postgres=arwdDxtm/postgres,service_role=rDxtm/postgres,authenticated=arwd/postgres}
-- inventory_locations | true | false | {postgres=arwdDxtm/postgres,service_role=rDxtm/postgres,authenticated=r/postgres}
-- profiles | true | false | {postgres=arwdDxtm/postgres,service_role=Dxtm/postgres,authenticated=r/postgres}
-- scmdb_blueprint_catalog | true | false | {postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwd/postgres}
-- scmdb_blueprint_datasets | true | false | {postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwd/postgres}
-- scmdb_blueprint_reward_sources | true | false | {postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwd/postgres}
-- scmdb_location_catalog | true | false | {postgres=arwdDxtm/postgres,service_role=rDxtm/postgres,authenticated=r/postgres}
-- scmdb_location_datasets | true | false | {postgres=arwdDxtm/postgres,service_role=rDxtm/postgres,authenticated=r/postgres}
-- scmdb_location_mappings | true | false | {postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres}
-- user_app_roles | true | false | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- user_blueprint_ownership | true | false | {postgres=arwdDxtm/postgres,authenticated=r/postgres}
-- user_identities | true | false | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}
-- user_settings | true | false | {postgres=arwdDxtm/postgres,service_role=Dxtm/postgres,authenticated=r/postgres}

-- ---------------------------------------------------------------------
-- RLS-POLICIES (pg_policies), sortiert nach Tabelle, Name
-- ---------------------------------------------------------------------

CREATE POLICY blueprints_read ON public.blueprints AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY crew_audit_read_admin ON public.crew_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((is_group_owner(group_id) OR is_group_admin(group_id)));
CREATE POLICY game_account_claims_read_own ON public.game_account_claims AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM game_accounts ga
  WHERE ((ga.id = game_account_claims.game_account_id) AND (ga.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY game_accounts_read_own ON public.game_accounts AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY games_read ON public.games AS PERMISSIVE FOR SELECT TO authenticated USING ((status = ANY (ARRAY['ACTIVE'::text, 'DEPRECATED'::text])));
CREATE POLICY group_invites_read ON public.group_invites AS PERMISSIVE FOR SELECT TO authenticated USING (((invited_user_id = ( SELECT auth.uid() AS uid)) OR is_group_admin(group_id)));
CREATE POLICY group_members_read ON public.group_members AS PERMISSIVE FOR SELECT TO authenticated USING (is_group_member(group_id));
CREATE POLICY groups_read_member ON public.groups AS PERMISSIVE FOR SELECT TO authenticated USING (is_group_member(id));
CREATE POLICY groups_update_admin ON public.groups AS PERMISSIVE FOR UPDATE TO authenticated USING (is_group_admin(id)) WITH CHECK (is_group_admin(id));
CREATE POLICY identity_providers_read ON public.identity_providers AS PERMISSIVE FOR SELECT TO authenticated USING ((status = ANY (ARRAY['ACTIVE'::text, 'DEPRECATED'::text])));
CREATE POLICY inventory_delete_own ON public.inventory AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY inventory_insert_own ON public.inventory AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY inventory_read_own ON public.inventory AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY inventory_update_own ON public.inventory AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY inventory_locations_read_authenticated ON public.inventory_locations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_read ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY scmdb_blueprint_catalog_read ON public.scmdb_blueprint_catalog AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY scmdb_blueprint_datasets_read ON public.scmdb_blueprint_datasets AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY scmdb_blueprint_reward_sources_read ON public.scmdb_blueprint_reward_sources AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY scmdb_location_catalog_read ON public.scmdb_location_catalog AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY scmdb_location_datasets_read ON public.scmdb_location_datasets AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY scmdb_location_mappings_read ON public.scmdb_location_mappings AS PERMISSIVE FOR SELECT TO authenticated, service_role USING (true);
CREATE POLICY user_blueprint_ownership_read_own ON public.user_blueprint_ownership AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_identities_read_own ON public.user_identities AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY user_settings_insert_own ON public.user_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ((active_group_id IS NULL) OR is_group_member(active_group_id))));
CREATE POLICY user_settings_read_own ON public.user_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_settings_update_own ON public.user_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ((active_group_id IS NULL) OR is_group_member(active_group_id))));

-- ---------------------------------------------------------------------
-- FUNKTIONEN: Eigentuemer, Security-Modus, Volatilitaet, search_path, ACL
-- Format: <funktion>(<argumente>) | security | volatility | proconfig | acl
-- Volatilitaet: v = VOLATILE, s = STABLE. Eigentuemer jeweils postgres.
-- acl = NULL bedeutet: Standard-ACL (Hinweis: Standard in PostgreSQL ist EXECUTE fuer PUBLIC; bei Trigger-/Event-Trigger-Funktionen ohne praktische Relevanz).
-- ---------------------------------------------------------------------
-- add_or_merge_inventory_lot(p_material text, p_amount numeric, p_amount_micro_scu bigint, p_input_unit text, p_quantity_kind text, p_quality integer, p_location_id uuid) | INVOKER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- apply_scmdb_location_lifecycle() | DEFINER | v | {"search_path=pg_catalog, public"} | {postgres=X/postgres}
-- archive_group(p_group_id uuid) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- bind_scmdb_legacy_location(p_source_key text, p_inventory_location_id uuid) | DEFINER | v | {"search_path=pg_catalog, public"} | {postgres=X/postgres,service_role=X/postgres}
-- change_member_role(p_group_id uuid, p_target_user_id uuid, p_new_role text) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- create_group(p_name text, p_description text) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- get_active_crew_blueprint_status() | DEFINER | s | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- get_active_group_inventory() | DEFINER | s | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- get_my_app_role() | DEFINER | s | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- invite_group_member(p_group_id uuid, p_nickname text) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- is_current_user_admin() | DEFINER | s | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- is_group_admin(p_group_id uuid, p_user_id uuid) | DEFINER | s | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- is_group_member(p_group_id uuid, p_user_id uuid) | DEFINER | s | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- is_group_owner(p_group_id uuid, p_user_id uuid) | DEFINER | s | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- leave_group(p_group_id uuid) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- lock_scmdb_location_dataset_lifecycle() | INVOKER | v | {"search_path=pg_catalog, public"} | {postgres=X/postgres}
-- mark_blueprint_owned(p_blueprint_id uuid) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- promote_active_scmdb_locations(p_channel text) | DEFINER | v | {"search_path=pg_catalog, public"} | {postgres=X/postgres,service_role=X/postgres}
-- remove_group_member(p_group_id uuid, p_target_user_id uuid) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- respond_group_invite(p_invite_id uuid, p_accept boolean) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- restore_group(p_group_id uuid) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- revoke_group_invite(p_invite_id uuid) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- rls_auto_enable() | DEFINER | v | {search_path=pg_catalog} | NULL
-- set_active_group(p_group_id uuid) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- set_updated_at() | INVOKER | v | {search_path=public} | NULL
-- sync_scmdb_blueprint_catalog(p_source text, p_channel text, p_version text, p_catalog_source_file text, p_reward_source_file text, p_blueprint_total integer, p_blueprint_valid integer, p_blueprint_review_required integer, p_reward_total integer, p_duplicate_source_rows integer, p_blueprints jsonb, p_rewards jsonb) | INVOKER | v | {search_path=""} | {postgres=X/postgres,service_role=X/postgres}
-- sync_scmdb_location_catalog(p_source text, p_channel text, p_version text, p_source_file text, p_total integer, p_valid integer, p_quarantined integer, p_rejected_technical integer, p_rows jsonb) | DEFINER | v | {"search_path=pg_catalog, public"} | {postgres=X/postgres,service_role=X/postgres}
-- transfer_group_ownership(p_group_id uuid, p_new_owner_user_id uuid, p_keep_current_owner boolean) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- unmark_blueprint_owned(p_blueprint_id uuid) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- update_group_details(p_group_id uuid, p_name text, p_description text) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- update_or_merge_inventory_lot(p_inventory_id bigint, p_amount numeric, p_amount_micro_scu bigint, p_input_unit text, p_quantity_kind text, p_quality integer, p_location_id uuid) | INVOKER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- upsert_my_profile(p_nickname text) | DEFINER | v | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- users_share_group(p_user_a uuid, p_user_b uuid) | DEFINER | s | {search_path=""} | {postgres=X/postgres,authenticated=X/postgres}
-- validate_profile_primary_game_account() | DEFINER | v | {search_path=""} | NULL
-- validate_scmdb_active_dataset_mappings() | INVOKER | v | {"search_path=pg_catalog, public"} | {postgres=X/postgres}
-- validate_scmdb_location_mapping() | DEFINER | v | {"search_path=pg_catalog, public"} | {postgres=X/postgres}
-- write_crew_audit(p_group_id uuid, p_action text, p_target_user_id uuid, p_details jsonb) | DEFINER | v | {search_path=""} | {postgres=X/postgres}
