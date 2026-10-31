'use client'

import Link from 'next/link'

const primaryNavigation = [
  { href: '/vector', icon: '⌂', label: 'Dashboard' },
  { href: '/inventory', icon: '▤', label: 'Inventory' },
  { href: '/fabricator', icon: '◇', label: 'Fabricator' },
  { href: '/blueprints', icon: '▱', label: 'Blueprints' },
]

const futureNavigation = [
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
          aria-label={
            collapsed
              ? 'Navigation ausklappen'
              : 'Navigation einklappen'
          }
          aria-pressed={collapsed}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="vector-sidebar__nav" aria-label="Module">
        {primaryNavigation.map((item) => (
          <Link href={item.href} key={item.href}>
            <span className="vector-sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="vector-sidebar__label">
              {item.label}
            </span>
          </Link>
        ))}

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
