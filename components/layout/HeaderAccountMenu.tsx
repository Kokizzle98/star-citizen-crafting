import { requireUser, getMyAppRole } from '@/lib/auth/authorization'
import { UserMenu } from '@/components/account/UserMenu'
export async function HeaderAccountMenu() {
 const {supabase,user}=await requireUser()
 const [{data:profile},{data:game},role]=await Promise.all([
  supabase.from('profiles').select('nickname').eq('id',user.id).single(),
  supabase.from('game_accounts').select('id').eq('user_id',user.id).eq('game_code','STAR_CITIZEN').eq('verification_status','VERIFIED').maybeSingle(),
  getMyAppRole(),
 ])
 return <UserMenu nickname={profile?.nickname??'Account'} isAdmin={role==='SYSTEM_ADMIN'} rsiLinked={!!game}/>
}
