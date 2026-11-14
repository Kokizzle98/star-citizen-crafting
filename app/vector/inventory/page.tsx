import { getActiveGroupInventory } from '@/lib/inventory/inventory-read'
import { getLiveMaterialUnits } from '@/lib/inventory/material-units'
import { InventoryView } from '@/components/inventory/InventoryView'
import { InventorySwitch } from '@/components/inventory/InventorySwitch'
import { AddInventoryLotForm } from '@/components/inventory/AddInventoryLotForm'
import { getInventoryLocationOptions } from '@/lib/inventory/inventory-form-options'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Mein Inventory',
}

// Mein Inventory: management page, shows only the signed-in user's own lots.
// The filter is presentation; authorization stays in RLS/RPC (INVENTORY_UX_V1_1 16).
export default async function InventoryPage() {
  const result = await getActiveGroupInventory()
  const [metadata, locations, auth] = result.status === 'success'
    ? await Promise.all([getLiveMaterialUnits(), getInventoryLocationOptions(), createSupabaseServerClient().auth.getUser()])
    : [null, null, null]
  const currentUserId = auth && !auth.error ? auth.data.user?.id ?? null : null
  const ownRows = result.status === 'success' && currentUserId !== null
    ? result.rows.filter(row => row.owner_user_id === currentUserId)
    : []

  return (
    <div className="vector-dashboard">
      <header className="vector-page-header">
        <div>
          <p className="eyebrow">VECTOR · USABLE ALPHA</p>
          <h1>Mein Inventory</h1>
        </div>
      </header>

      <InventorySwitch active="own" />

      {result.status === 'success' && currentUserId !== null && metadata?.available && locations?.ok &&
        <AddInventoryLotForm units={metadata.units} locations={locations.locations} fallbackLocationId={locations.fallbackLocationId} />}
      {result.status === 'success' && (!metadata?.available || !locations?.ok) &&
        <p role="status">Materialien oder Locations konnten nicht geladen werden. Lot hinzufügen ist nicht verfügbar.</p>}
      {result.status === 'success' && currentUserId === null && <p>Der Inventory-Kontext ist nicht verfügbar.</p>}
      {result.status === 'success' && currentUserId !== null && (
        ownRows.length === 0 ? (
          <p>Du hast noch kein Material im Inventory. Lege mit „Lot hinzufügen“ das erste an.</p>
        ) : (
          <InventoryView rows={ownRows} units={metadata?.units ?? {}} metadataAvailable={metadata?.available ?? false}
            currentUserId={currentUserId} locations={locations?.ok ? locations.locations : null} label="Mein Inventory" />
        )
      )}
      {result.status === 'no_active_crew' && <p>Keine aktive Crew ausgewählt.</p>}
      {result.status === 'unauthorized' && <p>Der Inventory-Kontext ist nicht verfügbar.</p>}
      {result.status === 'read_error' && <p>Inventory konnte nicht geladen werden.</p>}
    </div>
  )
}
