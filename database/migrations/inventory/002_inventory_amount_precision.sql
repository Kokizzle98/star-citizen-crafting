-- ============================================================================
-- VECTOR WP3-A3.3-B2-PRECISION
-- EXACT INVENTORY AMOUNT PRECISION
--
-- Canonical quantity:
--   amount_micro_scu bigint
--
-- Exact decimal representation:
--   amount numeric(25,6)
--
-- Quantity invariants:
--   COUNT:
--     amount = amount_micro_scu
--
--   VOLUME:
--     amount = amount_micro_scu * 0.000001
--
-- This migration:
--   1. verifies the current or already-migrated amount column contract;
--   2. fails closed on missing, blank, or unsupported Inventory units;
--   3. fails closed on inconsistent canonical quantities;
--   4. widens amount from numeric(12,3) to numeric(25,6);
--   5. replaces lossy canonical division in Add-or-Merge with exact
--      multiplication by 0.000001;
--   6. preserves the existing Add-or-Merge signature and outcomes;
--   7. restores the existing RPC execution grants explicitly.
--
-- This migration does NOT:
--   - modify amount_micro_scu;
--   - modify LOT_IDENTITY_V1;
--   - alter Inventory RLS or policies;
--   - add triggers;
--   - implement Edit Identity Conflict;
--   - modify migration 001.
-- ============================================================================

begin;


-- ============================================================================
-- [B2-PRECISION-MIG-01]
-- Verify the current amount column contract.
-- Accept the original type or the already-migrated target type only.
-- ============================================================================

do $do$
declare
  v_data_type text;
  v_precision integer;
  v_scale integer;
  v_nullable text;
begin
  select
    c.data_type,
    c.numeric_precision,
    c.numeric_scale,
    c.is_nullable
  into
    v_data_type,
    v_precision,
    v_scale,
    v_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'inventory'
    and c.column_name = 'amount';

  if v_data_type is null then
    raise exception
      using errcode = 'P0001',
            message = 'INVENTORY_AMOUNT_COLUMN_MISSING';
  end if;

  if v_data_type <> 'numeric'
     or v_nullable <> 'NO'
     or (
       (v_precision, v_scale) <> (12, 3)
       and
       (v_precision, v_scale) <> (25, 6)
     ) then
    raise exception
      using errcode = 'P0001',
            message = 'INVENTORY_AMOUNT_TYPE_MISMATCH',
            detail = pg_catalog.format(
              'Existing contract: type=%s precision=%s scale=%s nullable=%s',
              v_data_type,
              v_precision,
              v_scale,
              v_nullable
            ),
            hint =
              'Expected numeric(12,3) or numeric(25,6), both NOT NULL.';
  end if;
end
$do$;


-- ============================================================================
-- [B2-PRECISION-MIG-02]
-- Fail closed on missing, blank, or unsupported units.
-- ============================================================================

do $do$
begin
  if exists (
    select 1
    from public.inventory i
    where i.input_unit is null
       or i.input_unit ~ '^[[:space:]]*$'
       or i.input_unit not in (
         'COUNT',
         'SCU',
         'cSCU',
         'mSCU',
         U&'\00B5SCU'
       )
  ) then
    raise exception
      using errcode = 'P0001',
            message = 'INVENTORY_UNIT_CONTRACT_INVALID',
            hint =
              'Review unsupported Inventory units before applying this migration.';
  end if;
end
$do$;


-- ============================================================================
-- [B2-PRECISION-MIG-03]
-- Verify every existing Lot against its canonical amount_micro_scu value.
-- Multiplication is used for VOLUME to preserve the complete bigint range.
-- ============================================================================

do $do$
declare
  v_inconsistent_count integer;
begin
  select count(*)
  into v_inconsistent_count
  from public.inventory i
  where
    (
      i.input_unit = 'COUNT'
      and i.amount <> i.amount_micro_scu::numeric
    )
    or
    (
      i.input_unit in (
        'SCU',
        'cSCU',
        'mSCU',
        U&'\00B5SCU'
      )
      and i.amount <>
        i.amount_micro_scu::numeric
        * 0.000001::numeric
    );

  if v_inconsistent_count > 0 then
    raise exception
      using errcode = 'P0001',
            message = 'INVENTORY_AMOUNT_CANONICAL_MISMATCH',
            detail = pg_catalog.format(
              '%s inconsistent Inventory Lot(s) found.',
              v_inconsistent_count
            ),
            hint =
              'Review amount and amount_micro_scu before applying this migration.';
  end if;
end
$do$;


-- ============================================================================
-- [B2-PRECISION-MIG-04]
-- Widen the exact decimal representation.
-- Existing numeric(12,3) values map losslessly to numeric(25,6).
-- ============================================================================

do $do$
declare
  v_precision integer;
  v_scale integer;
begin
  select
    c.numeric_precision,
    c.numeric_scale
  into
    v_precision,
    v_scale
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'inventory'
    and c.column_name = 'amount';

  if (v_precision, v_scale) = (12, 3) then
    alter table public.inventory
      alter column amount
      type numeric(25,6)
      using amount::numeric(25,6);

  elsif (v_precision, v_scale) <> (25, 6) then
    raise exception
      using errcode = 'P0001',
            message = 'INVENTORY_AMOUNT_TYPE_MISMATCH';
  end if;
end
$do$;


-- ============================================================================
-- [B2-PRECISION-MIG-05]
-- Reinstall Add-or-Merge with exact canonical VOLUME reconstruction.
-- Signature, ownership model and CREATED/MERGED outcomes remain unchanged.
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

-- ============================================================================
-- Restore the explicit execution contract.
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
  'Atomically creates or merges an owned Inventory Lot using LOT_IDENTITY_V1 with exact micro-SCU precision.';


-- ============================================================================
-- [B2-PRECISION-MIG-07]
-- Verify the final amount column contract.
-- ============================================================================

do $do$
declare
  v_precision integer;
  v_scale integer;
  v_nullable text;
begin
  select
    c.numeric_precision,
    c.numeric_scale,
    c.is_nullable
  into
    v_precision,
    v_scale,
    v_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'inventory'
    and c.column_name = 'amount';

  if (v_precision, v_scale) <> (25, 6)
     or v_nullable <> 'NO' then
    raise exception
      using errcode = 'P0001',
            message = 'INVENTORY_AMOUNT_PRECISION_POSTCHECK_FAILED',
            detail = pg_catalog.format(
              'Final contract: precision=%s scale=%s nullable=%s',
              v_precision,
              v_scale,
              v_nullable
            );
  end if;
end
$do$;


commit;