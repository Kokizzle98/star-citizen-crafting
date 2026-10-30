'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { safeRelativePath } from '@/lib/auth/redirect'

type LoginFormProps = {
  nextPath?: string
}

function getLoginErrorMessage(message: string) {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials')
  ) {
    return 'E-Mail-Adresse oder Passwort stimmen nicht.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Die E-Mail-Adresse wurde noch nicht bestätigt.'
  }

  return 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.'
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setError('')
    setLoading(true)

    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        setError(getLoginErrorMessage(signInError.message))
        return
      }

      router.replace(safeRelativePath(nextPath ?? null, '/vector'))
      router.refresh()
    } catch {
      setError(
        'VECTOR konnte die Anmeldung nicht starten. Bitte prüfe die Konfiguration.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="vector-login__form" onSubmit={handleSubmit}>
      <div className="vector-field">
        <label htmlFor="vector-login-email">E-Mail-Adresse</label>
        <input
          id="vector-login-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={loading}
          required
        />
      </div>

      <div className="vector-field">
        <label htmlFor="vector-login-password">Passwort</label>
        <input
          id="vector-login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          required
        />
      </div>

      {error ? (
        <p className="vector-login__error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="vector-login__submit"
        type="submit"
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Verbindung wird hergestellt …' : 'Bei VECTOR anmelden'}
      </button>
    </form>
  )
}
