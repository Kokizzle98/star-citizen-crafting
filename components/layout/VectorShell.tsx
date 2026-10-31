'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { VectorSidebar } from '@/components/layout/VectorSidebar'

export function VectorShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const publicSurface =
    pathname === '/login' ||
    pathname.startsWith('/auth/')

  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem('vector.sidebar.collapsed') === 'true',
    )
  }, [])

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
  )
}
