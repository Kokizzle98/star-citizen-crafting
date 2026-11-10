CREATE TABLE public.scmdb_location_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source = 'SCMDB'),
  channel text NOT NULL CHECK (channel IN ('LIVE', 'PTU')),
  version text NOT NULL CHECK (length(btrim(version)) > 0),
  source_file text NOT NULL CHECK (length(btrim(source_file)) > 0),
  status text NOT NULL CHECK (status IN ('STAGING', 'ACTIVE', 'FAILED', 'SUPERSEDED')),
  total integer NOT NULL CHECK (total >= 0),
  valid integer NOT NULL CHECK (valid >= 0),
  quarantined integer NOT NULL CHECK (quarantined >= 0),
  rejected_technical integer NOT NULL CHECK (rejected_technical >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, channel, version),
  CHECK (total::bigint = valid::bigint + quarantined::bigint + rejected_technical::bigint)
);

CREATE UNIQUE INDEX scmdb_location_datasets_active_channel_idx
  ON public.scmdb_location_datasets (source, channel) WHERE status = 'ACTIVE';

CREATE TABLE public.scmdb_location_catalog (
  dataset_id uuid NOT NULL REFERENCES public.scmdb_location_datasets(id) ON DELETE CASCADE,
  source_key text NOT NULL CHECK (length(btrim(source_key)) > 0),
  canonical_name text NOT NULL CHECK (length(btrim(canonical_name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  location_type text NOT NULL CHECK (length(btrim(location_type)) > 0),
  system_name text CHECK (system_name IS NULL OR length(btrim(system_name)) > 0),
  planet_name text CHECK (planet_name IS NULL OR length(btrim(planet_name)) > 0),
  moon_name text CHECK (moon_name IS NULL OR length(btrim(moon_name)) > 0),
  classification text NOT NULL CHECK (classification IN ('VALID', 'QUARANTINED', 'REJECTED_TECHNICAL')),
  issues text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id, source_key),
  CHECK (array_position(issues, NULL) IS NULL),
  CHECK (
    (classification = 'VALID' AND cardinality(issues) = 0) OR
    (classification = 'QUARANTINED' AND cardinality(issues) > 0 AND NOT ('TECHNICAL_NAME' = ANY(issues))) OR
    (classification = 'REJECTED_TECHNICAL' AND 'TECHNICAL_NAME' = ANY(issues))
  )
);
CREATE INDEX scmdb_location_catalog_source_key_idx ON public.scmdb_location_catalog (source_key);
CREATE INDEX scmdb_location_catalog_normalized_name_idx ON public.scmdb_location_catalog (normalized_name);
CREATE INDEX scmdb_location_catalog_classification_idx ON public.scmdb_location_catalog (classification);
CREATE INDEX scmdb_location_catalog_dataset_id_idx ON public.scmdb_location_catalog (dataset_id);

ALTER TABLE public.scmdb_location_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scmdb_location_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scmdb_location_datasets, public.scmdb_location_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scmdb_location_datasets, public.scmdb_location_catalog TO authenticated;
CREATE POLICY scmdb_location_datasets_read ON public.scmdb_location_datasets FOR SELECT TO authenticated USING (true);
CREATE POLICY scmdb_location_catalog_read ON public.scmdb_location_catalog FOR SELECT TO authenticated USING (true);

CREATE FUNCTION public.sync_scmdb_location_catalog(
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
REVOKE ALL ON FUNCTION public.sync_scmdb_location_catalog(text, text, text, text, integer, integer, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_scmdb_location_catalog(text, text, text, text, integer, integer, integer, integer, jsonb) TO service_role;
