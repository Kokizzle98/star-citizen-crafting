'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function setActiveCrew(groupId: unknown): Promise<{ error?: string }> {
  if (
    typeof groupId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)
  ) {
    return { error: 'Die Crew-Auswahl ist ungültig.' }
  }

  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Bitte melde dich erneut an, um die Crew zu wechseln.' }
  }

  const { error } = await supabase.rpc('set_active_group', { p_group_id: groupId })

  if (error) {
    return { error: 'Die Crew konnte nicht gewechselt werden. Bitte versuche es erneut.' }
  }

  return {}
}
