import { getActiveGroupInventory } from '@/lib/inventory/inventory-read'
import { getLiveMaterialUnits } from '@/lib/inventory/material-units'
import { InventoryView } from '@/components/inventory/InventoryView'
import { InventorySwitch } from '@/components/inventory/InventorySwitch'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Crew Inventory',
}

// Crew Inventory: overview of all lots of the active crew, strictly read-only.
// No Quick Add, no edit, no delete (not even for own lots). Authorization stays
// in RLS/RPC; this separation is presentation only (INVENTORY_UX_V1_1 3, 16).
export default async function CrewInventoryPage() {
  const result = await getActiveGroupInventory()
  const [metadata, auth] = result.status === 'success'
    ? await Promise.all([getLiveMaterialUnits(), createSupabaseServerClient().auth.getUser()])
    : [null, null]
  const viewerUserId = auth && !auth.error ? auth.data.user?.id ?? null : null

  return (
    <div className="vector-dashboard">
      <header className="vector-page-header">
        <div>
          <p className="eyebrow">VECTOR · USABLE ALPHA</p>
          <h1>Crew Inventory</h1>
        </div>
      </header>

      <InventorySwitch active="crew" />

      {result.status === 'success' && (
        result.rows.length === 0 ? (
          <p>Für diese Crew ist noch kein Inventory vorhanden.</p>
        ) : (
          <InventoryView rows={result.rows} units={metadata?.units ?? {}} metadataAvailable={metadata?.available ?? false}
            currentUserId={null} crewViewerUserId={viewerUserId} locations={null} label="Crew Inventory" />
        )
      )}
      {result.status === 'no_active_crew' && <p>Keine aktive Crew ausgewählt.</p>}
      {result.status === 'unauthorized' && <p>Der Inventory-Kontext ist nicht verfügbar.</p>}
      {result.status === 'read_error' && <p>Inventory konnte nicht geladen werden.</p>}
    </div>
  )
}
