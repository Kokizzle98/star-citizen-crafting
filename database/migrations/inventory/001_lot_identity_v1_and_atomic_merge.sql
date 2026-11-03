-- ============================================================================
-- VECTOR WP3-A3.3 F2 + A1
-- LOT_IDENTITY_V1 AND ATOMIC ADD-OR-MERGE
--
-- LOT_IDENTITY_V1:
--   user_id + material + quality + location_id
--
-- This migration:
--   1. fails if legacy Lot units are null or blank;
--   2. fails if duplicate Lot identities exist;
--   3. installs inventory_lot_identity_v1_key if missing;
--   4. verifies an existing constraint with that name;
--   5. installs public.add_or_merge_inventory_lot(...);
--   6. grants EXECUTE only to authenticated.
--
-- This migration does NOT:
--   - merge or delete existing Inventory data;
--   - change RLS;
--   - change Inventory policies;
--   - use service_role;
--   - add Inventory triggers.
-- ============================================================================

begin;


-- Fail closed before checking identities; legacy units require manual review.
do $do$
begin
  if exists (
    select 1
    from public.inventory
    where input_unit is null
       or input_unit ~ '^[[:space:]]*$'
  ) then
    raise exception
      using errcode = 'P0001',
            message = 'LEGACY_INVENTORY_INPUT_UNIT_MISSING',
            hint = 'Review legacy Inventory Lot units before applying this migration.';
  end if;
end
$do$;


-- ============================================================================
-- [A3.3-F2-MIG-01]
-- Fail fast if LOT_IDENTITY_V1 duplicates still exist.
-- ============================================================================

do $do$
declare
  v_duplicate_count integer;
begin
  select count(*)
  into v_duplicate_count
  from (
    select
      user_id,
      material,
      quality,
      location_id
    from public.inventory
    group by
      user_id,
      material,
      quality,
      location_id
    having count(*) > 1
  ) duplicate_identities;

  if v_duplicate_count > 0 then
    raise exception
      using errcode = '23505',
            message =
              'LOT_IDENTITY_V1_DUPLICATES_EXIST',
            detail = format(
              '%s duplicate Lot identity group(s) found.',
              v_duplicate_count
            ),
            hint =
              'Clean up duplicate Inventory Lots before applying this migration.';
  end if;
end
$do$;


-- ============================================================================
-- [A3.3-F2-MIG-02]
-- Install or verify LOT_IDENTITY_V1.
-- ============================================================================

do $do$
declare
  v_definition text;
begin
  select pg_get_constraintdef(con.oid, true)
  into v_definition
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c
    on c.oid = con.conrelid
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'inventory'
    and con.conname =
      'inventory_lot_identity_v1_key';

  if v_definition is null then
    alter table public.inventory
      add constraint inventory_lot_identity_v1_key
      unique (
        user_id,
        material,
        quality,
        location_id
      );

  elsif v_definition <>
    'UNIQUE (user_id, material, quality, location_id)'
  then
    raise exception
      using errcode = 'P0001',
            message =
              'LOT_IDENTITY_V1_CONSTRAINT_MISMATCH',
            detail = format(
              'Existing definition: %s',
              v_definition
            );
  end if;
end
$do$;


-- ============================================================================
-- [A3.3-A1-MIG-01]
-- Atomic Add-or-Merge RPC.
-- ============================================================================

create or replace function public.add_or_merge_inventory_lot(
  p_material text,
  p_amount numeric,
  p_amount_micro_scu bigint,
  p_input_unit text,
  p_quantity_kind text,
  p_quality integer,
  p_location_id uuid
)
returns table (
  inventory_id bigint,
  outcome text,
  amount numeric,
  amount_micro_scu bigint
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
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
      / 1000000::numeric
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
      ) / 1000000::numeric
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


-- ============================================================================
-- [A3.3-A1-MIG-02]
-- Lock down RPC execution.
-- ============================================================================

revoke all
on function public.add_or_merge_inventory_lot(
  text,
  numeric,
  bigint,
  text,
  text,
  integer,
  uuid
)
from public;


revoke all
on function public.add_or_merge_inventory_lot(
  text,
  numeric,
  bigint,
  text,
  text,
  integer,
  uuid
)
from anon;


grant execute
on function public.add_or_merge_inventory_lot(
  text,
  numeric,
  bigint,
  text,
  text,
  integer,
  uuid
)
to authenticated;


comment on function public.add_or_merge_inventory_lot(
  text,
  numeric,
  bigint,
  text,
  text,
  integer,
  uuid
)
is
  'Atomically creates or merges an owned Inventory Lot using LOT_IDENTITY_V1.';


commit;
