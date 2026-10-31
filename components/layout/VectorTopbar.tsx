import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AccountDrawer } from '@/components/account/AccountDrawer'
import { getCrewContext } from '@/lib/groups/crew-context'

type AppRole = 'USER' | 'ONTOLOGY_ADMIN' | 'SYSTEM_ADMIN'

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
    { data: game },
    { data: appRole },
    crewContext,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('nickname')
      .eq('id', user.id)
      .maybeSingle(),

    supabase
      .from('game_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('game_code', 'STAR_CITIZEN')
      .eq('verification_status', 'VERIFIED')
      .maybeSingle(),

    supabase.rpc('get_my_app_role'),
    getCrewContext(user.id),
  ])

  const activeGroup = crewContext.activeGroup

  const nickname =
    profile?.nickname ??
    user.email ??
    'VECTOR Account'

  return (
    <header className="vector-topbar">
      <div className="vector-topbar__context">
        <button
          type="button"
          className="vector-topbar__control"
          aria-disabled="true"
          aria-label={`Crew: ${activeGroup?.name ?? 'Kein Crew Context'}. Crew-Auswahl folgt später.`}
          title="Crew-Auswahl folgt in einer späteren Version"
        >
          <span className="vector-topbar__control-text">
            <span>CREW</span>
            <strong>{activeGroup?.name ?? 'Kein Crew Context'}</strong>
          </span>
          <span aria-hidden="true">▾</span>
        </button>

        <button
          type="button"
          className="vector-topbar__control"
          aria-disabled="true"
          aria-label="Dataset: LIVE. Dataset-Auswahl folgt später."
          title="Dataset-Auswahl (LIVE/PTU) folgt in einer späteren Version"
        >
          <span className="vector-topbar__control-text">
            <span>DATASET</span>
            <strong className="vector-topbar__live">● LIVE</strong>
          </span>
          <span aria-hidden="true">▾</span>
        </button>
      </div>

      <AccountDrawer
        nickname={nickname}
        groupName={activeGroup?.name}
        groupRole={activeGroup?.role}
        isAdmin={(appRole as AppRole) === 'SYSTEM_ADMIN'}
        rsiLinked={Boolean(game)}
      />
    </header>
  )
}
