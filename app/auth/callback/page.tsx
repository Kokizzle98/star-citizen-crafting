'use client'

import { useEffect, useState } from 'react'

import {
  getStoredOAuthFlow,
  removeStoredOAuthFlow,
} from '@/lib/auth/start-linked-login'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type CallbackState =
  | 'processing'
  | 'success'
  | 'error'

type FinalizeResponse = {
  ok?: boolean
  returnPath?: string
  error?: string
}

function isSafeRelativePath(
  value: unknown,
): value is string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return false
  }

  try {
    const parsed = new URL(
      value,
      'https://vector.invalid',
    )

    return parsed.origin === 'https://vector.invalid'
  } catch {
    return false
  }
}

function getErrorMessage(
  code: string,
): string {
  switch (code) {
    case 'PROVIDER_ERROR':
      return 'Der externe Login-Anbieter hat den Vorgang abgebrochen oder abgelehnt.'

    case 'MISSING_CODE':
      return 'Der OAuth-Code fehlt in der Rückgabe.'

    case 'MISSING_FLOW':
      return 'Der lokale OAuth-Vorgang wurde nicht gefunden.'

    case 'FLOW_MISMATCH':
      return 'Die OAuth-Korrelation ist ungültig.'

    case 'FLOW_EXPIRED':
      return 'Der OAuth-Vorgang ist abgelaufen. Bitte starte die Verknüpfung erneut.'

    case 'EXCHANGE_FAILED':
      return 'Der OAuth-Code konnte nicht gegen eine Sitzung ausgetauscht werden.'

    case 'AUTH_REQUIRED':
      return 'Nach dem OAuth-Austausch konnte keine gültige Anmeldung bestätigt werden.'

    case 'IDENTITY_ALREADY_LINKED':
      return 'Diese Identität ist bereits mit einem anderen Benutzer verknüpft.'

    case 'FINALIZE_FAILED':
      return 'Die Identitätsverknüpfung konnte serverseitig nicht abgeschlossen werden.'

    default:
      return 'Die Identitätsverknüpfung konnte nicht abgeschlossen werden.'
  }
}

export default function OAuthCallbackPage() {
  const [state, setState] =
    useState<CallbackState>('processing')

  const [message, setMessage] =
    useState(
      'Identitätsverknüpfung wird geprüft …',
    )

  useEffect(() => {
    let cancelled = false

    async function completeOAuthFlow() {
      const supabase =
        createSupabaseBrowserClient()

      const url =
        new URL(window.location.href)

      const providerError =
        url.searchParams.get('error')

      const code =
        url.searchParams.get('code')

      const flowFromUrl =
        url.searchParams.get('flow')

      const storedFlow =
        getStoredOAuthFlow()

      function fail(
        errorCode: string,
      ) {
        if (cancelled) {
          return
        }

        removeStoredOAuthFlow()

        setState('error')
        setMessage(
          getErrorMessage(errorCode),
        )
      }

      if (providerError) {
        fail('PROVIDER_ERROR')
        return
      }

      if (!code) {
        fail('MISSING_CODE')
        return
      }

      if (!storedFlow) {
        fail('MISSING_FLOW')
        return
      }

      if (
        !flowFromUrl ||
        flowFromUrl !== storedFlow.flow
      ) {
        fail('FLOW_MISMATCH')
        return
      }

      if (
        new Date(
          storedFlow.expiresAt,
        ).getTime() <= Date.now()
      ) {
        fail('FLOW_EXPIRED')
        return
      }

      setMessage(
        'OAuth-Code wird bestätigt …',
      )

      const {
        error: exchangeError,
      } =
        await supabase.auth
          .exchangeCodeForSession(code)

      if (exchangeError) {
        console.error(
          'OAuth code exchange failed',
          exchangeError,
        )

        fail('EXCHANGE_FAILED')
        return
      }

      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth
          .getSession()

      const accessToken =
        sessionData.session
          ?.access_token

      if (
        sessionError ||
        !accessToken
      ) {
        fail('AUTH_REQUIRED')
        return
      }

      setMessage(
        'Identität wird serverseitig verifiziert …',
      )

      const {
        data: finalizeData,
        error: finalizeError,
      } =
        await supabase.functions
          .invoke(
            'vector-oauth-link-finalize',
            {
              body: {
                flow:
                  storedFlow.flow,
              },
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          )

      if (finalizeError) {
        console.error(
          'OAuth finalization failed',
          finalizeError,
          finalizeData,
        )

        fail('FINALIZE_FAILED')
        return
      }

      const response =
        finalizeData as
          | FinalizeResponse
          | null

      if (
        !response ||
        response.ok !== true
      ) {
        console.error(
          'OAuth finalization rejected',
          response,
        )

        fail(
          response?.error ??
            'FINALIZE_FAILED',
        )

        return
      }

      removeStoredOAuthFlow()

      if (cancelled) {
        return
      }

      setState('success')

      setMessage(
        'Identität erfolgreich verknüpft. Weiterleitung …',
      )

      const returnPath =
        isSafeRelativePath(
          response.returnPath,
        )
          ? response.returnPath
          : '/'

      window.location.replace(
        returnPath,
      )
    }

    void completeOAuthFlow()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '48px 24px',
      }}
    >
      <h1>
        VECTOR Identity
      </h1>

      <p
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </p>

      {state === 'error' && (
        <p>
          Bitte gehe zurück zu VECTOR
          und starte die Verknüpfung
          erneut.
        </p>
      )}
    </main>
  )
}
