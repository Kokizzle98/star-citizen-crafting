import { requireSystemAdmin } from '@/lib/auth/authorization'
import { AdminMenu } from '@/components/account/AdminMenu'
export default async function Layout({children}:{children:React.ReactNode}){await requireSystemAdmin();return <div><AdminMenu/><section>{children}</section></div>}
