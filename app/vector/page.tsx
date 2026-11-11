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
        <article className="vector-module-card">
          <span className="vector-module-card__status">
            VERFÜGBAR
          </span>

          <h2>Inventory</h2>

          <p>
            Persönliche und für die Crew verfügbare Bestände,
            Lots, Qualität und Locations.
          </p>

          <span className="vector-module-card__footer">
            WP3
          </span>
        </article>

        <Link
          href="/vector/fabricator"
          className="vector-module-card vector-module-card--link"
        >
          <span className="vector-module-card__status">
            VERFÜGBAR
          </span>

          <h2>Fabricator</h2>

          <p>
            Produkt wählen, Rezept prüfen und mit dem
            Crew-Materialbestand vergleichen.
          </p>

          <span className="vector-module-card__footer">
            Workspace · Rezept · Crew · Öffnen <span aria-hidden="true">→</span>
          </span>
        </Link>

        <Link
          href="/vector/blueprints"
          className="vector-module-card vector-module-card--link"
        >
          <span className="vector-module-card__status">
            VERFÜGBAR
          </span>

          <h2>Blueprints</h2>

          <p>
            LIVE Blueprint-Katalog durchsuchen und
            eigenen Besitz manuell markieren.
          </p>

          <span className="vector-module-card__footer">
            Ownership / Tracking · Öffnen <span aria-hidden="true">→</span>
          </span>
        </Link>
      </section>

      <section className="vector-dashboard__status">
        <div>
          <span>CURRENT STATE</span>
          <strong>Inventory · SCMDB Locations · Blueprints · Fabricator</strong>
        </div>

        <div>
          <span>NEXT PRODUCT MILESTONE</span>
          <strong>Fabricator Quality &amp; Stats</strong>
        </div>
      </section>
    </div>
  )
}
