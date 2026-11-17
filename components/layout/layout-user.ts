import 'server-only'
import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Who is signed in, once per request: the shell (sidebar for visitors) and the
// topbar both need it. React's cache() makes it one auth call, not two.
// Display only; authorization stays in the pages and in RLS/RPC.
export const getLayoutUser = cache(async () => {
  const { data: { user } } = await createSupabaseServerClient().auth.getUser()
  return user
})
