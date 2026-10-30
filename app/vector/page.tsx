import { requireUser } from '@/lib/auth/authorization'

export const metadata = {
  title: 'Systemzugang',
}

export default async function VectorPage() {
  const { supabase, user } = await requireUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('nickname')
    .eq('id', user.id)
    .maybeSingle()

  const displayName =
    profile?.nickname ??
    user.email ??
    'VECTOR Account'

  return (
    <>
      <section className="hero" aria-labelledby="vector-access-title">
        <p className="eyebrow">USABLE ALPHA · WP1 ACCESS</p>
        <h1 id="vector-access-title">Zugang bestätigt</h1>
        <p>
          Willkommen bei VECTOR, {displayName}.
        </p>
      </section>

      <section
        className="vector-access-grid"
        aria-label="VECTOR Zugangsstatus"
      >
        <article className="card">
          <span className="status vector-status--ready">
            AUTHENTICATED
          </span>
          <h2>Account</h2>
          <p>
            Die E-Mail- und Passwortsession ist aktiv.
          </p>
        </article>

        <article className="card">
          <span className="status">NEXT</span>
          <h2>Group Context</h2>
          <p>
            Als Nächstes verbinden wir Kokizzle und Accalia mit dem
            gemeinsamen VECTOR-Gruppenkontext.
          </p>
        </article>
      </section>
    </>
  )
}
