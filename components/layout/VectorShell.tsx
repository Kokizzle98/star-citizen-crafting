'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { VectorSidebar } from '@/components/layout/VectorSidebar'
import { UnitPreference } from '@/components/layout/UnitPreference'
import { NAVIGATION } from '@/components/layout/navigation'
import { useKeySet } from '@/components/layout/useKeySet'
import { routeForDigit } from '@/lib/keyboard/key-set'

export function VectorShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const publicSurface =
    pathname === '/login' ||
    pathname.startsWith('/auth/')

  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem('vector.sidebar.collapsed') === 'true',
    )
  }, [])

  // Keys 1 to 6 jump to the area at that position in NAVIGATION (section 13.1).
  // Entries that are not built yet ignore their key.
  useKeySet((event) => {
    if (event.type !== 'action' || event.action.type !== 'goto') return false
    const href = routeForDigit(event.action.digit, NAVIGATION)
    if (href === null) return false
    if (href !== pathname) router.push(href)
    return true
  }, !publicSurface)

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current

      window.localStorage.setItem(
        'vector.sidebar.collapsed',
        String(next),
      )

      return next
    })
  }

  if (publicSurface) {
    return <>{children}</>
  }

  return (
    <UnitPreference>
    <div
      className="vector-shell"
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
    >
      <VectorSidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />

      <div className="vector-shell__workspace">
        {children}
      </div>
    </div>
    </UnitPreference>
  )
}
