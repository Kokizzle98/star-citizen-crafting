import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  BLUEPRINT_READ_PAGE_SIZE,
  BLUEPRINT_UI_CHANNEL,
  BLUEPRINT_UI_SOURCE,
  activeBlueprintDatasetResult,
  blueprintCatalogResult,
  crewBlueprintErrorResult,
  crewBlueprintStatusResult,
  ownBlueprintOwnershipResult,
  readAllPages,
  type BlueprintCatalogResult,
  type CrewBlueprintStatusResult,
  type OwnBlueprintOwnershipResult,
} from './blueprint-catalog-result'

// Read boundary of /vector/blueprints. Uses only the signed-in user's session
// (publishable key + cookies); RLS decides what is visible. No admin client and
// no service_role. The recipe column is deliberately not read.

export const BLUEPRINT_CATALOG_COLUMNS =
  'blueprint_id,source_tag,product_name,gear,type,subtype,manufacturer,review_state,issues,scmdb_suggested_name'

/** Upper bound for the caller's own ownership rows (10 pages); more fails closed. */
const MAX_OWNERSHIP_PAGES = 10

export type BlueprintPageData = {
  catalog: BlueprintCatalogResult
  own: OwnBlueprintOwnershipResult
  crew: CrewBlueprintStatusResult
}

const unavailable: BlueprintPageData = {
  catalog: { status: 'read_error' },
  own: { status: 'read_error' },
  crew: { status: 'read_error' },
}

export async function getBlueprintPageData(): Promise<BlueprintPageData> {
  try {
    const supabase = createSupabaseServerClient()

    const { data: datasets, error: datasetError } = await supabase
      .from('scmdb_blueprint_datasets')
      .select('id,source,channel,version,status,blueprint_total')
      .eq('source', BLUEPRINT_UI_SOURCE)
      .eq('channel', BLUEPRINT_UI_CHANNEL)
      .eq('status', 'ACTIVE')
    const datasetResult = activeBlueprintDatasetResult(datasets, datasetError)
    if (datasetResult.status !== 'success') {
      return { ...unavailable, catalog: datasetResult }
    }
    const { dataset } = datasetResult

    const [catalogPages, ownPages, crewPages] = await Promise.all([
      readAllPages(
        (from, to) => supabase
          .from('scmdb_blueprint_catalog')
          .select(BLUEPRINT_CATALOG_COLUMNS)
          .eq('dataset_id', dataset.id)
          .order('blueprint_id', { ascending: true })
          .range(from, to),
        BLUEPRINT_READ_PAGE_SIZE,
        Math.ceil(dataset.blueprintTotal / BLUEPRINT_READ_PAGE_SIZE) + 1,
      ),
      // RLS returns only the caller's own rows (user_id = auth.uid()).
      readAllPages(
        (from, to) => supabase
          .from('user_blueprint_ownership')
          .select('blueprint_id')
          .order('blueprint_id', { ascending: true })
          .range(from, to),
        BLUEPRINT_READ_PAGE_SIZE,
        MAX_OWNERSHIP_PAGES,
      ),
      readAllPages(
        (from, to) => supabase
          .rpc('get_active_crew_blueprint_status')
          .select('blueprint_id,status,crew_owner_nicknames')
          .order('blueprint_id', { ascending: true })
          .range(from, to),
        BLUEPRINT_READ_PAGE_SIZE,
        Math.ceil(dataset.blueprintTotal / BLUEPRINT_READ_PAGE_SIZE) + MAX_OWNERSHIP_PAGES,
      ),
    ])

    return {
      catalog: catalogPages.ok ? blueprintCatalogResult(dataset, catalogPages.rows) : { status: 'read_error' },
      own: ownPages.ok ? ownBlueprintOwnershipResult(ownPages.rows) : { status: 'read_error' },
      crew: crewPages.ok
        ? crewBlueprintStatusResult(crewPages.rows)
        : crewPages.error ? crewBlueprintErrorResult(crewPages.error) : { status: 'read_error' },
    }
  } catch {
    return unavailable
  }
}
