-- ============================================================================
-- VECTOR SECURITY HARDENING H1
-- Profile visibility and function privileges
--
-- This migration:
--   1. replaces the SELECT policy profiles_read on public.profiles so that an
--      authenticated user can read only the own profile and the profiles of
--      members of shared, non-archived crews;
--   2. revokes EXECUTE from PUBLIC, anon and authenticated on two
--      event/trigger functions. Triggers and event triggers keep working:
--      EXECUTE is checked when a trigger is created, not when it fires.
--
-- Idempotent: safe to run more than once.
-- Not applied to any database by this file's presence. Application requires a
-- separate explicit owner GO (DB-ENV-04 / DB-ENV-08).
--
-- This migration does NOT:
--   - change profiles_update_own or any other policy;
--   - change helper functions or crew RPC logic;
--   - change table data.
-- ============================================================================

begin;

alter table public.profiles enable row level security;

drop policy if exists profiles_read on public.profiles;

create policy profiles_read
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.group_members me
      join public.groups g
        on g.id = me.group_id
       and g.archived_at is null
      join public.group_members other
        on other.group_id = me.group_id
      where me.user_id = (select auth.uid())
        and other.user_id = profiles.id
    )
  );

revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

revoke execute on function public.validate_profile_primary_game_account()
  from public, anon, authenticated;

commit;
