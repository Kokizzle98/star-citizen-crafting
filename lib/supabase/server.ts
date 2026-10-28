import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

type CookieToSet = { name: string; value: string; options: CookieOptions }

export function createSupabaseServerClient() {
  const store = cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('SUPABASE_PUBLIC_ENV_MISSING')

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items: CookieToSet[]) => {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Server Components cannot write cookies. Middleware refreshes sessions.
        }
      },
    },
  })
}
