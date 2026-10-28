import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const allowedProviders = new Set(['custom:citizen-id'])

function safeRelativePath(raw: unknown, fallback = '/') {
  if (
    typeof raw !== 'string' ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\')
  ) {
    return fallback
  }

  try {
    const parsed = new URL(raw, 'https://vector.invalid')

    if (parsed.origin !== 'https://vector.invalid') {
      return fallback
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (request.method !== 'POST') {
    return Response.json(
      { error: 'METHOD_NOT_ALLOWED' },
      {
        status: 405,
        headers: corsHeaders,
      },
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY')
  const secretKey =
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appOrigin = Deno.env.get('APP_ORIGIN')

  if (!supabaseUrl || !publishableKey || !secretKey || !appOrigin) {
    console.error('OAuth link start configuration is incomplete')

    return Response.json(
      { error: 'SERVER_CONFIGURATION_ERROR' },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }

  const authorization = request.headers.get('Authorization')

  if (!authorization?.startsWith('Bearer ')) {
    return Response.json(
      { error: 'AUTH_REQUIRED' },
      {
        status: 401,
        headers: corsHeaders,
      },
    )
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
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
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return Response.json(
      { error: 'AUTH_REQUIRED' },
      {
        status: 401,
        headers: corsHeaders,
      },
    )
  }

  const body = await request.json().catch(() => ({}))

  const provider =
    typeof body.provider === 'string'
      ? body.provider
      : ''

  const next = safeRelativePath(body.next)

  if (!allowedProviders.has(provider)) {
    return Response.json(
      { error: 'PROVIDER_NOT_ALLOWED' },
      {
        status: 400,
        headers: corsHeaders,
      },
    )
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const flowId = crypto.randomUUID()
  const expiresAt = new Date(
    Date.now() + 10 * 60_000,
  ).toISOString()

  const before = (user.identities ?? [])
    .map((identity) => `${identity.provider}:${identity.id}`)
    .sort()

  const { error: insertError } = await admin
    .from('identity_oauth_flows')
    .insert({
      id: flowId,
      user_id: user.id,
      operation: 'LINK_LOGIN',
      expected_provider: provider,
      pre_link_identity_keys: before,
      return_path: next,
      expires_at: expiresAt,
    })

  if (insertError) {
    console.error('Failed to create OAuth flow', insertError)

    return Response.json(
      { error: 'FLOW_CREATE_FAILED' },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }

  try {
    const callback = new URL(
      `${supabaseUrl}/functions/v1/vector-oauth-callback`,
    )

    callback.searchParams.set('flow', flowId)

    const { data, error: linkError } =
      await userClient.auth.linkIdentity({
        provider: provider as never,
        options: {
          redirectTo: callback.toString(),
        },
      })

    if (linkError || !data?.url) {
      await admin
        .from('identity_oauth_flows')
        .delete()
        .eq('id', flowId)

      console.error('Failed to start identity link', linkError)

      return Response.json(
        { error: 'LINK_START_FAILED' },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    return Response.json(
      {
        url: data.url,
        flow: flowId,
      },
      {
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    await admin
      .from('identity_oauth_flows')
      .delete()
      .eq('id', flowId)

    console.error('OAuth link start failed', error)

    return Response.json(
      { error: 'LINK_START_FAILED' },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
})
