import Link from 'next/link'

export function AppHeader() {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="VECTOR Startseite">
        <strong>VECTOR</strong><span>GROUP SYSTEM</span>
      </Link>
      <nav aria-label="Hauptnavigation">
        <Link href="/">Dashboard</Link>
        <span aria-disabled="true">Inventory</span>
        <span aria-disabled="true">Fabricator</span>
        <span aria-disabled="true">Fleet</span>
        <span aria-disabled="true">Trading</span>
      </nav>
      <div className="release">1.2.0 · DEVELOP</div>
    </header>
  )
}
