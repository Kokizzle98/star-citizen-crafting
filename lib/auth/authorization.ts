import 'server-only'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function requireUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}
export async function getMyAppRole() {
  const { supabase } = await requireUser()
  const { data, error } = await supabase.rpc('get_my_app_role')
  if (error) throw error
  return data as 'USER' | 'ONTOLOGY_ADMIN' | 'SYSTEM_ADMIN'
}
export async function requireSystemAdmin() {
  const role = await getMyAppRole()
  if (role !== 'SYSTEM_ADMIN') redirect('/?error=admin_required')
}
