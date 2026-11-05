-- ============================================================================
-- VECTOR WP3-A3.3-B
-- ATOMIC EDIT IDENTITY CONFLICT RESOLUTION
--
-- LOT_IDENTITY_V1:
--   user_id + material + quality + location_id
--
-- This migration:
--   1. verifies the required LOT_IDENTITY_V1 constraint;
--   2. installs public.update_or_merge_inventory_lot(...);
--   3. serializes identity-changing edits per authenticated actor;
--   4. locks the owned source Lot;
--   5. updates the source when the destination identity is free;
--   6. merges the edited source quantity into an existing target Lot;
--   7. deletes the source Lot only inside the same transaction;
--   8. handles a target identity created concurrently;
--   9. grants EXECUTE only to authenticated.
--
-- This migration does NOT:
--   - change LOT_IDENTITY_V1;
--   - modify migration 001;
--   - change Inventory RLS or policies;
--   - change public.add_or_merge_inventory_lot(...);
--   - add Inventory triggers;
--   - accept material or owner identity from the caller;
--   - add a database-level Crew ownership model.
--
-- DB outcomes:
--   UPDATED
--   MERGED
--
-- Deployment dependency:
--   002_inventory_amount_precision.sql must be applied first.
-- ============================================================================

begin;


-- ============================================================================
-- [A3.3-B2-MIG-01]
-- Verify the required LOT_IDENTITY_V1 contract.
-- ============================================================================

do $do$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_definition
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c
    on c.oid = con.conrelid
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'inventory'
    and con.conname = 'inventory_lot_identity_v1_key';

  if v_definition is null then
    raise exception
      using errcode = 'P0001',
            message = 'LOT_IDENTITY_V1_CONSTRAINT_MISSING';

  elsif v_definition <>
    'UNIQUE (user_id, material, quality, location_id)'
  then
    raise exception
      using errcode = 'P0001',
            message = 'LOT_IDENTITY_V1_CONSTRAINT_MISMATCH',
            detail = pg_catalog.format(
              'Existing definition: %s',
              v_definition
            );
  end if;
end
$do$;


-- ============================================================================
-- [A3.3-B2-MIG-02]
-- Require the exact Inventory amount precision foundation.
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

  if v_data_type is distinct from 'numeric'
     or (v_precision, v_scale) is distinct from (25, 6)
     or v_nullable is distinct from 'NO' then
    raise exception
      using errcode = 'P0001',
            message = 'INVENTORY_AMOUNT_PRECISION_REQUIRED',
            detail = pg_catalog.format(
              'Current contract: type=%s precision=%s scale=%s nullable=%s',
              v_data_type,
              v_precision,
              v_scale,
              v_nullable
            ),
            hint =
              'Apply 002_inventory_amount_precision.sql before this migration.';
  end if;
end
$do$;


-- ============================================================================
-- [A3.3-B2-MIG-03]
-- Atomically update an owned Lot or merge it into an existing identity.
--
-- p_amount and p_amount_micro_scu describe the newly edited source quantity.
-- On MERGED, that edited quantity is added to the existing target Lot.
-- ============================================================================

create function public.update_or_merge_inventory_lot(
  p_inventory_id bigint,
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

  v_kind text := upper(pg_catalog.btrim(p_quantity_kind));
  v_input_unit text := pg_catalog.btrim(p_input_unit);

  v_source_id bigint;
  v_source_material text;
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
    i.input_unit
  into
    v_source_id,
    v_source_material,
    v_source_input_unit
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


-- ============================================================================
-- [A3.3-B2-MIG-04]
-- Lock down RPC execution.
-- ============================================================================

revoke all
on function public.update_or_merge_inventory_lot(
  bigint,
  numeric,
  bigint,
  text,
  text,
  integer,
  uuid
)
from public;


revoke all
on function public.update_or_merge_inventory_lot(
  bigint,
  numeric,
  bigint,
  text,
  text,
  integer,
  uuid
)
from anon;


grant execute
on function public.update_or_merge_inventory_lot(
  bigint,
  numeric,
  bigint,
  text,
  text,
  integer,
  uuid
)
to authenticated;


comment on function public.update_or_merge_inventory_lot(
  bigint,
  numeric,
  bigint,
  text,
  text,
  integer,
  uuid
)
is
  'Atomically updates an owned Inventory Lot or merges its edited quantity into an existing LOT_IDENTITY_V1 target.';


commit;