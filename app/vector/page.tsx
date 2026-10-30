import { requireUser } from '@/lib/auth/authorization'

export const metadata = {
  title: 'Systemzugang',
}

type GroupMembership = {
  group_id: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  joined_at: string
}

type Group = {
  id: string
  name: string
  description: string | null
}

export default async function VectorPage() {
  const { supabase, user } = await requireUser()

  const [
    { data: profile, error: profileError },
    { data: memberships, error: membershipError },
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
      .order('joined_at', { ascending: true }),
  ])

  if (profileError) {
    throw profileError
  }

  if (membershipError) {
    throw membershipError
  }

  const typedMemberships = (memberships ?? []) as GroupMembership[]
  const groupIds = typedMemberships.map(
    (membership) => membership.group_id,
  )

  let groups: Group[] = []

  if (groupIds.length > 0) {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, description')
      .in('id', groupIds)
      .is('archived_at', null)
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    groups = (data ?? []) as Group[]
  }

  const groupsById = new Map(
    groups.map((group) => [group.id, group]),
  )

  const groupContexts = typedMemberships.flatMap((membership) => {
    const group = groupsById.get(membership.group_id)

    return group
      ? [
          {
            ...group,
            role: membership.role,
          },
        ]
      : []
  })

  const displayName =
    profile?.nickname ??
    user.email ??
    'VECTOR Account'

  return (
    <>
      <section
        className="hero"
        aria-labelledby="vector-access-title"
      >
        <p className="eyebrow">
          USABLE ALPHA · WP1 GROUP CONTEXT
        </p>

        <h1 id="vector-access-title">Zugang bestätigt</h1>

        <p>Willkommen bei VECTOR, {displayName}.</p>
      </section>

      <section
        className="vector-access-grid"
        aria-label="VECTOR Zugangsstatus"
      >
        <article className="card">
          <span className="status vector-status--ready">
            AUTHENTICATED
          </span>

          <h2>Account</h2>

          <p>Die E-Mail- und Passwortsession ist aktiv.</p>
        </article>

        <article className="card">
          <span
            className={
              groupContexts.length > 0
                ? 'status vector-status--ready'
                : 'status'
            }
          >
            {groupContexts.length > 0
              ? 'CONNECTED'
              : 'NO GROUP'}
          </span>

          <h2>Group Context</h2>

          {groupContexts.length > 0 ? (
            <div className="vector-group-list">
              {groupContexts.map((group) => (
                <section
                  className="vector-group-context"
                  key={group.id}
                  aria-label={`${group.name}, Rolle ${group.role}`}
                >
                  <strong>{group.name}</strong>

                  <span className="vector-group-context__role">
                    {displayName} · {group.role}
                  </span>

                  {group.description ? (
                    <p>{group.description}</p>
                  ) : null}
                </section>
              ))}
            </div>
          ) : (
            <p>
              Für diesen VECTOR-Account wurde kein aktiver
              Gruppenkontext gefunden.
            </p>
          )}
        </article>
      </section>
    </>
  )
}
