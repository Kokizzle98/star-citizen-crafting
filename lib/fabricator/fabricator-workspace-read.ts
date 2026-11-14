import 'server-only'
import { getActiveGroupInventory } from '@/lib/inventory/inventory-read'
import { buildFabricatorCatalog, type FabricatorCatalog } from './fabricator-catalog'
import type { FabricatorCrewLot } from './fabricator-craftability'
import { getFabricatorLiveSource } from './fabricator-live-source-read'
import type { FabricatorPreparedSource } from './fabricator-live-source-cache'
import type { FabricatorDatasetGuardResult } from './fabricator-dataset-guard'

// Server read boundary of /vector/fabricator (F2). Read-only:
// - the guarded LIVE mirror from F1 (version must equal the ACTIVE LIVE
//   database dataset, otherwise fail closed; no PTU, no fallback);
// - the active crew's lots through the existing get_active_group_inventory()
//   RPC (its AUTH_REQUIRED / ACTIVE_GROUP_REQUIRED / ACTIVE_GROUP_NOT_ALLOWED
//   semantics are kept; no crew is chosen silently).
// Nothing is reserved, consumed, moved or written.

export type FabricatorCrewResult =
  | { status: 'success'; lots: FabricatorCrewLot[] }
  | { status: 'no_active_crew' }
  | { status: 'unauthorized' }
  | { status: 'read_error' }

export type FabricatorWorkspaceData =
  | { status: 'ready'; catalog: FabricatorCatalog; crew: FabricatorCrewResult }
  | { status: 'guard_failed'; guard: Exclude<FabricatorDatasetGuardResult, { status: 'MATCH' }> }
  | { status: 'read_error' }

// The prepared source object is cached per process (F1); the compact catalog
// is derived from it once and reused for every request of that process.
const catalogs = new WeakMap<FabricatorPreparedSource['source'], FabricatorCatalog>()

function catalogFor(prepared: FabricatorPreparedSource): FabricatorCatalog {
  let catalog = catalogs.get(prepared.source)
  if (!catalog) {
    catalog = buildFabricatorCatalog(prepared)
    catalogs.set(prepared.source, catalog)
  }
  return catalog
}

export async function getFabricatorWorkspaceData(): Promise<FabricatorWorkspaceData> {
  const [source, inventory] = await Promise.all([getFabricatorLiveSource(), getActiveGroupInventory()])
  if (source.status === 'guard_failed') return { status: 'guard_failed', guard: source.guard }
  if (source.status !== 'ready') return { status: 'read_error' }

  let crew: FabricatorCrewResult
  if (inventory.status === 'success') {
    crew = {
      status: 'success',
      // Only what the workspace shows; owner ids and timestamps stay on the server.
      lots: inventory.rows.map(row => ({
        id: row.inventory_id,
        playerName: row.player_name,
        material: row.material,
        inputUnit: row.input_unit,
        amount: row.amount,
        amountMicroScu: row.amount_micro_scu,
        quality: row.quality,
        locationId: row.location_id,
        locationName: row.location_name,
      })),
    }
  } else {
    crew = { status: inventory.status }
  }

  try {
    return { status: 'ready', catalog: catalogFor(source), crew }
  } catch (error) {
    console.error('Fabricator catalog could not be built', error)
    return { status: 'read_error' }
  }
}
