-- =====================================================================
-- READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN
-- =====================================================================
-- Inhalt:        Funktionsdefinitionen Schema public (pg_get_functiondef)
-- Quelle:        Supabase Production (main), nur Katalog-SELECTs, keine Tabellenzeilen
-- Erfassungsdatum: 2026-11-13
-- Basis-Commit:  210cb07b4c23fcd003b1b12d01ee3655b7f44519 (develop)
-- Snapshot-Version: v1.0
--
-- Hinweise:
--  * Wortgleiche Ausgabe von pg_get_functiondef(). Zeilenenden wurden auf LF normalisiert
--    (die Live-Definitionen enthalten teils CRLF). Inhaltlich keine Aenderung.
--  * Security-Modus, Volatilitaet, search_path und ACL je Funktion: siehe 05_rls_policies_grants.sql
--    bzw. docs/database/SUPABASE_RUNTIME_OVERVIEW.md.
--  * Jede der 37 Definitionen wurde nach der Erfassung per MD5-Vergleich gegen die Live-Definition
--    (CRLF -> LF normalisiert) geprueft: 37 von 37 identisch.
--  * Die Funktionen stehen in Gruppen (Abschnitte A, B, ...) in der Reihenfolge der Erfassung,
--    nicht alphabetisch.
--  * Enthaelt weder Secrets noch personenbezogene Daten.
-- =====================================================================

DO $guard$ BEGIN RAISE EXCEPTION 'READ-ONLY SNAPSHOT, KEINE MIGRATION, NICHT ANWENDEN'; END $guard$;

-- ---------------------------------------------------------------------
-- ABSCHNITT A: kurze Funktionen (Definition < 1000 Zeichen)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not public.is_group_owner(p_group_id, v_actor) then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND';
  end if;

  update public.groups
  set archived_at = coalesce(archived_at, now()),
      updated_at = now()
  where id = p_group_id;

  update public.user_settings
  set active_group_id = null,
      updated_at = now()
  where active_group_id = p_group_id;

  perform public.write_crew_audit(p_group_id, 'CREW_ARCHIVED');
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_app_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select r.role from public.user_app_roles r where r.user_id = auth.uid()),
    'USER'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select r.role = 'SYSTEM_ADMIN'
       from public.user_app_roles r
      where r.user_id = auth.uid()),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.role in ('OWNER', 'ADMIN')
      and g.archived_at is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_group_owner(p_group_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.role = 'OWNER'
  );
$function$;

CREATE OR REPLACE FUNCTION public.lock_scmdb_location_dataset_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_promotion:LIVE', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_catalog:SCMDB:LIVE', 0));
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_blueprint_owned(p_blueprint_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.restore_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not public.is_group_owner(p_group_id, v_actor) then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  update public.groups
  set archived_at = null,
      updated_at = now()
  where id = p_group_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND';
  end if;

  perform public.write_crew_audit(p_group_id, 'CREW_RESTORED');
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_group_invite(p_invite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_target uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select group_id, invited_user_id
  into v_group_id, v_target
  from public.group_invites
  where id = p_invite_id and status = 'PENDING'
  for update;

  if v_group_id is null then
    raise exception using errcode = 'P0002', message = 'INVITE_NOT_PENDING';
  end if;

  if not public.is_group_admin(v_group_id, v_actor) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  update public.group_invites
  set status = 'REVOKED', responded_at = now()
  where id = p_invite_id;

  perform public.write_crew_audit(
    v_group_id, 'INVITE_REVOKED', v_target
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_active_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id
      and gm.user_id = v_actor
      and g.archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'NOT_A_CREW_MEMBER';
  end if;

  insert into public.user_settings(user_id, active_group_id)
  values(v_actor, p_group_id)
  on conflict(user_id) do update
    set active_group_id = excluded.active_group_id,
        updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at=now(); return new; end $function$;

CREATE OR REPLACE FUNCTION public.unmark_blueprint_owned(p_blueprint_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.upsert_my_profile(p_nickname text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_nickname text := btrim(p_nickname);
  v_profile public.profiles;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if v_nickname !~ '^[A-Za-z0-9_-]{3,24}$' then
    raise exception using errcode = '22023', message = 'INVALID_NICKNAME';
  end if;

  insert into public.profiles(id, nickname)
  values(v_user, v_nickname)
  on conflict(id) do update
    set nickname = excluded.nickname,
        updated_at = now()
  returning * into v_profile;

  insert into public.user_settings(user_id)
  values(v_user)
  on conflict(user_id) do nothing;

  return v_profile;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'NICKNAME_ALREADY_USED';
end;
$function$;

CREATE OR REPLACE FUNCTION public.users_share_group(p_user_a uuid, p_user_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_user_a = p_user_b
    or exists (
      select 1
      from public.group_members a
      join public.group_members b on b.group_id = a.group_id
      join public.groups g on g.id = a.group_id
      where a.user_id = p_user_a
        and b.user_id = p_user_b
        and g.archived_at is null
    );
$function$;

CREATE OR REPLACE FUNCTION public.validate_profile_primary_game_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.primary_game_account_id is not null and not exists(
   select 1 from public.game_accounts ga where ga.id=new.primary_game_account_id and ga.user_id=new.id and ga.revoked_at is null
 ) then raise exception using errcode='23514',message='PRIMARY_GAME_ACCOUNT_OWNER_MISMATCH'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.validate_scmdb_active_dataset_mappings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.status = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    IF EXISTS (
      SELECT 1 FROM public.scmdb_location_mappings m
      WHERE m.channel = NEW.channel AND m.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.scmdb_location_catalog c
          WHERE c.dataset_id = NEW.id AND c.source_key = m.source_key
            AND c.classification = 'VALID'
        )
    ) THEN
      RAISE EXCEPTION 'SCMDB_ACTIVE_DATASET_INVALIDATES_MAPPINGS';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.write_crew_audit(p_group_id uuid, p_action text, p_target_user_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  insert into public.crew_audit_log(
    group_id, actor_user_id, action, target_user_id, details
  ) values (
    p_group_id, v_actor, p_action, p_target_user_id,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- ABSCHNITT B: mittlere Funktionen (Definition 1000 bis 2500 Zeichen)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.change_member_role(p_group_id uuid, p_target_user_id uuid, p_new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_owner_count integer;
  v_new_role text := upper(btrim(p_new_role));
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if v_new_role not in ('OWNER', 'ADMIN', 'MEMBER') then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;

  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND';
  end if;

  select role into v_actor_role
  from public.group_members
  where group_id = p_group_id and user_id = v_actor;

  select role into v_target_role
  from public.group_members
  where group_id = p_group_id and user_id = p_target_user_id;

  if v_actor_role is null then
    raise exception using errcode = '42501', message = 'NOT_A_CREW_MEMBER';
  end if;

  if v_target_role is null then
    raise exception using errcode = 'P0002', message = 'TARGET_NOT_MEMBER';
  end if;

  if v_actor_role = 'MEMBER' then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  if v_actor_role = 'ADMIN' then
    if v_target_role = 'OWNER' or v_new_role = 'OWNER' then
      raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
    end if;
  end if;

  if v_actor = p_target_user_id and v_target_role <> v_new_role then
    raise exception using errcode = '42501', message = 'SELF_ROLE_CHANGE_FORBIDDEN';
  end if;

  if v_target_role = 'OWNER' and v_new_role <> 'OWNER' then
    select count(*) into v_owner_count
    from public.group_members
    where group_id = p_group_id and role = 'OWNER';

    if v_owner_count <= 1 then
      raise exception using errcode = '55000', message = 'LAST_OWNER_PROTECTED';
    end if;
  end if;

  update public.group_members
  set role = v_new_role
  where group_id = p_group_id and user_id = p_target_user_id;

  perform public.write_crew_audit(
    p_group_id, 'ROLE_CHANGED', p_target_user_id,
    jsonb_build_object(
      'old_role', v_target_role,
      'new_role', v_new_role
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_group(p_name text, p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(p_name);
  v_group_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if char_length(v_name) not between 3 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_CREW_NAME';
  end if;

  if p_description is not null and char_length(p_description) > 500 then
    raise exception using errcode = '22023', message = 'DESCRIPTION_TOO_LONG';
  end if;

  insert into public.groups(name, description, created_by_user_id)
  values(v_name, nullif(btrim(p_description), ''), v_actor)
  returning id into v_group_id;

  insert into public.group_members(
    group_id, user_id, role, invited_by_user_id
  ) values (
    v_group_id, v_actor, 'OWNER', v_actor
  );

  insert into public.user_settings(user_id, active_group_id)
  values(v_actor, v_group_id)
  on conflict(user_id) do update
    set active_group_id = excluded.active_group_id,
        updated_at = now();

  perform public.write_crew_audit(
    v_group_id, 'CREW_CREATED', null,
    jsonb_build_object('name', v_name)
  );

  return v_group_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_crew_blueprint_status()
 RETURNS TABLE(blueprint_id uuid, status text, crew_owner_nicknames text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_active_group_inventory()
 RETURNS TABLE(inventory_id bigint, owner_user_id uuid, player_name text, material text, amount numeric, amount_micro_scu bigint, input_unit text, quality integer, location_id uuid, location_name text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_active_group_id uuid;
begin
  if v_actor is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  select us.active_group_id
    into v_active_group_id
  from public.user_settings us
  where us.user_id=v_actor;

  if v_active_group_id is null then
    raise exception using errcode='42501', message='ACTIVE_GROUP_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id=gm.group_id
    where gm.user_id=v_actor
      and gm.group_id=v_active_group_id
      and g.archived_at is null
  ) then
    raise exception using errcode='42501', message='ACTIVE_GROUP_NOT_ALLOWED';
  end if;

  return query
  select
    i.id,
    i.user_id,
    i.player_name,
    i.material,
    i.amount,
    i.amount_micro_scu,
    i.input_unit,
    i.quality,
    i.location_id,
    l.canonical_name,
    i.created_at,
    i.updated_at
  from public.group_members gm
  join public.inventory i on i.user_id=gm.user_id
  join public.inventory_locations l on l.id=i.location_id
  where gm.group_id=v_active_group_id
  order by i.player_name, i.material, i.quality desc, i.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_group_member(p_group_id uuid, p_nickname text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target uuid;
  v_invite_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not public.is_group_admin(p_group_id, v_actor) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  select id into v_target
  from public.profiles
  where lower(nickname) = lower(btrim(p_nickname));

  if v_target is null then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  if v_target = v_actor then
    raise exception using errcode = '22023', message = 'CANNOT_INVITE_SELF';
  end if;

  if public.is_group_member(p_group_id, v_target) then
    raise exception using errcode = '23505', message = 'ALREADY_A_CREW_MEMBER';
  end if;

  if exists (
    select 1 from public.groups
    where id = p_group_id and archived_at is not null
  ) then
    raise exception using errcode = '55000', message = 'CREW_ARCHIVED';
  end if;

  insert into public.group_invites(
    group_id, invited_user_id, invited_by_user_id, status
  ) values (
    p_group_id, v_target, v_actor, 'PENDING'
  )
  on conflict(group_id, invited_user_id) where status = 'PENDING'
  do update set
    invited_by_user_id = excluded.invited_by_user_id,
    created_at = now(),
    responded_at = null
  returning id into v_invite_id;

  perform public.write_crew_audit(
    p_group_id, 'MEMBER_INVITED', v_target,
    jsonb_build_object('nickname', btrim(p_nickname))
  );

  return v_invite_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_owner_count integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND';
  end if;

  select role into v_actor_role
  from public.group_members
  where group_id = p_group_id and user_id = v_actor;

  if v_actor_role is null then
    raise exception using errcode = '42501', message = 'NOT_A_CREW_MEMBER';
  end if;

  if v_actor_role = 'OWNER' then
    select count(*) into v_owner_count
    from public.group_members
    where group_id = p_group_id and role = 'OWNER';

    if v_owner_count <= 1 then
      raise exception using errcode = '55000', message = 'LAST_OWNER_PROTECTED';
    end if;
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = v_actor;

  update public.user_settings
  set active_group_id = null, updated_at = now()
  where user_id = v_actor and active_group_id = p_group_id;

  perform public.write_crew_audit(
    p_group_id, 'MEMBER_LEFT', v_actor,
    jsonb_build_object('previous_role', v_actor_role)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_group_id uuid, p_target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if v_actor = p_target_user_id then
    raise exception using errcode = '22023', message = 'USE_LEAVE_CREW';
  end if;

  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND';
  end if;

  select role into v_actor_role
  from public.group_members
  where group_id = p_group_id and user_id = v_actor;

  select role into v_target_role
  from public.group_members
  where group_id = p_group_id and user_id = p_target_user_id;

  if v_actor_role not in ('OWNER', 'ADMIN') then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  if v_target_role is null then
    raise exception using errcode = 'P0002', message = 'TARGET_NOT_MEMBER';
  end if;

  if v_target_role = 'OWNER' then
    raise exception using errcode = '42501', message = 'TARGET_IS_OWNER';
  end if;

  if v_actor_role = 'ADMIN' and v_target_role <> 'MEMBER' then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = p_target_user_id;

  update public.user_settings
  set active_group_id = null, updated_at = now()
  where user_id = p_target_user_id
    and active_group_id = p_group_id;

  perform public.write_crew_audit(
    p_group_id, 'MEMBER_REMOVED', p_target_user_id,
    jsonb_build_object('previous_role', v_target_role)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.respond_group_invite(p_invite_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_invited_by uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select gi.group_id, gi.invited_by_user_id
  into v_group_id, v_invited_by
  from public.group_invites gi
  join public.groups g on g.id = gi.group_id
  where gi.id = p_invite_id
    and gi.invited_user_id = v_actor
    and gi.status = 'PENDING'
    and g.archived_at is null
  for update of gi;

  if v_group_id is null then
    raise exception using errcode = 'P0002', message = 'INVITE_NOT_PENDING';
  end if;

  if p_accept then
    insert into public.group_members(
      group_id, user_id, role, invited_by_user_id
    ) values (
      v_group_id, v_actor, 'MEMBER', v_invited_by
    )
    on conflict(group_id, user_id) do nothing;

    update public.group_invites
    set status = 'ACCEPTED', responded_at = now()
    where id = p_invite_id;

    insert into public.user_settings(user_id, active_group_id)
    values(v_actor, v_group_id)
    on conflict(user_id) do update
      set active_group_id = coalesce(
            public.user_settings.active_group_id,
            excluded.active_group_id
          ),
          updated_at = now();

    perform public.write_crew_audit(
      v_group_id, 'INVITE_ACCEPTED', v_actor
    );
  else
    update public.group_invites
    set status = 'DECLINED', responded_at = now()
    where id = p_invite_id;

    perform public.write_crew_audit(
      v_group_id, 'INVITE_DECLINED', v_actor
    );
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_group_ownership(p_group_id uuid, p_new_owner_user_id uuid, p_keep_current_owner boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target_role text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND';
  end if;

  if not public.is_group_owner(p_group_id, v_actor) then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  if p_new_owner_user_id = v_actor then
    raise exception using errcode = '22023', message = 'TARGET_ALREADY_OWNER';
  end if;

  select role into v_target_role
  from public.group_members
  where group_id = p_group_id
    and user_id = p_new_owner_user_id;

  if v_target_role is null then
    raise exception using errcode = 'P0002', message = 'TARGET_NOT_MEMBER';
  end if;

  update public.group_members
  set role = 'OWNER'
  where group_id = p_group_id
    and user_id = p_new_owner_user_id;

  if not p_keep_current_owner then
    update public.group_members
    set role = 'ADMIN'
    where group_id = p_group_id
      and user_id = v_actor;
  end if;

  perform public.write_crew_audit(
    p_group_id, 'OWNERSHIP_TRANSFERRED', p_new_owner_user_id,
    jsonb_build_object(
      'previous_owner', v_actor,
      'kept_previous_owner', p_keep_current_owner
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_group_details(p_group_id uuid, p_name text, p_description text DEFAULT NULL::text)
 RETURNS groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(p_name);
  v_group public.groups;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not public.is_group_admin(p_group_id, v_actor) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  if char_length(v_name) not between 3 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_CREW_NAME';
  end if;

  if p_description is not null and char_length(p_description) > 500 then
    raise exception using errcode = '22023', message = 'DESCRIPTION_TOO_LONG';
  end if;

  update public.groups
  set name = v_name,
      description = nullif(btrim(p_description), ''),
      updated_at = now()
  where id = p_group_id
    and archived_at is null
  returning * into v_group;

  if v_group.id is null then
    raise exception using errcode = 'P0002', message = 'CREW_NOT_FOUND';
  end if;

  perform public.write_crew_audit(
    p_group_id, 'CREW_UPDATED', null,
    jsonb_build_object('name', v_name)
  );

  return v_group;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_scmdb_location_mapping()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.scmdb_location_datasets d
    WHERE d.id = NEW.first_dataset_id AND d.channel = NEW.channel
  ) THEN
    RAISE EXCEPTION 'SCMDB_MAPPING_FIRST_DATASET_CHANNEL_MISMATCH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.scmdb_location_datasets d
    WHERE d.id = NEW.last_dataset_id AND d.channel = NEW.channel
  ) THEN
    RAISE EXCEPTION 'SCMDB_MAPPING_LAST_DATASET_CHANNEL_MISMATCH';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_active = false AND (
    NEW.channel IS DISTINCT FROM OLD.channel OR NEW.source_key IS DISTINCT FROM OLD.source_key OR
    NEW.inventory_location_id IS DISTINCT FROM OLD.inventory_location_id OR
    NEW.first_dataset_id IS DISTINCT FROM OLD.first_dataset_id
  ) THEN
    RAISE EXCEPTION 'SCMDB_MAPPING_INACTIVE_IDENTITY_CHANGED';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.is_active) AND NOT EXISTS (
    SELECT 1 FROM public.scmdb_location_catalog c
    WHERE c.dataset_id = NEW.last_dataset_id AND c.source_key = NEW.source_key
      AND c.classification = 'VALID'
  ) THEN
    RAISE EXCEPTION 'SCMDB_MAPPING_SOURCE_NOT_VALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations l
    WHERE l.id = NEW.inventory_location_id AND l.is_system IS FALSE
      AND l.normalized_name <> 'unbekannt'
  ) THEN
    RAISE EXCEPTION 'SCMDB_MAPPING_SYSTEM_LOCATION_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- ABSCHNITT C: grosse Funktionen (Definition 2501 bis 7000 Zeichen)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_or_merge_inventory_lot(p_material text, p_amount numeric, p_amount_micro_scu bigint, p_input_unit text, p_quantity_kind text, p_quality integer, p_location_id uuid)
 RETURNS TABLE(inventory_id bigint, outcome text, amount numeric, amount_micro_scu bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();

  v_material text := btrim(p_material);
  v_kind text := upper(btrim(p_quantity_kind));
  v_input_unit text := btrim(p_input_unit);

  v_player_name text;
  v_game_account_count integer;

  v_inventory_id bigint;
  v_amount numeric;
  v_amount_micro_scu bigint;

  v_existing_input_unit text;

  v_bigint_max constant numeric :=
    9223372036854775807::numeric;
begin

  if v_actor is null then
    raise exception
      using errcode = '42501',
            message = 'AUTH_REQUIRED';
  end if;


  if v_material is null or v_material = '' then
    raise exception
      using errcode = '22023',
            message = 'MATERIAL_REQUIRED';
  end if;


  if p_quality is null
     or p_quality < 0
     or p_quality > 1000 then
    raise exception
      using errcode = '22023',
            message = 'QUALITY_OUT_OF_RANGE';
  end if;


  if p_amount is null
     or p_amount <= 0
     or p_amount_micro_scu is null
     or p_amount_micro_scu <= 0 then
    raise exception
      using errcode = '22023',
            message = 'AMOUNT_MUST_BE_POSITIVE';
  end if;


  if v_kind is null
     or v_kind ~ '^[[:space:]]*$'
     or v_kind not in ('COUNT', 'VOLUME') then
    raise exception
      using errcode = '22023',
            message = 'MATERIAL_UNIT_UNKNOWN';
  end if;


  if v_input_unit is null
     or v_input_unit ~ '^[[:space:]]*$' then
    raise exception
      using errcode = '22023',
            message = 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
  end if;


  if v_kind = 'COUNT' then
    if v_input_unit <> 'COUNT' then
      raise exception
        using errcode = '22023',
              message =
                'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
    end if;

    if p_amount <> p_amount_micro_scu::numeric then
      raise exception
        using errcode = '22023',
              message =
                'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
    end if;
  end if;


  if v_kind = 'VOLUME' then
    if v_input_unit not in (
      'SCU',
      'cSCU',
      'mSCU',
      'µSCU'
    ) then
      raise exception
        using errcode = '22023',
              message =
                'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
    end if;

    if p_amount <>
      p_amount_micro_scu::numeric
      * 0.000001::numeric
    then
      raise exception
        using errcode = '22023',
              message =
                'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
    end if;
  end if;


  select
    max(btrim(ga.handle)),
    count(*)
  into
    v_player_name,
    v_game_account_count
  from public.game_accounts ga
  where ga.user_id = v_actor
    and ga.game_code = 'STAR_CITIZEN'
    and ga.is_primary = true
    and ga.verification_status = 'VERIFIED'
    and ga.revoked_at is null;


  if v_game_account_count <> 1
     or v_player_name is null
     or v_player_name = '' then
    raise exception
      using errcode = '42501',
            message = 'PLAYER_CONTEXT_REQUIRED';
  end if;


  if not exists (
    select 1
    from public.inventory_locations il
    where il.id = p_location_id
      and il.is_archived = false
  ) then
    raise exception
      using errcode = '22023',
            message = 'LOCATION_INVALID';
  end if;


  insert into public.inventory (
    user_id,
    player_name,
    material,
    amount,
    amount_micro_scu,
    input_unit,
    quality,
    location_id
  )
  values (
    v_actor,
    v_player_name,
    v_material,
    p_amount,
    p_amount_micro_scu,
    v_input_unit,
    p_quality,
    p_location_id
  )
  on conflict
    on constraint inventory_lot_identity_v1_key
  do nothing
  returning
    id,
    public.inventory.amount,
    public.inventory.amount_micro_scu
  into
    v_inventory_id,
    v_amount,
    v_amount_micro_scu;


  if v_inventory_id is not null then
    return query
    select
      v_inventory_id,
      'CREATED'::text,
      v_amount,
      v_amount_micro_scu;

    return;
  end if;


  select i.input_unit
  into v_existing_input_unit
  from public.inventory i
  where i.user_id = v_actor
    and i.material = v_material
    and i.quality = p_quality
    and i.location_id = p_location_id;


  if v_existing_input_unit is null then
    raise exception
      using errcode = 'P0001',
            message = 'LOT_MERGE_FAILED';
  end if;


  if v_kind = 'COUNT'
     and v_existing_input_unit <> 'COUNT' then
    raise exception
      using errcode = '22023',
            message = 'LOT_QUANTITY_KIND_CONFLICT';
  end if;


  if v_kind = 'VOLUME'
     and v_existing_input_unit not in (
       'SCU',
       'cSCU',
       'mSCU',
       'µSCU'
     ) then
    raise exception
      using errcode = '22023',
            message = 'LOT_QUANTITY_KIND_CONFLICT';
  end if;


  update public.inventory i
  set
    amount_micro_scu =
      i.amount_micro_scu
      + p_amount_micro_scu,

    amount = case
      when v_kind = 'COUNT'
        then (
          i.amount_micro_scu::numeric
          + p_amount_micro_scu::numeric
        )
      else (
        i.amount_micro_scu::numeric
        + p_amount_micro_scu::numeric
      ) * 0.000001::numeric
    end,

    updated_at = now()

  where i.user_id = v_actor
    and i.material = v_material
    and i.quality = p_quality
    and i.location_id = p_location_id
    and i.amount_micro_scu::numeric
      <= v_bigint_max
         - p_amount_micro_scu::numeric

  returning
    i.id,
    i.amount,
    i.amount_micro_scu
  into
    v_inventory_id,
    v_amount,
    v_amount_micro_scu;


  if v_inventory_id is null then
    if exists (
      select 1
      from public.inventory i
      where i.user_id = v_actor
        and i.material = v_material
        and i.quality = p_quality
        and i.location_id = p_location_id
        and i.amount_micro_scu::numeric
          > v_bigint_max
            - p_amount_micro_scu::numeric
    ) then
      raise exception
        using errcode = '22003',
              message = 'AMOUNT_OUT_OF_RANGE';
    end if;

    raise exception
      using errcode = 'P0001',
            message = 'LOT_MERGE_FAILED';
  end if;


  return query
  select
    v_inventory_id,
    'MERGED'::text,
    v_amount,
    v_amount_micro_scu;

end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_scmdb_location_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_mapping record;
  v_total bigint;
  v_processed bigint := 0;
  v_still_active bigint := 0;
  v_retired bigint := 0;
  v_reactivated bigint := 0;
  v_unsupported_inactive bigint := 0;
  v_supported boolean;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'LIVE' OR NEW.status IS DISTINCT FROM 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.scmdb_location_datasets d
    WHERE d.id = NEW.id AND d.source = 'SCMDB' AND d.channel = 'LIVE' AND d.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'SCMDB_LIFECYCLE_INVALID_DATASET';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_promotion:LIVE', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_catalog:SCMDB:LIVE', 0));
  LOCK TABLE public.inventory_locations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.scmdb_location_mappings IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO v_total FROM public.scmdb_location_mappings WHERE channel = 'LIVE';

  FOR v_mapping IN
    SELECT m.id, m.source_key, m.inventory_location_id, m.is_active,
      l.id AS location_id, l.is_system, l.normalized_name,
      EXISTS (
        SELECT 1 FROM public.scmdb_location_catalog c
        WHERE c.dataset_id = NEW.id AND c.source_key = m.source_key
          AND c.classification = 'VALID'
          AND c.location_type IN ('LandingZone', 'Station', 'Outpost')
      ) AS supported
    FROM public.scmdb_location_mappings m
    LEFT JOIN public.inventory_locations l ON l.id = m.inventory_location_id
    WHERE m.channel = 'LIVE'
    ORDER BY m.source_key COLLATE "C"
  LOOP
    IF v_mapping.location_id IS NULL THEN
      RAISE EXCEPTION 'SCMDB_LIFECYCLE_MAPPING_LOCATION_MISSING';
    END IF;
    IF v_mapping.is_system IS DISTINCT FROM false OR v_mapping.normalized_name = 'unbekannt' THEN
      RAISE EXCEPTION 'SCMDB_LIFECYCLE_SYSTEM_LOCATION_FORBIDDEN';
    END IF;
    v_supported := v_mapping.supported;
    IF v_supported AND v_mapping.is_active THEN
      v_still_active := v_still_active + 1;
    ELSIF v_supported THEN
      v_reactivated := v_reactivated + 1;
    ELSIF v_mapping.is_active THEN
      v_retired := v_retired + 1;
    ELSE
      v_unsupported_inactive := v_unsupported_inactive + 1;
    END IF;

    UPDATE public.scmdb_location_mappings
    SET last_dataset_id = NEW.id, is_active = v_supported, updated_at = now()
    WHERE id = v_mapping.id AND channel = 'LIVE'
      AND (last_dataset_id IS DISTINCT FROM NEW.id OR is_active IS DISTINCT FROM v_supported);
    UPDATE public.inventory_locations
    SET is_archived = NOT v_supported, updated_at = now()
    WHERE id = v_mapping.inventory_location_id AND is_system = false
      AND is_archived IS DISTINCT FROM NOT v_supported;
    v_processed := v_processed + 1;
  END LOOP;

  IF v_processed <> v_total OR
    v_total <> v_still_active + v_retired + v_reactivated + v_unsupported_inactive THEN
    RAISE EXCEPTION 'SCMDB_LIFECYCLE_ACCOUNTING_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bind_scmdb_legacy_location(p_source_key text, p_inventory_location_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_dataset_id uuid;
  v_dataset_count integer;
  v_location public.inventory_locations%ROWTYPE;
  v_existing_location_id uuid;
  v_existing_source_key text;
  v_outcome text;
BEGIN
  IF p_source_key IS NULL OR btrim(p_source_key) = '' THEN
    RAISE EXCEPTION 'SCMDB_LEGACY_SOURCE_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_promotion:LIVE', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_catalog:SCMDB:LIVE', 0));
  LOCK TABLE public.inventory_locations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.scmdb_location_mappings IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO v_dataset_count FROM public.scmdb_location_datasets
    WHERE source = 'SCMDB' AND channel = 'LIVE' AND status = 'ACTIVE';
  IF v_dataset_count <> 1 THEN
    RAISE EXCEPTION 'SCMDB_LEGACY_ACTIVE_DATASET_INVALID';
  END IF;
  SELECT id INTO v_dataset_id FROM public.scmdb_location_datasets
    WHERE source = 'SCMDB' AND channel = 'LIVE' AND status = 'ACTIVE';

  IF NOT EXISTS (
    SELECT 1 FROM public.scmdb_location_catalog c
    WHERE c.dataset_id = v_dataset_id AND c.source_key = p_source_key
      AND c.classification = 'VALID'
      AND c.location_type IN ('LandingZone', 'Station', 'Outpost')
  ) THEN
    RAISE EXCEPTION 'SCMDB_LEGACY_SOURCE_NOT_PROMOTABLE';
  END IF;

  SELECT * INTO v_location FROM public.inventory_locations l
    WHERE l.id = p_inventory_location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCMDB_LEGACY_LOCATION_INVALID';
  END IF;
  IF v_location.is_system IS DISTINCT FROM false OR v_location.normalized_name = 'unbekannt' THEN
    RAISE EXCEPTION 'SCMDB_LEGACY_SYSTEM_LOCATION_FORBIDDEN';
  END IF;
  IF v_location.is_archived IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'SCMDB_LEGACY_LOCATION_INVALID';
  END IF;

  SELECT m.inventory_location_id INTO v_existing_location_id
    FROM public.scmdb_location_mappings m
    WHERE m.channel = 'LIVE' AND m.source_key = p_source_key;
  IF FOUND AND v_existing_location_id IS DISTINCT FROM p_inventory_location_id THEN
    RAISE EXCEPTION 'SCMDB_LEGACY_SOURCE_ALREADY_BOUND';
  END IF;

  SELECT m.source_key INTO v_existing_source_key
    FROM public.scmdb_location_mappings m
    WHERE m.channel = 'LIVE' AND m.inventory_location_id = p_inventory_location_id;
  IF FOUND AND v_existing_source_key IS DISTINCT FROM p_source_key THEN
    RAISE EXCEPTION 'SCMDB_LEGACY_LOCATION_ALREADY_BOUND';
  END IF;

  IF v_existing_location_id IS NOT NULL THEN
    UPDATE public.scmdb_location_mappings
      SET last_dataset_id = v_dataset_id, mapping_kind = 'LEGACY_CONFIRMED',
          is_active = true, updated_at = now()
      WHERE channel = 'LIVE' AND source_key = p_source_key
        AND inventory_location_id = p_inventory_location_id
        AND (last_dataset_id IS DISTINCT FROM v_dataset_id
          OR mapping_kind IS DISTINCT FROM 'LEGACY_CONFIRMED' OR is_active IS DISTINCT FROM true);
    v_outcome := 'ALREADY_BOUND';
  ELSE
    INSERT INTO public.scmdb_location_mappings
      (channel, source_key, inventory_location_id, first_dataset_id, last_dataset_id, mapping_kind, is_active)
      VALUES ('LIVE', p_source_key, p_inventory_location_id, v_dataset_id, v_dataset_id, 'LEGACY_CONFIRMED', true);
    v_outcome := 'BOUND';
  END IF;

  RETURN jsonb_build_object(
    'dataset_id', v_dataset_id, 'channel', 'LIVE', 'source_key', p_source_key,
    'inventory_location_id', p_inventory_location_id, 'outcome', v_outcome
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_active_scmdb_locations(p_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_dataset_id uuid;
  v_dataset_count integer;
  v_plan jsonb;
  v_row jsonb;
  v_location_id uuid;
  v_already integer := 0;
  v_created integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
BEGIN
  IF p_channel IS DISTINCT FROM 'LIVE' THEN
    RAISE EXCEPTION 'SCMDB_PROMOTION_CHANNEL_UNSUPPORTED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_promotion:LIVE', 0));
  -- Coordinate with the existing catalog sync lock before reading its active dataset.
  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_catalog:SCMDB:LIVE', 0));
  LOCK TABLE public.inventory_locations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.scmdb_location_mappings IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO v_dataset_count FROM public.scmdb_location_datasets
    WHERE source = 'SCMDB' AND channel = 'LIVE' AND status = 'ACTIVE';
  IF v_dataset_count <> 1 THEN
    RAISE EXCEPTION 'SCMDB_PROMOTION_ACTIVE_DATASET_INVALID';
  END IF;
  SELECT id INTO v_dataset_id FROM public.scmdb_location_datasets
    WHERE source = 'SCMDB' AND channel = 'LIVE' AND status = 'ACTIVE';

  IF EXISTS (
    SELECT 1 FROM public.scmdb_location_mappings m
    JOIN public.inventory_locations l ON l.id = m.inventory_location_id
    WHERE m.channel = 'LIVE' AND l.is_system IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'SCMDB_PROMOTION_SYSTEM_LOCATION_FORBIDDEN';
  END IF;

  WITH candidates AS (
    SELECT c.source_key, c.canonical_name, lower(btrim(c.canonical_name)) AS normalized_name,
      m.inventory_location_id
    FROM public.scmdb_location_catalog c
    LEFT JOIN public.scmdb_location_mappings m ON m.channel = 'LIVE' AND m.source_key = c.source_key
    WHERE c.dataset_id = v_dataset_id AND c.classification = 'VALID'
      AND c.location_type IN ('LandingZone', 'Station', 'Outpost')
  ), classified AS (
    SELECT c.*,
      CASE
        WHEN c.inventory_location_id IS NOT NULL THEN 'ALREADY_MAPPED'
        WHEN (SELECT count(*) FROM candidates d
              WHERE d.inventory_location_id IS NULL AND d.normalized_name = c.normalized_name) > 1
          THEN 'DUPLICATE_SCMDB_NAME'
        WHEN EXISTS (SELECT 1 FROM public.inventory_locations l WHERE l.normalized_name = c.normalized_name)
          OR c.normalized_name = 'unbekannt' THEN 'EXISTING_VECTOR_NAME'
        ELSE 'SAFE_NEW'
      END AS outcome
    FROM candidates c
  )
  SELECT coalesce(jsonb_agg(to_jsonb(classified) ORDER BY source_key COLLATE "C"), '[]'::jsonb)
    INTO v_plan FROM classified;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
    CASE v_row->>'outcome'
      WHEN 'ALREADY_MAPPED' THEN
        UPDATE public.inventory_locations SET is_archived = false, updated_at = now()
          WHERE id = (v_row->>'inventory_location_id')::uuid AND is_archived = true AND is_system = false;
        UPDATE public.scmdb_location_mappings SET last_dataset_id = v_dataset_id, is_active = true, updated_at = now()
          WHERE channel = 'LIVE' AND source_key = v_row->>'source_key'
            AND inventory_location_id = (v_row->>'inventory_location_id')::uuid;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'SCMDB_PROMOTION_MAPPING_CHANGED';
        END IF;
        v_already := v_already + 1;
      WHEN 'SAFE_NEW' THEN
        INSERT INTO public.inventory_locations (canonical_name, normalized_name, is_system, is_archived)
          VALUES (v_row->>'canonical_name', v_row->>'normalized_name', false, false)
          RETURNING id INTO v_location_id;
        INSERT INTO public.scmdb_location_mappings
          (channel, source_key, inventory_location_id, first_dataset_id, last_dataset_id, mapping_kind, is_active)
          VALUES ('LIVE', v_row->>'source_key', v_location_id, v_dataset_id, v_dataset_id, 'AUTO_CREATED', true);
        v_created := v_created + 1;
      WHEN 'EXISTING_VECTOR_NAME', 'DUPLICATE_SCMDB_NAME' THEN
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'source_key', v_row->>'source_key', 'reason', v_row->>'outcome'));
      ELSE
        RAISE EXCEPTION 'SCMDB_PROMOTION_INVALID_PLAN';
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'dataset_id', v_dataset_id, 'channel', 'LIVE',
    'promotable_count', jsonb_array_length(v_plan), 'already_mapped_count', v_already,
    'created_count', v_created, 'conflict_count', jsonb_array_length(v_conflicts),
    'conflicts', v_conflicts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_scmdb_location_catalog(p_source text, p_channel text, p_version text, p_source_file text, p_total integer, p_valid integer, p_quarantined integer, p_rejected_technical integer, p_rows jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_id uuid;
  v_existing public.scmdb_location_datasets%ROWTYPE;
  v_row jsonb;
  v_counts integer[] := ARRAY[0, 0, 0];
  v_keys text[] := ARRAY[]::text[];
  v_rows jsonb;
BEGIN
  IF p_source IS DISTINCT FROM 'SCMDB' OR p_channel IS NULL OR p_channel NOT IN ('LIVE', 'PTU')
    OR p_version IS NULL OR length(btrim(p_version)) = 0
    OR p_source_file IS NULL OR length(btrim(p_source_file)) = 0
    OR p_total IS NULL OR p_valid IS NULL OR p_quarantined IS NULL OR p_rejected_technical IS NULL
    OR least(p_total, p_valid, p_quarantined, p_rejected_technical) < 0
    OR p_total::bigint <> p_valid::bigint + p_quarantined::bigint + p_rejected_technical::bigint
    OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_INVALID_METADATA' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) <> p_total THEN
    RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_COUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_INVALID_ROW' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_row)) <> 9
      OR NOT (v_row ?& ARRAY['source_key','canonical_name','normalized_name','location_type','system_name','planet_name','moon_name','classification','issues'])
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['source_key','canonical_name','normalized_name','location_type','classification']) AS k
                 WHERE jsonb_typeof(v_row->k) IS DISTINCT FROM 'string' OR length(btrim(v_row->>k)) = 0)
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['system_name','planet_name','moon_name']) AS k
                 WHERE jsonb_typeof(v_row->k) NOT IN ('string', 'null') OR (jsonb_typeof(v_row->k) = 'string' AND length(btrim(v_row->>k)) = 0))
      OR jsonb_typeof(v_row->'issues') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_INVALID_ROW' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row->'issues') AS issue
               WHERE jsonb_typeof(issue) <> 'string' OR length(btrim(issue #>> '{}')) = 0) THEN
      RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_INVALID_ROW' USING ERRCODE = '22023';
    END IF;
    IF v_row->>'source_key' = ANY(v_keys) THEN
      RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_DUPLICATE_SOURCE_KEY' USING ERRCODE = '22023';
    END IF;
    v_keys := array_append(v_keys, v_row->>'source_key');
    CASE v_row->>'classification'
      WHEN 'VALID' THEN
        IF jsonb_array_length(v_row->'issues') <> 0 THEN
          RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_INVALID_ROW' USING ERRCODE = '22023';
        END IF;
        v_counts[1] := v_counts[1] + 1;
      WHEN 'QUARANTINED' THEN
        IF jsonb_array_length(v_row->'issues') = 0 OR (v_row->'issues') ? 'TECHNICAL_NAME' THEN
          RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_INVALID_ROW' USING ERRCODE = '22023';
        END IF;
        v_counts[2] := v_counts[2] + 1;
      WHEN 'REJECTED_TECHNICAL' THEN
        IF NOT ((v_row->'issues') ? 'TECHNICAL_NAME') THEN
          RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_INVALID_ROW' USING ERRCODE = '22023';
        END IF;
        v_counts[3] := v_counts[3] + 1;
      ELSE RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_INVALID_ROW' USING ERRCODE = '22023';
    END CASE;
  END LOOP;
  IF v_counts <> ARRAY[p_valid, p_quarantined, p_rejected_technical] THEN
    RAISE EXCEPTION 'SCMDB_LOCATION_SYNC_COUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF p_channel = 'LIVE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_promotion:LIVE', 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_catalog:' || p_source || ':' || p_channel, 0));
  SELECT * INTO v_existing FROM public.scmdb_location_datasets
    WHERE source = p_source AND channel = p_channel AND version = p_version FOR UPDATE;
  IF FOUND AND v_existing.status = 'ACTIVE' AND v_existing.source_file = p_source_file
    AND v_existing.total = p_total AND v_existing.valid = p_valid
    AND v_existing.quarantined = p_quarantined AND v_existing.rejected_technical = p_rejected_technical THEN
    SELECT coalesce(jsonb_agg(to_jsonb(c) - 'dataset_id' - 'created_at' - 'updated_at' ORDER BY c.source_key COLLATE "C"), '[]'::jsonb)
      INTO v_rows FROM public.scmdb_location_catalog c WHERE c.dataset_id = v_existing.id;
    IF v_rows = (SELECT coalesce(jsonb_agg(value ORDER BY (value->>'source_key') COLLATE "C"), '[]'::jsonb) FROM jsonb_array_elements(p_rows)) THEN
      RETURN v_existing.id;
    END IF;
  END IF;
  INSERT INTO public.scmdb_location_datasets (source, channel, version, source_file, status, total, valid, quarantined, rejected_technical)
  VALUES (p_source, p_channel, p_version, p_source_file, 'STAGING', p_total, p_valid, p_quarantined, p_rejected_technical)
  ON CONFLICT (source, channel, version) DO UPDATE SET
    source_file = EXCLUDED.source_file, status = 'STAGING', total = EXCLUDED.total,
    valid = EXCLUDED.valid, quarantined = EXCLUDED.quarantined,
    rejected_technical = EXCLUDED.rejected_technical, updated_at = now()
  RETURNING id INTO v_id;
  DELETE FROM public.scmdb_location_catalog WHERE dataset_id = v_id;
  INSERT INTO public.scmdb_location_catalog
    (dataset_id, source_key, canonical_name, normalized_name, location_type, system_name, planet_name, moon_name, classification, issues)
  SELECT v_id, r->>'source_key', r->>'canonical_name', r->>'normalized_name', r->>'location_type',
    r->>'system_name', r->>'planet_name', r->>'moon_name', r->>'classification',
    ARRAY(SELECT jsonb_array_elements_text(r->'issues'))
  FROM jsonb_array_elements(p_rows) AS r;
  UPDATE public.scmdb_location_datasets SET status = 'SUPERSEDED', updated_at = now()
    WHERE source = p_source AND channel = p_channel AND status = 'ACTIVE' AND id <> v_id;
  UPDATE public.scmdb_location_datasets SET status = 'ACTIVE', updated_at = now() WHERE id = v_id;
  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- ABSCHNITT D: sehr grosse Funktionen
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_or_merge_inventory_lot(p_inventory_id bigint, p_amount numeric, p_amount_micro_scu bigint, p_input_unit text, p_quantity_kind text, p_quality integer, p_location_id uuid)
 RETURNS TABLE(inventory_id bigint, outcome text, amount numeric, amount_micro_scu bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();

  v_kind text := upper(pg_catalog.btrim(p_quantity_kind));
  v_input_unit text := pg_catalog.btrim(p_input_unit);

  v_source_id bigint;
  v_source_material text;
  v_source_location_id uuid;
  v_source_input_unit text;
  v_source_kind text;

  v_target_id bigint;
  v_target_input_unit text;
  v_target_kind text;
  v_target_amount_micro_scu bigint;

  v_result_id bigint;
  v_result_amount numeric;
  v_result_amount_micro_scu bigint;

  v_constraint_name text;

  v_bigint_max constant numeric :=
    9223372036854775807::numeric;

  v_identity_constraint constant text :=
    'inventory_lot_identity_v1_key';

  v_volume_unit_micro constant text :=
    U&'\00B5SCU';
begin

  -- --------------------------------------------------------------------------
  -- Authentication
  -- --------------------------------------------------------------------------

  if v_actor is null then
    raise exception
      using errcode = '42501',
            message = 'AUTH_REQUIRED';
  end if;


  -- --------------------------------------------------------------------------
  -- Serialize identity-changing Inventory edits for this actor.
  --
  -- A theoretical hash collision can only introduce unnecessary serialization;
  -- ownership and identity checks still determine the affected rows.
  -- --------------------------------------------------------------------------

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'VECTOR:INVENTORY:EDIT:' || v_actor::text,
      0
    )
  );


  -- --------------------------------------------------------------------------
  -- Validate primitive input before any mutation.
  -- --------------------------------------------------------------------------

  if p_inventory_id is null
     or p_inventory_id <= 0 then
    raise exception
      using errcode = '22023',
            message = 'LOT_ID_INVALID';
  end if;


  if p_quality is null
     or p_quality < 0
     or p_quality > 1000 then
    raise exception
      using errcode = '22023',
            message = 'QUALITY_OUT_OF_RANGE';
  end if;


  if p_location_id is null then
    raise exception
      using errcode = '22023',
            message = 'LOCATION_INVALID';
  end if;


  if p_amount is null
     or p_amount <= 0
     or p_amount_micro_scu is null
     or p_amount_micro_scu <= 0 then
    raise exception
      using errcode = '22023',
            message = 'AMOUNT_MUST_BE_POSITIVE';
  end if;


  if v_kind is null
     or v_kind ~ '^[[:space:]]*$'
     or v_kind not in ('COUNT', 'VOLUME') then
    raise exception
      using errcode = '22023',
            message = 'MATERIAL_UNIT_UNKNOWN';
  end if;


  if v_input_unit is null
     or v_input_unit ~ '^[[:space:]]*$' then
    raise exception
      using errcode = '22023',
            message = 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
  end if;


  -- --------------------------------------------------------------------------
  -- Load and lock the owned source Lot.
  --
  -- Missing and foreign Lots intentionally produce the same public outcome.
  -- Material and persisted source unit are authoritative database values.
  -- --------------------------------------------------------------------------

  select
    i.id,
    i.material,
    i.input_unit,
    i.location_id
  into
    v_source_id,
    v_source_material,
    v_source_input_unit,
    v_source_location_id
  from public.inventory i
  where i.id = p_inventory_id
    and i.user_id = v_actor
  for update;


  if v_source_id is null then
    raise exception
      using errcode = 'P0002',
            message = 'LOT_NOT_FOUND';
  end if;


  -- --------------------------------------------------------------------------
  -- Derive the persisted source quantity kind.
  --
  -- LIVE SCMDB classification remains enforced by the server write boundary.
  -- The RPC independently checks that the supplied kind agrees with the locked
  -- source Lot and does not trust p_quantity_kind by itself.
  -- --------------------------------------------------------------------------

  if v_source_input_unit = 'COUNT' then
    v_source_kind := 'COUNT';

  elsif v_source_input_unit in (
    'SCU',
    'cSCU',
    'mSCU',
    v_volume_unit_micro
  ) then
    v_source_kind := 'VOLUME';

  else
    raise exception
      using errcode = '22023',
            message = 'MATERIAL_UNIT_UNKNOWN';
  end if;


  if v_kind <> v_source_kind then
    raise exception
      using errcode = '22023',
            message = 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
  end if;


  -- --------------------------------------------------------------------------
  -- Validate exact quantity/unit representation.
  -- --------------------------------------------------------------------------

  if v_source_kind = 'COUNT' then
    if v_input_unit <> 'COUNT'
       or p_amount <> p_amount_micro_scu::numeric then
      raise exception
        using errcode = '22023',
              message = 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
    end if;
  end if;


  if v_source_kind = 'VOLUME' then
    if v_input_unit not in (
      'SCU',
      'cSCU',
      'mSCU',
      v_volume_unit_micro
    )
       or p_amount <>
          p_amount_micro_scu::numeric
          * 0.000001::numeric then
      raise exception
        using errcode = '22023',
              message = 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND';
    end if;
  end if;


  -- --------------------------------------------------------------------------
  -- Validate the requested destination Location.
  -- --------------------------------------------------------------------------

  if p_location_id is distinct from v_source_location_id and not exists (
    select 1
    from public.inventory_locations il
    where il.id = p_location_id
      and il.is_archived = false
  ) then
    raise exception
      using errcode = '22023',
            message = 'LOCATION_INVALID';
  end if;


  -- --------------------------------------------------------------------------
  -- Find and lock an existing destination identity.
  --
  -- LOT_IDENTITY_V1:
  --   v_actor + v_source_material + p_quality + p_location_id
  --
  -- The source row is excluded.
  -- --------------------------------------------------------------------------

  select
    i.id,
    i.input_unit,
    i.amount_micro_scu
  into
    v_target_id,
    v_target_input_unit,
    v_target_amount_micro_scu
  from public.inventory i
  where i.user_id = v_actor
    and i.material = v_source_material
    and i.quality = p_quality
    and i.location_id = p_location_id
    and i.id <> v_source_id
  for update;


  -- --------------------------------------------------------------------------
  -- No target observed: attempt an ordinary update of the locked source Lot.
  --
  -- A concurrent Add RPC does not use this advisory lock and may create the
  -- destination identity after the lookup above. The UNIQUE constraint remains
  -- the final integrity boundary.
  --
  -- The exception block is deliberately narrow. It catches only the source
  -- UPDATE and verifies the exact violated constraint before recovery.
  -- --------------------------------------------------------------------------

  if v_target_id is null then
    begin
      update public.inventory i
      set
        amount = p_amount,
        amount_micro_scu = p_amount_micro_scu,
        input_unit = v_input_unit,
        quality = p_quality,
        location_id = p_location_id,
        updated_at = now()
      where i.id = v_source_id
        and i.user_id = v_actor
      returning
        i.id,
        i.amount,
        i.amount_micro_scu
      into
        v_result_id,
        v_result_amount,
        v_result_amount_micro_scu;


      if v_result_id is null then
        raise exception
          using errcode = 'P0002',
                message = 'LOT_NOT_FOUND';
      end if;


      return query
      select
        v_result_id,
        'UPDATED'::text,
        v_result_amount,
        v_result_amount_micro_scu;

      return;

    exception
      when unique_violation then
        get stacked diagnostics
          v_constraint_name = constraint_name;

        if v_constraint_name is distinct from v_identity_constraint then
          raise;
        end if;
    end;


    -- ------------------------------------------------------------------------
    -- Late-conflict recovery.
    --
    -- The ordinary source UPDATE collided specifically with LOT_IDENTITY_V1.
    -- Locate and lock the now-existing target before merging.
    -- ------------------------------------------------------------------------

    v_target_id := null;
    v_target_input_unit := null;
    v_target_amount_micro_scu := null;


    select
      i.id,
      i.input_unit,
      i.amount_micro_scu
    into
      v_target_id,
      v_target_input_unit,
      v_target_amount_micro_scu
    from public.inventory i
    where i.user_id = v_actor
      and i.material = v_source_material
      and i.quality = p_quality
      and i.location_id = p_location_id
      and i.id <> v_source_id
    for update;


    if v_target_id is null then
      raise exception
        using errcode = 'P0001',
              message = 'LOT_IDENTITY_CONFLICT_RECOVERY_FAILED';
    end if;
  end if;


  -- --------------------------------------------------------------------------
  -- Existing or late-created target: verify matching quantity kind.
  -- --------------------------------------------------------------------------

  if v_target_input_unit = 'COUNT' then
    v_target_kind := 'COUNT';

  elsif v_target_input_unit in (
    'SCU',
    'cSCU',
    'mSCU',
    v_volume_unit_micro
  ) then
    v_target_kind := 'VOLUME';

  else
    raise exception
      using errcode = '22023',
            message = 'LOT_QUANTITY_KIND_CONFLICT';
  end if;


  if v_target_kind <> v_source_kind then
    raise exception
      using errcode = '22023',
            message = 'LOT_QUANTITY_KIND_CONFLICT';
  end if;


  -- --------------------------------------------------------------------------
  -- Guard the canonical bigint addition.
  -- --------------------------------------------------------------------------

  if v_target_amount_micro_scu is null then
    raise exception
      using errcode = 'P0001',
            message = 'LOT_MERGE_FAILED';
  end if;


  if v_target_amount_micro_scu::numeric >
     v_bigint_max - p_amount_micro_scu::numeric then
    raise exception
      using errcode = '22003',
            message = 'AMOUNT_OUT_OF_RANGE';
  end if;


  -- --------------------------------------------------------------------------
  -- Merge the newly edited source quantity into the existing target.
  -- --------------------------------------------------------------------------

  update public.inventory i
  set
    amount_micro_scu =
      i.amount_micro_scu + p_amount_micro_scu,

    amount = case
      when v_source_kind = 'COUNT' then
        i.amount_micro_scu::numeric
        + p_amount_micro_scu::numeric
      else
        (
          i.amount_micro_scu::numeric
          + p_amount_micro_scu::numeric
        ) * 0.000001::numeric
    end,

    updated_at = now()
  where i.id = v_target_id
    and i.user_id = v_actor
    and i.amount_micro_scu::numeric
      <= v_bigint_max - p_amount_micro_scu::numeric
  returning
    i.id,
    i.amount,
    i.amount_micro_scu
  into
    v_result_id,
    v_result_amount,
    v_result_amount_micro_scu;


  if v_result_id is null then
    if exists (
      select 1
      from public.inventory i
      where i.id = v_target_id
        and i.user_id = v_actor
        and i.amount_micro_scu::numeric
          > v_bigint_max - p_amount_micro_scu::numeric
    ) then
      raise exception
        using errcode = '22003',
              message = 'AMOUNT_OUT_OF_RANGE';
    end if;

    raise exception
      using errcode = 'P0001',
            message = 'LOT_MERGE_FAILED';
  end if;


  -- --------------------------------------------------------------------------
  -- Delete the locked source only after the target update succeeds.
  --
  -- Any failure after the target update rolls the function transaction back,
  -- so target update and source deletion remain atomic.
  -- --------------------------------------------------------------------------

  delete from public.inventory i
  where i.id = v_source_id
    and i.user_id = v_actor;


  if not found then
    raise exception
      using errcode = 'P0001',
            message = 'LOT_MERGE_FAILED';
  end if;


  return query
  select
    v_result_id,
    'MERGED'::text,
    v_result_amount,
    v_result_amount_micro_scu;

end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_scmdb_blueprint_catalog(p_source text, p_channel text, p_version text, p_catalog_source_file text, p_reward_source_file text, p_blueprint_total integer, p_blueprint_valid integer, p_blueprint_review_required integer, p_reward_total integer, p_duplicate_source_rows integer, p_blueprints jsonb, p_rewards jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;
