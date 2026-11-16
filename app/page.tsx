import Link from 'next/link'
import { FAN_PROJECT_NOTICE, OFFICIAL_SITE } from '@/components/layout/navigation'

const highlights = [
  ['Inventory', 'Bestände der Crew erfassen und gemeinsam im Blick behalten.'],
  ['Blueprints', 'Blueprints durchsuchen und die eigenen markieren.'],
  ['Fabricator', 'Materialbedarf und Qualitätsziele fürs Crafting prüfen.'],
] as const

export default function HomePage() {
  return (
    <section className="landing" aria-labelledby="vector-title">
      <h1 id="vector-title">VECTOR</h1>
      <p className="landing__lead">
        Group Terminal für Crafting, Inventar und Blueprints in Star Citizen. Alpha.
      </p>

      <ul className="landing__list">
        {highlights.map(([title, description]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{description}</span>
          </li>
        ))}
      </ul>

      <Link className="landing__login" href="/login">
        Anmelden
      </Link>

      <p className="landing__notice">
        {FAN_PROJECT_NOTICE}{' '}
        <a href={OFFICIAL_SITE.url} target="_blank" rel="noopener noreferrer">
          {OFFICIAL_SITE.label}
        </a>
      </p>
    </section>
  )
}
