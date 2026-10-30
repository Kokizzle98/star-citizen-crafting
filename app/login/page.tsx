import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { safeRelativePath } from '@/lib/auth/redirect'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type LoginPageProps = {
  searchParams?: {
    next?: string
  }
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const nextPath = safeRelativePath(searchParams?.next ?? null, '/vector')
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect(nextPath)
  }

  return (
    <section
      className="vector-login"
      aria-labelledby="vector-login-title"
    >
      <div className="vector-login__panel">
        <div className="vector-login__brand" aria-hidden="true">
          VECTOR
        </div>

        <p className="vector-login__eyebrow">IDENTITY ACCESS</p>

        <h1 id="vector-login-title">Anmeldung</h1>

        <p className="vector-login__description">
          Melde dich mit deinem bestehenden VECTOR-Konto an.
        </p>

        <LoginForm nextPath={nextPath} />

        <p className="vector-login__notice">
          Citizen ID und weitere Spielidentitäten werden nach der Anmeldung
          mit dem VECTOR-Konto verknüpft. Sie ersetzen nicht den primären
          E-Mail- und Passwortzugang.
        </p>

        <a className="vector-login__back" href="/">
          Zurück zur Startseite
        </a>
      </div>
    </section>
  )
}
