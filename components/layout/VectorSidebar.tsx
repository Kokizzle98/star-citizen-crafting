'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BRAND, NAVIGATION } from '@/components/layout/navigation'

export function VectorSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const pathname = usePathname()

  return (
    <aside
      className="vector-sidebar"
      aria-label="VECTOR Navigation"
    >
      <div className="vector-sidebar__brand">
        <Link href="/vector" aria-label={`${BRAND.name} Dashboard`}>
          <strong>{BRAND.name}</strong>
          <span>{BRAND.tagline}</span>
        </Link>

        <button
          className="vector-sidebar__toggle"
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="vector-sidebar__nav" aria-label="Module">
        {NAVIGATION.map((item) => {
          const content = (
            <>
              <span className="vector-sidebar__number" aria-hidden="true">
                {item.number}
              </span>
              <span className="vector-sidebar__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="vector-sidebar__label">
                {item.label}
              </span>
              {item.soon && (
                <span className="vector-sidebar__soon">BALD</span>
              )}
            </>
          )

          if (item.soon || item.href === null) {
            return (
              <span
                className="vector-sidebar__future"
                key={item.label}
                aria-disabled="true"
              >
                {content}
              </span>
            )
          }

          // Dashboard matches exactly; every other area is active on its sub-routes too.
          const active = item.href === '/vector'
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              href={item.href}
              key={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              {content}
            </Link>
          )
        })}
      </nav>

      <div className="vector-sidebar__footer">
        <span className="vector-sidebar__label">
          USABLE ALPHA
        </span>
      </div>
    </aside>
  )
}
