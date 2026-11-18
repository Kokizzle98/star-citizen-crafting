-- ============================================================================
-- VECTOR SECURITY HARDENING H2
-- Function and table privileges, policy helper placement, inventory write path
--
-- This migration records a privilege hardening that was already applied to
-- the existing environments. It is a follow-up migration (DB-ENV-05,
-- DB-ENV-11): on a database that already has the end state it changes
-- nothing, and it must not be applied to such a database a second time by
-- hand.
--
-- Parts, in this order:
--   1. revokes EXECUTE from authenticated on two helper functions that no
--      application path calls;
--   2. creates schema private (USAGE for authenticated), moves the policy
--      helpers is_group_member / is_group_admin / is_group_owner into it and
--      points the six functions that call them at private.*. Policies are
--      bound to the helpers by object identity, so they keep working;
--   3. revokes EXECUTE from authenticated on twelve crew administration
--      functions;
--   4. makes the two inventory RPCs SECURITY DEFINER (search_path stays
--      empty) and revokes INSERT and UPDATE on public.inventory from
--      authenticated, so that inventory rows are written only through the
--      RPCs.
--
-- Idempotent: each part first inspects the current state. Revokes and
-- ALTER ... SECURITY DEFINER are no-ops when already in effect. The helper
-- move runs only when all three helpers are still in public and is skipped
-- when all three are already in private; a mixed placement aborts. The
-- caller rewrite only touches functions that still reference public.is_group_*.
--
-- Fail closed: an expected function that does not exist, a mixed helper
-- placement, a caller that cannot be rewritten, an RPC without an empty
-- search_path, or a final state that differs from the expectation raises an
-- exception and the whole transaction rolls back.
--
-- Not applied to any database by this file's presence. Application requires a
-- separate explicit owner GO (DB-ENV-04 / DB-ENV-08).
--
-- This migration does NOT:
--   - change rows of any table, auth.*, roles, secrets or configuration;
--   - create, drop or change RLS policies;
--   - change grants of anon or PUBLIC, or any object not named above;
--   - change the logic of any function except the textual schema reference
--     public.is_group_* -> private.is_group_* in the six callers.
--
-- Operational note: schema private holds internal helpers. It must not be
-- added to the schemas exposed through the Data API.
-- ============================================================================

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------------
-- Part 1: unused helper functions lose EXECUTE for authenticated
-- ---------------------------------------------------------------------------
do $p1$
declare s text;
begin
  foreach s in array array['public.users_share_group(uuid,uuid)', 'public.is_current_user_admin()'] loop
    if to_regprocedure(s) is null then
      raise exception 'H2 part 1: function % not found', s;
    end if;
  end loop;
end $p1$;

revoke execute on function public.users_share_group(uuid, uuid) from authenticated;
revoke execute on function public.is_current_user_admin() from authenticated;

do $p1c$
declare s text;
begin
  foreach s in array array['public.users_share_group(uuid,uuid)', 'public.is_current_user_admin()'] loop
    if has_function_privilege('authenticated', s, 'EXECUTE') is distinct from false then
      raise exception 'H2 part 1 check: authenticated can still execute %', s;
    end if;
  end loop;
end $p1c$;

-- ---------------------------------------------------------------------------
-- Part 2: policy helpers move to schema private, callers point at private.*
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

do $p2$
declare
  helpers text[] := array['is_group_member', 'is_group_admin', 'is_group_owner'];
  callers text[] := array[
    'public.archive_group(uuid)',
    'public.invite_group_member(uuid,text)',
    'public.restore_group(uuid)',
    'public.revoke_group_invite(uuid)',
    'public.transfer_group_ownership(uuid,uuid,boolean)',
    'public.update_group_details(uuid,text,text)'];
  h text;
  s text;
  d text;
  n_public int;
  n_private int;
  oids_before text;
  oids_after text;
  bind_before text;
  bind_after text;
  rewritten int := 0;
begin
  -- Where are the helpers? All in public (apply), all in private (skip), else abort.
  select count(*) into n_public
    from unnest(helpers) x where to_regprocedure('public.' || x || '(uuid,uuid)') is not null;
  select count(*) into n_private
    from unnest(helpers) x where to_regprocedure('private.' || x || '(uuid,uuid)') is not null;
  if not ((n_public = 3 and n_private = 0) or (n_public = 0 and n_private = 3)) then
    raise exception 'H2 part 2: helpers are neither all in public nor all in private (public %, private %)', n_public, n_private;
  end if;

  -- Identity of the helpers and of the policy bindings before the move.
  select string_agg(coalesce(to_regprocedure('public.' || x || '(uuid,uuid)'),
                             to_regprocedure('private.' || x || '(uuid,uuid)'))::oid::text, ',' order by x)
    into oids_before from unnest(helpers) x;
  select coalesce(string_agg(b, ',' order by b), '') into bind_before
    from (select po.oid::text || '>' || d2.refobjid::text || 'x' || count(*) as b
            from pg_depend d2 join pg_policy po on po.oid = d2.objid
           where d2.classid = 'pg_policy'::regclass and d2.refclassid = 'pg_proc'::regclass
             and d2.refobjid = any(string_to_array(oids_before, ',')::oid[])
           group by po.oid, d2.refobjid) q;

  -- Move the helpers (object identity and ACL are kept).
  if n_public = 3 then
    foreach h in array helpers loop
      execute format('alter function public.%I(uuid, uuid) set schema private', h);
    end loop;
  end if;

  -- Callers: replace the schema reference, only where it is still public.
  foreach s in array callers loop
    if to_regprocedure(s) is null then
      raise exception 'H2 part 2: caller % not found', s;
    end if;
    d := pg_get_functiondef(to_regprocedure(s));
    if d ~ 'public\.is_group_(member|admin|owner)\(' then
      d := replace(replace(replace(d,
             'public.is_group_member(', 'private.is_group_member('),
             'public.is_group_admin(',  'private.is_group_admin('),
             'public.is_group_owner(',  'private.is_group_owner(');
      execute d;
      rewritten := rewritten + 1;
    end if;
  end loop;

  -- Final state of part 2.
  select count(*) into n_public
    from unnest(helpers) x where to_regprocedure('public.' || x || '(uuid,uuid)') is not null;
  select count(*) into n_private
    from unnest(helpers) x where to_regprocedure('private.' || x || '(uuid,uuid)') is not null;
  if n_public is distinct from 0 or n_private is distinct from 3 then
    raise exception 'H2 part 2 check: helpers are not all in private';
  end if;

  select string_agg(to_regprocedure('private.' || x || '(uuid,uuid)')::oid::text, ',' order by x)
    into oids_after from unnest(helpers) x;
  if oids_after is distinct from oids_before then
    raise exception 'H2 part 2 check: helper identity changed';
  end if;

  select coalesce(string_agg(b, ',' order by b), '') into bind_after
    from (select po.oid::text || '>' || d2.refobjid::text || 'x' || count(*) as b
            from pg_depend d2 join pg_policy po on po.oid = d2.objid
           where d2.classid = 'pg_policy'::regclass and d2.refclassid = 'pg_proc'::regclass
             and d2.refobjid = any(string_to_array(oids_after, ',')::oid[])
           group by po.oid, d2.refobjid) q;
  if bind_after is distinct from bind_before then
    raise exception 'H2 part 2 check: policy bindings changed';
  end if;

  foreach h in array helpers loop
    perform 1 from pg_proc p
      where p.oid = to_regprocedure('private.' || h || '(uuid,uuid)')
        and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""';
    if not found then
      raise exception 'H2 part 2 check: helper % is not SECURITY DEFINER with an empty search_path', h;
    end if;
  end loop;

  foreach s in array callers loop
    d := pg_get_functiondef(to_regprocedure(s));
    if d !~ 'private\.is_group_(member|admin|owner)\(' then
      raise exception 'H2 part 2 check: caller % does not use private.is_group_*', s;
    end if;
    perform 1 from pg_proc p
      where p.oid = to_regprocedure(s)
        and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""';
    if not found then
      raise exception 'H2 part 2 check: caller % is not SECURITY DEFINER with an empty search_path', s;
    end if;
  end loop;

  -- No function in public or private may still reference public.is_group_*.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')
                and p.proname <> all (helpers)
                and pg_get_functiondef(p.oid) ~ 'public\.is_group_(member|admin|owner)\(') then
    raise exception 'H2 part 2 check: a function still references public.is_group_*';
  end if;

  if has_schema_privilege('authenticated', 'private', 'USAGE') is distinct from true
  or has_schema_privilege('anon', 'private', 'USAGE') is distinct from false then
    raise exception 'H2 part 2 check: schema private usage';
  end if;
end $p2$;

-- ---------------------------------------------------------------------------
-- Part 3: crew administration functions lose EXECUTE for authenticated
-- ---------------------------------------------------------------------------
do $p3$
declare s text;
begin
  foreach s in array array[
    'public.create_group(text,text)',
    'public.invite_group_member(uuid,text)',
    'public.respond_group_invite(uuid,boolean)',
    'public.revoke_group_invite(uuid)',
    'public.change_member_role(uuid,uuid,text)',
    'public.remove_group_member(uuid,uuid)',
    'public.leave_group(uuid)',
    'public.transfer_group_ownership(uuid,uuid,boolean)',
    'public.update_group_details(uuid,text,text)',
    'public.archive_group(uuid)',
    'public.restore_group(uuid)',
    'public.upsert_my_profile(text)'] loop
    if to_regprocedure(s) is null then
      raise exception 'H2 part 3: function % not found', s;
    end if;
  end loop;
end $p3$;

revoke execute on function
  public.create_group(text, text),
  public.invite_group_member(uuid, text),
  public.respond_group_invite(uuid, boolean),
  public.revoke_group_invite(uuid),
  public.change_member_role(uuid, uuid, text),
  public.remove_group_member(uuid, uuid),
  public.leave_group(uuid),
  public.transfer_group_ownership(uuid, uuid, boolean),
  public.update_group_details(uuid, text, text),
  public.archive_group(uuid),
  public.restore_group(uuid),
  public.upsert_my_profile(text)
from authenticated;

do $p3c$
declare s text;
begin
  foreach s in array array[
    'public.create_group(text,text)',
    'public.invite_group_member(uuid,text)',
    'public.respond_group_invite(uuid,boolean)',
    'public.revoke_group_invite(uuid)',
    'public.change_member_role(uuid,uuid,text)',
    'public.remove_group_member(uuid,uuid)',
    'public.leave_group(uuid)',
    'public.transfer_group_ownership(uuid,uuid,boolean)',
    'public.update_group_details(uuid,text,text)',
    'public.archive_group(uuid)',
    'public.restore_group(uuid)',
    'public.upsert_my_profile(text)'] loop
    if has_function_privilege('authenticated', s, 'EXECUTE') is distinct from false then
      raise exception 'H2 part 3 check: authenticated can still execute %', s;
    end if;
  end loop;
end $p3c$;

-- ---------------------------------------------------------------------------
-- Part 4: inventory writes only through the two RPCs
-- ---------------------------------------------------------------------------
do $p4$
declare s text;
begin
  foreach s in array array[
    'public.add_or_merge_inventory_lot(text,numeric,bigint,text,text,integer,uuid)',
    'public.update_or_merge_inventory_lot(bigint,numeric,bigint,text,text,integer,uuid)'] loop
    if to_regprocedure(s) is null then
      raise exception 'H2 part 4: function % not found', s;
    end if;
    -- A SECURITY DEFINER function must not run with a caller-controlled search_path.
    perform 1 from pg_proc p
      where p.oid = to_regprocedure(s) and array_to_string(p.proconfig, ';') = 'search_path=""';
    if not found then
      raise exception 'H2 part 4: function % does not have an empty search_path', s;
    end if;
  end loop;
end $p4$;

alter function public.add_or_merge_inventory_lot(text, numeric, bigint, text, text, integer, uuid) security definer;
alter function public.update_or_merge_inventory_lot(bigint, numeric, bigint, text, text, integer, uuid) security definer;

revoke insert, update on public.inventory from authenticated;

do $p4c$
declare s text;
begin
  foreach s in array array[
    'public.add_or_merge_inventory_lot(text,numeric,bigint,text,text,integer,uuid)',
    'public.update_or_merge_inventory_lot(bigint,numeric,bigint,text,text,integer,uuid)'] loop
    perform 1 from pg_proc p
      where p.oid = to_regprocedure(s)
        and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""';
    if not found then
      raise exception 'H2 part 4 check: function % is not SECURITY DEFINER with an empty search_path', s;
    end if;
    if has_function_privilege('authenticated', s, 'EXECUTE') is distinct from true then
      raise exception 'H2 part 4 check: authenticated cannot execute %', s;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.inventory', 'INSERT') is distinct from false
  or has_table_privilege('authenticated', 'public.inventory', 'UPDATE') is distinct from false
  or has_any_column_privilege('authenticated', 'public.inventory', 'INSERT') is distinct from false
  or has_any_column_privilege('authenticated', 'public.inventory', 'UPDATE') is distinct from false
  or has_table_privilege('authenticated', 'public.inventory', 'SELECT') is distinct from true
  or has_table_privilege('authenticated', 'public.inventory', 'DELETE') is distinct from true then
    raise exception 'H2 part 4 check: inventory privileges of authenticated';
  end if;
end $p4c$;

commit;
