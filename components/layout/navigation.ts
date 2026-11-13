// Main navigation: the ONE place for order, numbers and availability.
//
// The order follows INVENTORY_UX_V1_1 section 13.1 (1 Dashboard, 2 Inventory,
// 3 Blueprints, 4 Fabricator, 5 Fleet, 6 Trading). Changing it requires an
// amendment of that document. The numbers are display only; key handling is a
// later work package. Entries with `soon: true` are not built yet: they are
// shown with "BALD", are not links and cannot be focused.

export type NavigationItem = {
  number: string
  label: string
  icon: string
  /** Route; `null` for entries that are not built yet. */
  href: string | null
  soon: boolean
}

export const NAVIGATION: readonly NavigationItem[] = [
  { number: '01', label: 'Dashboard', icon: '⌂', href: '/vector', soon: false },
  { number: '02', label: 'Inventory', icon: '▤', href: '/vector/inventory', soon: false },
  { number: '03', label: 'Blueprints', icon: '▱', href: '/vector/blueprints', soon: false },
  { number: '04', label: 'Fabricator', icon: '◇', href: '/vector/fabricator', soon: false },
  { number: '05', label: 'Fleet', icon: '△', href: null, soon: true },
  { number: '06', label: 'Trading', icon: '↔', href: null, soon: true },
]

export const BRAND = { name: 'VECTOR', tagline: 'Group Terminal by Kokizzle98' } as const

export const FAN_PROJECT_NOTICE =
  'Inoffizielles Fan-Projekt, nicht mit Cloud Imperium Games verbunden.'
