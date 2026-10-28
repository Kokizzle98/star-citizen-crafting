import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { UserMenu } from '@/components/account/UserMenu'

type AppRole = 'USER' | 'ONTOLOGY_ADMIN' | 'SYSTEM_ADMIN'

export async function HeaderAccountMenu() {
  const supabase = createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <Link className="account-login-link" href="/login">
        Anmelden
      </Link>
    )
  }

  const [
    { data: profile },
    { data: game },
    { data: role, error: roleError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('nickname')
      .eq('id', user.id)
      .single(),

    supabase
      .from('game_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('game_code', 'STAR_CITIZEN')
      .eq('verification_status', 'VERIFIED')
      .maybeSingle(),

    supabase.rpc('get_my_app_role'),
  ])

  if (roleError) {
    throw roleError
  }

  return (
    <UserMenu
      nickname={profile?.nickname ?? 'Account'}
      isAdmin={(role as AppRole) === 'SYSTEM_ADMIN'}
      rsiLinked={Boolean(game)}
    />
  )
}
