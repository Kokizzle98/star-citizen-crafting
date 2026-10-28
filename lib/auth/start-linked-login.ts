'use client'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

const OAUTH_FLOW_STORAGE_KEY = 'vector.oauth.link.flow'

const ALLOWED_PROVIDERS = new Set([
  'custom:citizen-id',
])

type LinkStartResponse = {
  ok: boolean
  flow: string
  callbackUrl: string
  expiresAt: string
}

type StoredOAuthFlow = {
  flow: string
  provider: string
  callbackUrl: string
  expiresAt: string
}

export type StartLinkedLoginOptions = {
  provider?: string
  next?: string
}

function isSafeRelativePath(value: string) {
  if (
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

function normalizeReturnPath(
  value: string | undefined,
) {
  if (!value || !isSafeRelativePath(value)) {
    return '/'
  }

  return value
}

function isLinkStartResponse(
  value: unknown,
): value is LinkStartResponse {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false
  }

  const candidate =
    value as Partial<LinkStartResponse>

  return (
    candidate.ok === true &&
    typeof candidate.flow === 'string' &&
    candidate.flow.length > 0 &&
    typeof candidate.callbackUrl === 'string' &&
    candidate.callbackUrl.length > 0 &&
    typeof candidate.expiresAt === 'string' &&
    candidate.expiresAt.length > 0
  )
}

function storeOAuthFlow(
  flow: StoredOAuthFlow,
) {
  window.sessionStorage.setItem(
    OAUTH_FLOW_STORAGE_KEY,
    JSON.stringify(flow),
  )
}

function clearOAuthFlow() {
  window.sessionStorage.removeItem(
    OAUTH_FLOW_STORAGE_KEY,
  )
}

export function getStoredOAuthFlow():
  | StoredOAuthFlow
  | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw =
    window.sessionStorage.getItem(
      OAUTH_FLOW_STORAGE_KEY,
    )

  if (!raw) {
    return null
  }

  try {
    const parsed =
      JSON.parse(raw) as Partial<StoredOAuthFlow>

    if (
      typeof parsed.flow !== 'string' ||
      typeof parsed.provider !== 'string' ||
      typeof parsed.callbackUrl !== 'string' ||
      typeof parsed.expiresAt !== 'string'
    ) {
      clearOAuthFlow()
      return null
    }

    if (
      new Date(parsed.expiresAt).getTime() <=
      Date.now()
    ) {
      clearOAuthFlow()
      return null
    }

    return {
      flow: parsed.flow,
      provider: parsed.provider,
      callbackUrl: parsed.callbackUrl,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    clearOAuthFlow()
    return null
  }
}

export function removeStoredOAuthFlow() {
  if (typeof window === 'undefined') {
    return
  }

  clearOAuthFlow()
}

export async function startLinkedLogin(
  options: StartLinkedLoginOptions = {},
) {
  if (typeof window === 'undefined') {
    throw new Error('OAUTH_BROWSER_REQUIRED')
  }

  const provider =
    options.provider ?? 'custom:citizen-id'

  if (!ALLOWED_PROVIDERS.has(provider)) {
    throw new Error('PROVIDER_NOT_ALLOWED')
  }

  const next =
    normalizeReturnPath(options.next)

  const supabase =
    createSupabaseBrowserClient()

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession()

  const accessToken =
    sessionData.session?.access_token

  if (sessionError || !accessToken) {
    throw new Error('AUTH_REQUIRED')
  }

  const {
    data: startData,
    error: startError,
  } = await supabase.functions.invoke(
    'vector-oauth-link-start',
    {
      body: {
        provider,
        next,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (
    startError ||
    !isLinkStartResponse(startData)
  ) {
    console.error(
      'OAuth flow creation failed',
      startError,
      startData,
    )

    throw new Error('FLOW_CREATE_FAILED')
  }

  storeOAuthFlow({
    flow: startData.flow,
    provider,
    callbackUrl: startData.callbackUrl,
    expiresAt: startData.expiresAt,
  })

  const {
    data: linkData,
    error: linkError,
  } = await supabase.auth.linkIdentity({
    provider: provider as never,
    options: {
      redirectTo: startData.callbackUrl,
      skipBrowserRedirect: true,
    },
  })

  if (linkError || !linkData?.url) {
    clearOAuthFlow()

    console.error(
      'OAuth identity linking failed',
      linkError,
    )

    throw new Error('LINK_START_FAILED')
  }

  window.location.assign(linkData.url)
}
