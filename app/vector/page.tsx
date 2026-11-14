import Link from 'next/link'
import { requireUser } from '@/lib/auth/authorization'

export const metadata = {
  title: 'Dashboard',
}

export default async function VectorPage() {
  await requireUser()

  return (
    <div className="vector-dashboard">
      <header className="vector-page-header">
        <div>
          <p className="eyebrow">
            VECTOR · USABLE ALPHA
          </p>

          <h1>Dashboard</h1>

          <p className="vector-page-header__description">
            Crew-, Inventory-, Blueprint- und Crafting-Übersicht.
          </p>
        </div>

        <span className="vector-alpha-badge">
          ALPHA
        </span>
      </header>

      <section
        className="vector-dashboard__modules"
        aria-label="VECTOR Alpha Module"
      >
        <Link
          href="/vector/inventory"
          className="vector-module-card vector-module-card--link"
        >
          <span className="vector-module-card__status">
            <span aria-hidden="true">✓</span> VERFÜGBAR
          </span>

          <h2>Inventory</h2>

          <p>
            Persönliche und für die Crew verfügbare Bestände,
            Lots, Qualität und Locations.
          </p>

          <span className="vector-module-card__footer">
            Mein · Crew · Öffnen <span aria-hidden="true">→</span>
          </span>
        </Link>

        <Link
          href="/vector/fabricator"
          className="vector-module-card vector-module-card--link"
        >
          <span className="vector-module-card__status">
            <span aria-hidden="true">✓</span> VERFÜGBAR
          </span>

          <h2>Fabricator</h2>

          <p>
            Produkt wählen, Rezept prüfen und mit dem
            Crew-Materialbestand vergleichen.
          </p>

          <span className="vector-module-card__footer">
            Rezept · Crew · Öffnen <span aria-hidden="true">→</span>
          </span>
        </Link>

        <Link
          href="/vector/blueprints"
          className="vector-module-card vector-module-card--link"
        >
          <span className="vector-module-card__status">
            <span aria-hidden="true">✓</span> VERFÜGBAR
          </span>

          <h2>Blueprints</h2>

          <p>
            LIVE Blueprint-Katalog durchsuchen und
            eigenen Besitz manuell markieren.
          </p>

          <span className="vector-module-card__footer">
            Katalog · Besitz · Öffnen <span aria-hidden="true">→</span>
          </span>
        </Link>
      </section>

      <p className="vector-dashboard__hint">
        Neu hier? Wähle oben deine Crew und lege in{' '}
        <Link href="/vector/inventory">Mein Inventory</Link> dein erstes Lot an.
      </p>

      <section className="vector-dashboard__status" aria-label="Projektstand">
        <div>
          <span>AKTUELLER STAND</span>
          <strong>Inventory · SCMDB Locations · Blueprints · Fabricator</strong>
        </div>

        <div>
          <span>NÄCHSTER MEILENSTEIN</span>
          <strong>Fabricator Quality &amp; Stats</strong>
        </div>
      </section>
    </div>
  )
}
