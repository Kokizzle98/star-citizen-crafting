'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const primaryNavigation = [
  { href: '/vector', icon: '⌂', label: 'Dashboard' },
]

const futureNavigation = [
  { icon: '▤', label: 'Inventory' },
  { icon: '◇', label: 'Fabricator' },
  { icon: '▱', label: 'Blueprints' },
  { icon: '△', label: 'Fleet' },
  { icon: '↔', label: 'Trading' },
]

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
        <Link href="/vector" aria-label="VECTOR Dashboard">
          <strong>VECTOR</strong>
          <span>GROUP SYSTEM</span>
        </Link>

        <button
          className="vector-sidebar__toggle"
          type="button"
          onClick={onToggle}
          aria-label="Navigation"
          aria-expanded={!collapsed}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="vector-sidebar__nav" aria-label="Module">
        {primaryNavigation.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`)

          return (
            <Link
              href={item.href}
              key={item.href}
              aria-current={active ? 'page' : undefined}
            >
              <span className="vector-sidebar__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="vector-sidebar__label">
                {item.label}
              </span>
            </Link>
          )
        })}

        <div className="vector-sidebar__divider" />

        {futureNavigation.map((item) => (
          <span
            className="vector-sidebar__future"
            key={item.label}
            aria-disabled="true"
          >
            <span className="vector-sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="vector-sidebar__label">
              {item.label}
            </span>
          </span>
        ))}
      </nav>

      <div className="vector-sidebar__footer">
        <span className="vector-sidebar__label">
          USABLE ALPHA
        </span>
      </div>
    </aside>
  )
}
