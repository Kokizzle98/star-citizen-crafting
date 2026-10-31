import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER'

type Membership = {
  group_id: string
  role: GroupRole
}

type Group = {
  id: string
  name: string
}

export type AvailableGroup = {
  id: string
  name: string
  role: GroupRole
}

export type CrewContext = {
  activeGroupId: string | null
  activeGroup: AvailableGroup | null
  availableGroups: AvailableGroup[]
}

const noCrewContext: CrewContext = {
  activeGroupId: null,
  activeGroup: null,
  availableGroups: [],
}

export async function getCrewContext(
  userId: string,
): Promise<CrewContext> {
  const supabase = createSupabaseServerClient()

  const [
    { data: settings, error: settingsError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabase
      .from('user_settings')
      .select('active_group_id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .order('group_id', { ascending: true }),
  ])

  if (settingsError || membershipsError || !memberships?.length) {
    return noCrewContext
  }

  const typedMemberships = memberships as Membership[]
  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, name')
    .in(
      'id',
      typedMemberships.map((membership) => membership.group_id),
    )
    .is('archived_at', null)

  if (groupsError || !groups?.length) {
    return noCrewContext
  }

  const activeGroups = new Map(
    (groups as Group[]).map((group) => [group.id, group.name]),
  )

  const availableGroups = typedMemberships.flatMap((membership) => {
    const name = activeGroups.get(membership.group_id)

    return name
      ? [{
          id: membership.group_id,
          name,
          role: membership.role,
        }]
      : []
  })

  if (!availableGroups.length) {
    return noCrewContext
  }

  const activeGroup =
    availableGroups.find(
      (group) => group.id === settings?.active_group_id,
    ) ?? availableGroups[0]

  return {
    activeGroupId: activeGroup.id,
    activeGroup,
    availableGroups,
  }
}
