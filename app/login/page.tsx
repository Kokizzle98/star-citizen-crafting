export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <main className="vector-login">
      <section
        className="vector-login__panel"
        aria-labelledby="vector-login-title"
      >
        <div className="vector-login__brand" aria-hidden="true">
          VECTOR
        </div>

        <p className="vector-login__eyebrow">IDENTITY ACCESS</p>

        <h1 id="vector-login-title">Anmeldung</h1>

        <p className="vector-login__description">
          Der VECTOR-Zugang ist vorbereitet. Es wurde jedoch noch kein
          primärer Anmeldeweg für Citizen ID freigegeben.
        </p>

        <div className="vector-login__status" role="status">
          <span className="vector-login__status-dot" aria-hidden="true" />
          Anmeldung derzeit nicht verfügbar
        </div>

        <p className="vector-login__notice">
          Die vorhandene Citizen-ID-Verknüpfung ist ausschließlich für
          bereits angemeldete Konten vorgesehen und wird hier nicht als
          primärer Login verwendet.
        </p>

        <a className="vector-login__back" href="/">
          Zurück zur Startseite
        </a>
      </section>
    </main>
  )
}
