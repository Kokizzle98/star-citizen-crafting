import { getActiveGroupInventory } from '@/lib/inventory/inventory-read'

export const metadata = {
  title: 'Inventory',
}

export default async function InventoryPage() {
  const result = await getActiveGroupInventory()

  return (
    <div className="vector-dashboard">
      <header className="vector-page-header">
        <div>
          <p className="eyebrow">VECTOR · USABLE ALPHA</p>
          <h1>Inventory</h1>
        </div>
      </header>

      {result.status === 'success' && (
        result.rows.length === 0 ? (
          <p>Für diese Crew ist noch kein Inventory vorhanden.</p>
        ) : (
          <div className="vector-inventory-table" role="region" aria-label="Inventory" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Material</th>
                  <th scope="col">Menge</th>
                  <th scope="col">Qualität</th>
                  <th scope="col">Location</th>
                  <th scope="col">Spieler</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.inventory_id}>
                    <td>{row.material}</td>
                    <td>{row.amount} SCU</td>
                    <td>{row.quality}</td>
                    <td>{row.location_name}</td>
                    <td>{row.player_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {result.status === 'no_active_crew' && <p>Keine aktive Crew ausgewählt.</p>}
      {result.status === 'unauthorized' && <p>Der Inventory-Kontext ist nicht verfügbar.</p>}
      {result.status === 'read_error' && <p>Inventory konnte nicht geladen werden.</p>}
    </div>
  )
}
