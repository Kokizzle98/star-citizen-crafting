BEGIN;

-- Retired mappings retain their identity even when the latest dataset lacks the source.
CREATE OR REPLACE FUNCTION public.validate_scmdb_location_mapping() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
$$;

-- Acquire the shared locks before a dataset statement takes row locks.
CREATE FUNCTION public.lock_scmdb_location_dataset_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_promotion:LIVE', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('scmdb_location_catalog:SCMDB:LIVE', 0));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_scmdb_location_dataset_lifecycle() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.apply_scmdb_location_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.apply_scmdb_location_lifecycle() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER scmdb_active_dataset_mapping_validate ON public.scmdb_location_datasets;
CREATE TRIGGER scmdb_dataset_lifecycle_locks
  BEFORE INSERT OR UPDATE ON public.scmdb_location_datasets
  FOR EACH STATEMENT EXECUTE FUNCTION public.lock_scmdb_location_dataset_lifecycle();
CREATE TRIGGER scmdb_dataset_lifecycle
  AFTER INSERT OR UPDATE ON public.scmdb_location_datasets
  FOR EACH ROW EXECUTE FUNCTION public.apply_scmdb_location_lifecycle();


-- Keep the existing sync behavior, acquiring the shared LIVE lock first.
CREATE OR REPLACE FUNCTION public.sync_scmdb_location_catalog(
  p_source text, p_channel text, p_version text, p_source_file text,
  p_total integer, p_valid integer, p_quarantined integer, p_rejected_technical integer,
  p_rows jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
$$;

COMMIT;
