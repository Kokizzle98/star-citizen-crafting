import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type LinkStartRequest = {
  provider?: unknown
  next?: unknown
}

const allowedProviders = new Set([
  'custom:citizen-id',
])

const allowedOrigins = new Set(
  [
    Deno.env.get('APP_ORIGIN'),
    'http://localhost:3000',
  ].filter(
    (value): value is string => Boolean(value),
  ),
)

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin')

  const allowedOrigin =
    origin && allowedOrigins.has(origin)
      ? origin
      : Deno.env.get('APP_ORIGIN') ?? ''

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
) {
  return Response.json(body, {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

function safeRelativePath(
  raw: unknown,
  fallback = '/',
) {
  if (
    typeof raw !== 'string' ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\')
  ) {
    return fallback
  }

  try {
    const parsed = new URL(
      raw,
      'https://vector.invalid',
    )

    if (
      parsed.origin !==
      'https://vector.invalid'
    ) {
      return fallback
    }

    return [
      parsed.pathname,
      parsed.search,
      parsed.hash,
    ].join('')
  } catch {
    return fallback
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin')

    if (
      !origin ||
      !allowedOrigins.has(origin)
    ) {
      return new Response(null, {
        status: 403,
        headers: getCorsHeaders(request),
      })
    }

    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      request,
      {
        error: 'METHOD_NOT_ALLOWED',
      },
      405,
    )
  }

  const origin = request.headers.get('Origin')

  if (
    origin &&
    !allowedOrigins.has(origin)
  ) {
    return jsonResponse(
      request,
      {
        error: 'ORIGIN_NOT_ALLOWED',
      },
      403,
    )
  }

  const supabaseUrl =
    Deno.env.get('SUPABASE_URL')

  const publishableKey =
    Deno.env.get(
      'SUPABASE_PUBLISHABLE_KEY',
    ) ??
    Deno.env.get(
      'SUPABASE_ANON_KEY',
    )

  const secretKey =
    Deno.env.get(
      'SUPABASE_SECRET_KEY',
    ) ??
    Deno.env.get(
      'SUPABASE_SERVICE_ROLE_KEY',
    )

  const appOrigin =
    Deno.env.get('APP_ORIGIN')

  if (
    !supabaseUrl ||
    !publishableKey ||
    !secretKey ||
    !appOrigin
  ) {
    console.error(
      'OAuth link-start configuration is incomplete',
    )

    return jsonResponse(
      request,
      {
        error: 'SERVER_CONFIGURATION_ERROR',
      },
      500,
    )
  }

  const authorization =
    request.headers.get('Authorization')

  if (
    !authorization?.startsWith('Bearer ')
  ) {
    return jsonResponse(
      request,
      {
        error: 'AUTH_REQUIRED',
      },
      401,
    )
  }

  const userClient = createClient(
    supabaseUrl,
    publishableKey,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return jsonResponse(
      request,
      {
        error: 'AUTH_REQUIRED',
      },
      401,
    )
  }

  const body =
    (await request
      .json()
      .catch(
        () => ({}),
      )) as LinkStartRequest

  const provider =
    typeof body.provider === 'string'
      ? body.provider.trim()
      : ''

  if (
    !allowedProviders.has(provider)
  ) {
    return jsonResponse(
      request,
      {
        error: 'PROVIDER_NOT_ALLOWED',
      },
      400,
    )
  }

  const returnPath =
    safeRelativePath(body.next)

  const flowId =
    crypto.randomUUID()

  const expiresAt =
    new Date(
      Date.now() + 10 * 60_000,
    ).toISOString()

  const identitiesBefore =
    (user.identities ?? [])
      .map(
        (identity) =>
          `${identity.provider}:${identity.id}`,
      )
      .sort()

  const admin = createClient(
    supabaseUrl,
    secretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )

  const { error: insertError } =
    await admin
      .from('identity_oauth_flows')
      .insert({
        id: flowId,
        user_id: user.id,
        operation: 'LINK_LOGIN',
        expected_provider: provider,
        pre_link_identity_keys:
          identitiesBefore,
        return_path: returnPath,
        expires_at: expiresAt,
      })

  if (insertError) {
    console.error(
      'Failed to create OAuth flow',
      insertError,
    )

    return jsonResponse(
      request,
      {
        error: 'FLOW_CREATE_FAILED',
      },
      500,
    )
  }

  const normalizedOrigin =
    appOrigin.endsWith('/')
      ? appOrigin
      : `${appOrigin}/`

  const callbackUrl = new URL(
    'auth/callback/',
    normalizedOrigin,
  )

  callbackUrl.searchParams.set(
    'flow',
    flowId,
  )

  return jsonResponse(request, {
    ok: true,
    flow: flowId,
    callbackUrl:
      callbackUrl.toString(),
    expiresAt,
  })
})
