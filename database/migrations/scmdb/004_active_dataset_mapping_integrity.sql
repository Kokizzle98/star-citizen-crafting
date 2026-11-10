CREATE FUNCTION public.validate_scmdb_active_dataset_mappings() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    IF EXISTS (
      SELECT 1 FROM public.scmdb_location_mappings m
      WHERE m.channel = NEW.channel AND m.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.scmdb_location_catalog c
          WHERE c.dataset_id = NEW.id AND c.source_key = m.source_key
            AND c.classification = 'VALID'
        )
    ) THEN
      RAISE EXCEPTION 'SCMDB_ACTIVE_DATASET_INVALIDATES_MAPPINGS';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_scmdb_active_dataset_mappings() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER scmdb_active_dataset_mapping_validate
  BEFORE INSERT OR UPDATE ON public.scmdb_location_datasets
  FOR EACH ROW EXECUTE FUNCTION public.validate_scmdb_active_dataset_mappings();
