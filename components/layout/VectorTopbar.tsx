import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AccountDrawer } from '@/components/account/AccountDrawer'

type AppRole = 'USER' | 'ONTOLOGY_ADMIN' | 'SYSTEM_ADMIN'

type Membership = {
  group_id: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  joined_at: string
}

export async function VectorTopbar() {
  const supabase = createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <header className="vector-topbar vector-topbar--anonymous">
        <Link className="vector-topbar__login" href="/login">
          Anmelden
        </Link>
      </header>
    )
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
      .select('group_id, role, joined_at')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
      .order('group_id', { ascending: true }),

    supabase
      .from('game_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('game_code', 'STAR_CITIZEN')
      .eq('verification_status', 'VERIFIED')
      .maybeSingle(),

    supabase.rpc('get_my_app_role'),
  ])

  const allMemberships = (memberships ?? []) as Membership[]

  let membership: Membership | undefined
  let groupName: string | undefined

  if (allMemberships.length > 0) {
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name')
      .in(
        'id',
        allMemberships.map((item) => item.group_id),
      )
      .is('archived_at', null)

    const activeGroups = new Map(
      (groups ?? []).map(
        (group: { id: string; name: string }) => [group.id, group.name],
      ),
    )

    membership = allMemberships.find((item) =>
      activeGroups.has(item.group_id),
    )

    groupName = membership
      ? activeGroups.get(membership.group_id)
      : undefined
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

        <div className="vector-topbar__compact">
          <span>DATASET</span>
          <div className="vector-topbar__compact-values">
            <strong className="vector-topbar__live">● LIVE</strong>
            <strong className="vector-topbar__preview">PTU</strong>
          </div>
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
