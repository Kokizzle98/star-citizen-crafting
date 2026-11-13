import Link from 'next/link'

// Switch between the two inventory pages (INVENTORY_UX_V1_1 section 2).
export function InventorySwitch({ active }: { active: 'own' | 'crew' }) {
  return (
    <nav className="inventory-switch" aria-label="Inventory-Seiten">
      <Link href="/vector/inventory" aria-current={active === 'own' ? 'page' : undefined}>Mein Inventory</Link>
      <Link href="/vector/inventory/crew" aria-current={active === 'crew' ? 'page' : undefined}>Crew Inventory</Link>
    </nav>
  )
}
