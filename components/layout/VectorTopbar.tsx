import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AccountDrawer } from '@/components/account/AccountDrawer'

type AppRole = 'USER' | 'ONTOLOGY_ADMIN' | 'SYSTEM_ADMIN'

type Membership = {
  group_id: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
}

export async function VectorTopbar() {
  const supabase = createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const [
    { data: profile },
    { data: memberships },
    { data: game },
    { data: appRole },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('nickname')
      .eq('id', user.id)
      .maybeSingle(),

    supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', user.id),

    supabase
      .from('game_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('game_code', 'STAR_CITIZEN')
      .eq('verification_status', 'VERIFIED')
      .maybeSingle(),

    supabase.rpc('get_my_app_role'),
  ])

  const membership = ((memberships ?? []) as Membership[])[0]

  let groupName: string | undefined

  if (membership) {
    const { data: group } = await supabase
      .from('groups')
      .select('name')
      .eq('id', membership.group_id)
      .is('archived_at', null)
      .maybeSingle()

    groupName = group?.name
  }

  const nickname =
    profile?.nickname ??
    user.email ??
    'VECTOR Account'

  return (
    <header className="vector-topbar">
      <div className="vector-topbar__context">
        <div>
          <span>CREW</span>
          <strong>{groupName ?? 'Kein Crew Context'}</strong>
        </div>

        <div>
          <span>DATASET</span>
          <strong className="vector-topbar__live">
            ● LIVE
          </strong>
        </div>

        <div>
          <span>PTU</span>
          <strong className="vector-topbar__preview">
            PREVIEW SPÄTER
          </strong>
        </div>
      </div>

      <AccountDrawer
        nickname={nickname}
        groupName={groupName}
        groupRole={membership?.role}
        isAdmin={(appRole as AppRole) === 'SYSTEM_ADMIN'}
        rsiLinked={Boolean(game)}
      />
    </header>
  )
}
