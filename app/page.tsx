const cards = [
  ['Inventory', 'Persönliche und freigegebene Bestände verwalten.'],
  ['Fabricator', 'Blueprints, Materialbedarf und Qualitätsziele prüfen.'],
  ['Fleet', 'Actual und Target Loadouts getrennt planen.'],
  ['Trading', 'Marktübersicht, Aufträge und UEE-Börse.'],
]

export default function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="vector-title">
        <p className="eyebrow">RESTART 1.2.0 · DEVELOP</p>
        <h1 id="vector-title">VECTOR</h1>
        <p>Die neue Plattform-Baseline. Legacy v1.3.2 bleibt archiviert.</p>
      </section>
      <section className="grid" aria-label="VECTOR Module">
        {cards.map(([title, description]) => (
          <article className="card" key={title}>
            <span className="status">PREFLIGHT</span>
            <h2>{title}</h2>
            <p>{description}</p>
            <button type="button" disabled aria-disabled="true">Wird integriert</button>
          </article>
        ))}
      </section>
    </>
  )
}
