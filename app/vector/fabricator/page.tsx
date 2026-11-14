import { requireUser } from '@/lib/auth/authorization'
import { getFabricatorWorkspaceData } from '@/lib/fabricator/fabricator-workspace-read'
import { FabricatorWorkspace } from '@/components/fabricator/FabricatorWorkspace'

export const metadata = {
  title: 'Fabricator',
}

const GUARD_MESSAGES: Record<string, string> = {
  VERSION_MISMATCH: 'Der im Repository hinterlegte LIVE-Datensatz passt nicht zum aktiven LIVE Blueprint-Katalog.',
  BLUEPRINT_TOTAL_MISMATCH: 'Der im Repository hinterlegte LIVE-Datensatz passt nicht zum aktiven LIVE Blueprint-Katalog.',
  CHANNEL_MISMATCH: 'Der aktive Blueprint-Katalog ist kein LIVE-Katalog.',
  DATASET_UNAVAILABLE: 'Es ist kein aktiver LIVE Blueprint-Katalog verfügbar.',
  DATASET_AMBIGUOUS: 'Der aktive LIVE Blueprint-Katalog ist nicht eindeutig.',
}

export default async function FabricatorPage() {
  await requireUser()
  const data = await getFabricatorWorkspaceData()

  return (
    <div className="vector-dashboard fabricator-page">
      <header className="vector-page-header">
        <div>
          <p className="eyebrow">VECTOR · USABLE ALPHA{data.status === 'ready' ? ` · LIVE ${data.catalog.version}` : ''}</p>
          <h1>Fabricator</h1>
          <p className="vector-page-header__description">
            Produkt wählen, Rezept prüfen und mit dem Materialbestand deiner aktiven Crew vergleichen.
            Der Fabricator verändert, reserviert oder verbraucht keine Lots.
          </p>
        </div>
      </header>

      {data.status === 'ready' && <FabricatorWorkspace catalog={data.catalog} crew={data.crew} />}
      {data.status === 'guard_failed' && (
        <p role="alert" className="fabricator-notice fabricator-notice--error">
          Fabricator nicht verfügbar: {GUARD_MESSAGES[data.guard.status] ?? 'Der LIVE-Datensatz konnte nicht bestätigt werden.'}
          {' '}Es wird kein anderer Datensatz ersatzweise verwendet.
        </p>
      )}
      {data.status === 'read_error' && (
        <p role="alert" className="fabricator-notice fabricator-notice--error">Der Fabricator konnte nicht geladen werden.</p>
      )}
    </div>
  )
}
