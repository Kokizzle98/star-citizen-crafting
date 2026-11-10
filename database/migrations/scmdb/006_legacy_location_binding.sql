CREATE FUNCTION public.bind_scmdb_legacy_location(
  p_source_key text,
  p_inventory_location_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.bind_scmdb_legacy_location(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bind_scmdb_legacy_location(text, uuid) TO service_role;
