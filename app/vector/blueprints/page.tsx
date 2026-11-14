import { requireUser } from '@/lib/auth/authorization'
import { getBlueprintPageData } from '@/lib/blueprints/blueprint-catalog-read'
import { BlueprintCatalogView } from '@/components/blueprints/BlueprintCatalogView'

export const metadata = {
  title: 'Blueprints',
}

export default async function BlueprintsPage() {
  const { user } = await requireUser()
  // Server time before the reads start; the view uses it to tell newer
  // confirmed ownership changes apart from this snapshot (PR4-OD-01).
  const loadedAt = Date.now()
  const { catalog, own, crew } = await getBlueprintPageData()

  return (
    <div className="vector-dashboard">
      <header className="vector-page-header">
        <div>
          <p className="eyebrow blueprint-eyebrow">
            VECTOR · USABLE ALPHA{catalog.status === 'success' ? ` · LIVE ${catalog.dataset.version}` : ''}
          </p>
          <h1>Blueprints</h1>
          <p className="vector-page-header__description">
            LIVE Blueprint-Katalog. Markiere Blueprints, die du besitzt. Ohne Markierung ist der Besitz
            nicht bekannt.
          </p>
        </div>
      </header>

      {catalog.status === 'success' && (
        <BlueprintCatalogView
          rows={catalog.rows}
          ownedIds={own.status === 'success' ? own.ownedIds : null}
          crew={crew}
          currentUserId={user.id}
          loadedAt={loadedAt}
        />
      )}
      {catalog.status === 'no_active_dataset' && <p role="status">Es ist kein aktiver LIVE Blueprint-Katalog verfügbar.</p>}
      {catalog.status === 'read_error' && <p role="alert">Der Blueprint-Katalog konnte nicht geladen werden.</p>}
    </div>
  )
}
