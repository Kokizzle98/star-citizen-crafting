import { VectorShellClient } from '@/components/layout/VectorShellClient'
import { getLayoutUser } from '@/components/layout/layout-user'

// Server wrapper: tells the client shell whether anybody is signed in, so
// visitors get a visitor sidebar. The login protection itself is unchanged
// (requireUser in the pages); this only decides what is shown.
export async function VectorShell({ children }: { children: React.ReactNode }) {
  const user = await getLayoutUser()
  return <VectorShellClient signedIn={user !== null}>{children}</VectorShellClient>
}
