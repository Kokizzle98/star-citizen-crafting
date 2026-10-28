import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type FinalizeRequest = {
  flow?: unknown
}

const allowedOrigins = new Set(
  [
    Deno.env.get('APP_ORIGIN'),
    'http://localhost:3000',
  ].filter((value): value is string => Boolean(value)),
)

function corsHeaders(request: Request) {
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
      ...corsHeaders(request),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin')

    if (!origin || !allowedOrigins.has(origin)) {
      return new Response(null, {
        status: 403,
        headers: corsHeaders(request),
      })
    }

    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      request,
      { error: 'METHOD_NOT_ALLOWED' },
      405,
    )
  }

  const origin = request.headers.get('Origin')

  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(
      request,
      { error: 'ORIGIN_NOT_ALLOWED' },
      403,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')

  const publishableKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY')

  const secretKey =
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !publishableKey || !secretKey) {
    console.error(
      'OAuth finalize configuration is incomplete',
    )

    return jsonResponse(
      request,
      { error: 'SERVER_CONFIGURATION_ERROR' },
      500,
    )
  }

  const authorization =
    request.headers.get('Authorization')

  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(
      request,
      { error: 'AUTH_REQUIRED' },
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
      { error: 'AUTH_REQUIRED' },
      401,
    )
  }

  const body =
    (await request
      .json()
      .catch(() => ({}))) as FinalizeRequest

  const flowId =
    typeof body.flow === 'string'
      ? body.flow.trim()
      : ''

  if (!flowId) {
    return jsonResponse(
      request,
      { error: 'FLOW_REQUIRED' },
      400,
    )
  }

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

  const {
    data: flow,
    error: flowError,
  } = await admin
    .from('identity_oauth_flows')
    .select(
      [
        'id',
        'user_id',
        'operation',
        'expected_provider',
        'pre_link_identity_keys',
        'return_path',
        'expires_at',
        'consumed_at',
      ].join(','),
    )
    .eq('id', flowId)
    .is('consumed_at', null)
    .maybeSingle()

  if (flowError) {
    console.error(
      'OAuth flow lookup failed',
      flowError,
    )

    return jsonResponse(
      request,
      { error: 'FLOW_LOOKUP_FAILED' },
      500,
    )
  }

  if (!flow) {
    return jsonResponse(
      request,
      { error: 'FLOW_NOT_FOUND_OR_CONSUMED' },
      404,
    )
  }

  if (
    new Date(flow.expires_at).getTime() <=
    Date.now()
  ) {
    return jsonResponse(
      request,
      { error: 'FLOW_EXPIRED' },
      410,
    )
  }

  if (flow.user_id !== user.id) {
    return jsonResponse(
      request,
      { error: 'FLOW_USER_MISMATCH' },
      403,
    )
  }

  if (flow.operation !== 'LINK_LOGIN') {
    return jsonResponse(
      request,
      { error: 'FLOW_OPERATION_MISMATCH' },
      400,
    )
  }

  const before = new Set<string>(
    Array.isArray(flow.pre_link_identity_keys)
      ? flow.pre_link_identity_keys.filter(
          (value: unknown): value is string =>
            typeof value === 'string',
        )
      : [],
  )

  const addedIdentities = (
    user.identities ?? []
  ).filter(
    (identity) =>
      !before.has(
        `${identity.provider}:${identity.id}`,
      ),
  )

  if (addedIdentities.length !== 1) {
    return jsonResponse(
      request,
      { error: 'UNEXPECTED_IDENTITY_COUNT' },
      409,
    )
  }

  const identity = addedIdentities[0]

  if (
    identity.provider !==
    flow.expected_provider
  ) {
    return jsonResponse(
      request,
      { error: 'PROVIDER_MISMATCH' },
      409,
    )
  }

  const providerCode =
    flow.expected_provider ===
    'custom:citizen-id'
      ? 'CITIZEN_ID'
      : null

  if (!providerCode) {
    return jsonResponse(
      request,
      { error: 'PROVIDER_MAPPING_MISSING' },
      400,
    )
  }

  const metadata =
    identity.identity_data &&
    typeof identity.identity_data === 'object'
      ? identity.identity_data
      : {}

  const preferredUsername =
    typeof metadata.preferred_username ===
    'string'
      ? metadata.preferred_username
      : null

  const displayName =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null

  const {
    error: finalizeError,
  } = await admin.rpc(
    'identity_finalize_link_server',
    {
      p_user_id: user.id,
      p_provider_code: providerCode,
      p_provider_subject: identity.id,
      p_handle: preferredUsername,
      p_display_name: displayName,
      p_make_primary: false,
      p_flow_id: flow.id,
    },
  )

  if (finalizeError) {
    console.error(
      'OAuth identity finalization failed',
      finalizeError,
    )

    const publicError =
      finalizeError.message ===
      'IDENTITY_ALREADY_LINKED_TO_ANOTHER_USER'
        ? 'IDENTITY_ALREADY_LINKED'
        : 'IDENTITY_FINALIZE_FAILED'

    return jsonResponse(
      request,
      { error: publicError },
      publicError ===
        'IDENTITY_ALREADY_LINKED'
        ? 409
        : 500,
    )
  }

  const consumedAt =
    new Date().toISOString()

  const {
    data: consumedFlow,
    error: consumeError,
  } = await admin
    .from('identity_oauth_flows')
    .update({
      consumed_at: consumedAt,
    })
    .eq('id', flow.id)
    .eq('user_id', user.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle()

  if (consumeError || !consumedFlow) {
    console.error(
      'OAuth flow consumption failed',
      consumeError,
    )

    return jsonResponse(
      request,
      { error: 'FLOW_CONSUME_FAILED' },
      409,
    )
  }

  return jsonResponse(request, {
    ok: true,
    returnPath:
      typeof flow.return_path === 'string'
        ? flow.return_path
        : '/',
  })
})
