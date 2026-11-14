'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useKeySet } from '@/components/layout/useKeySet'

const PAGES = ['/vector/inventory', '/vector/inventory/crew'] as const

// Switch between the two inventory pages (INVENTORY_UX_V1_1 section 2).
// Keys Q / E (section 13.1): Q = Mein Inventory, E = Crew Inventory.
export function InventorySwitch({ active }: { active: 'own' | 'crew' }) {
  const router = useRouter()
  useKeySet((event) => {
    if (event.type !== 'action') return false
    if (event.action.type !== 'view-prev' && event.action.type !== 'view-next') return false
    const target = PAGES[event.action.type === 'view-prev' ? 0 : 1]
    if (target !== PAGES[active === 'own' ? 0 : 1]) router.push(target)
    return true
  })

  return (
    <nav className="inventory-switch" aria-label="Inventory-Seiten">
      <Link href="/vector/inventory" aria-current={active === 'own' ? 'page' : undefined}>Mein Inventory</Link>
      <Link href="/vector/inventory/crew" aria-current={active === 'crew' ? 'page' : undefined}>Crew Inventory</Link>
    </nav>
  )
}
