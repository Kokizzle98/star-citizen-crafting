import { getActiveGroupInventory } from '@/lib/inventory/inventory-read'
import { getLiveMaterialUnits } from '@/lib/inventory/material-units'
import { InventoryView } from '@/components/inventory/InventoryView'
import { AddInventoryLotForm } from '@/components/inventory/AddInventoryLotForm'
import { getInventoryLocationOptions } from '@/lib/inventory/inventory-form-options'

export const metadata = {
  title: 'Inventory',
}

export default async function InventoryPage() {
  const result = await getActiveGroupInventory()
  const [metadata, locations] = result.status === 'success'
    ? await Promise.all([getLiveMaterialUnits(), getInventoryLocationOptions()])
    : [null, null]

  return (
    <div className="vector-dashboard">
      <header className="vector-page-header">
        <div>
          <p className="eyebrow">VECTOR · USABLE ALPHA</p>
          <h1>Inventory</h1>
        </div>
      </header>

      {result.status === 'success' && metadata?.available && locations?.ok &&
        <AddInventoryLotForm units={metadata.units} locations={locations.locations} />}
      {result.status === 'success' && (!metadata?.available || !locations?.ok) &&
        <p role="status">Materialien oder Locations konnten nicht geladen werden. Lot hinzufügen ist nicht verfügbar.</p>}
      {result.status === 'success' && (
        result.rows.length === 0 ? (
          <p>Für diese Crew ist noch kein Inventory vorhanden.</p>
        ) : (
          <InventoryView rows={result.rows} units={metadata?.units ?? {}} metadataAvailable={metadata?.available ?? false} />
        )
      )}
      {result.status === 'no_active_crew' && <p>Keine aktive Crew ausgewählt.</p>}
      {result.status === 'unauthorized' && <p>Der Inventory-Kontext ist nicht verfügbar.</p>}
      {result.status === 'read_error' && <p>Inventory konnte nicht geladen werden.</p>}
    </div>
  )
}
