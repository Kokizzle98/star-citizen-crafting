CREATE TABLE public.scmdb_location_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('LIVE', 'PTU')),
  source_key text NOT NULL CHECK (btrim(source_key) <> ''),
  inventory_location_id uuid NOT NULL REFERENCES public.inventory_locations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  first_dataset_id uuid NOT NULL REFERENCES public.scmdb_location_datasets(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  last_dataset_id uuid NOT NULL REFERENCES public.scmdb_location_datasets(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  mapping_kind text NOT NULL CHECK (mapping_kind IN ('AUTO_CREATED', 'LEGACY_CONFIRMED')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, source_key),
  UNIQUE (channel, inventory_location_id)
);

CREATE INDEX scmdb_location_mappings_inventory_location_idx ON public.scmdb_location_mappings (inventory_location_id);
CREATE INDEX scmdb_location_mappings_last_dataset_idx ON public.scmdb_location_mappings (last_dataset_id);
CREATE INDEX scmdb_location_mappings_channel_active_idx ON public.scmdb_location_mappings (channel, is_active);

CREATE FUNCTION public.validate_scmdb_location_mapping() RETURNS trigger
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
  IF NOT EXISTS (
    SELECT 1 FROM public.scmdb_location_catalog c
    WHERE c.dataset_id = NEW.last_dataset_id AND c.source_key = NEW.source_key
      AND c.classification = 'VALID'
  ) THEN
    RAISE EXCEPTION 'SCMDB_MAPPING_SOURCE_NOT_VALID';
  END IF;
  -- The persistent Unbekannt fallback is a system location.
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations l
    WHERE l.id = NEW.inventory_location_id AND l.is_system IS FALSE
  ) THEN
    RAISE EXCEPTION 'SCMDB_MAPPING_SYSTEM_LOCATION_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_scmdb_location_mapping() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER scmdb_location_mapping_validate
  BEFORE INSERT OR UPDATE ON public.scmdb_location_mappings
  FOR EACH ROW EXECUTE FUNCTION public.validate_scmdb_location_mapping();

ALTER TABLE public.scmdb_location_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scmdb_location_mappings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.scmdb_location_mappings TO authenticated, service_role;
CREATE POLICY scmdb_location_mappings_read ON public.scmdb_location_mappings
  FOR SELECT TO authenticated, service_role USING (true);
