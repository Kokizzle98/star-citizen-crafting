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
            Crew-, Inventory- und Crafting-Übersicht.
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
            NEXT
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

        <article className="vector-module-card">
          <span className="vector-module-card__status">
            PLANNED
          </span>

          <h2>Fabricator</h2>

          <p>
            Craftability, Materialbedarf, Qualität und
            berechenbare Item-Stats.
          </p>

          <span className="vector-module-card__footer">
            WP4
          </span>
        </article>

        <article className="vector-module-card">
          <span className="vector-module-card__status">
            DATA
          </span>

          <h2>Blueprints</h2>

          <p>
            Verifizierte Blueprint-Basis für produktiv
            berechenbare Fabricator-Items.
          </p>

          <span className="vector-module-card__footer">
            Fabricator Eligibility
          </span>
        </article>
      </section>

      <section className="vector-dashboard__status">
        <div>
          <span>ACTIVE WORK PACKAGE</span>
          <strong>WP2 · VECTOR Experience</strong>
        </div>

        <div>
          <span>NEXT PRODUCT MILESTONE</span>
          <strong>Inventory</strong>
        </div>
      </section>
    </div>
  )
}
