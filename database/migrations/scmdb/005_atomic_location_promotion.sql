CREATE FUNCTION public.promote_active_scmdb_locations(p_channel text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.promote_active_scmdb_locations(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_active_scmdb_locations(text) TO service_role;
