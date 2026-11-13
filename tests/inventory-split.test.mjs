import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// File-based contract tests for UX-3a (INVENTORY_UX_V1_1 sections 2, 3, 16).
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [own, crew, sw, view, sidebar] = await Promise.all([
  read('app/vector/inventory/page.tsx'),
  read('app/vector/inventory/crew/page.tsx'),
  read('components/inventory/InventorySwitch.tsx'),
  read('components/inventory/InventoryView.tsx'),
  read('components/layout/VectorSidebar.tsx'),
])
const code = source => source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('Mein Inventory filters to the signed-in user and keeps the write controls', () => {
  const src = code(own)
  assert.match(src, /row\.owner_user_id === currentUserId/)
  assert.match(src, /<AddInventoryLotForm/)
  assert.match(src, /currentUserId=\{currentUserId\}/)
  assert.match(src, /<h1>Mein Inventory<\/h1>/)
  assert.match(src, /label="Mein Inventory"/)
  assert.match(src, /Du hast noch kein Material im Inventory\. Lege mit „Lot hinzufügen“ das erste an\./)
  assert.match(src, /<InventorySwitch active="own"/)
})

test('Crew Inventory is read-only: no Quick Add, no editing, no deleting', () => {
  const src = code(crew)
  assert.doesNotMatch(src, /AddInventoryLotForm/)
  assert.doesNotMatch(src, /EditInventoryLotForm|submitInventoryLot|inventory-write|inventory-update-write|inventory-delete-write/)
  assert.match(src, /currentUserId=\{null\}/)
  assert.match(src, /locations=\{null\}/)
  assert.match(src, /<h1>Crew Inventory<\/h1>/)
  assert.match(src, /label="Crew Inventory"/)
  assert.match(src, /<InventorySwitch active="crew"/)
  assert.doesNotMatch(src, /rows\.filter/, 'all crew lots are shown')
})

test('write controls in the view only exist for the current user, never for null', () => {
  const src = code(view)
  assert.match(src, /const canEdit = editing\.currentUserId !== null && row\.owner_user_id === editing\.currentUserId/)
  assert.match(src, /const canDelete = editing\.currentUserId !== null && row\.owner_user_id === editing\.currentUserId/)
  assert.match(src, /Nur ansehen/)
  assert.match(src, /In Mein Inventory bearbeiten/)
  assert.match(src, /crewViewerUserId !== undefined/)
  assert.match(src, /aria-label=\{label\}/)
  assert.doesNotMatch(src, /aria-label="Crew Inventory"/)
})

test('switch has two links and marks the active page', () => {
  assert.match(sw, /href="\/vector\/inventory" aria-current=\{active === 'own' \? 'page' : undefined\}>Mein Inventory</)
  assert.match(sw, /href="\/vector\/inventory\/crew" aria-current=\{active === 'crew' \? 'page' : undefined\}>Crew Inventory</)
})

test('sidebar: Inventory is active on both routes, Dashboard stays exact', () => {
  assert.match(sidebar, /item\.href === '\/vector'\s*\?\s*pathname === item\.href\s*:\s*pathname === item\.href \|\| pathname\.startsWith\(`\$\{item\.href\}\/`\)/)
  // Same logic as in the sidebar, evaluated.
  const active = (pathname, href) => href === '/vector' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  assert.ok(active('/vector/inventory', '/vector/inventory'))
  assert.ok(active('/vector/inventory/crew', '/vector/inventory'))
  assert.ok(!active('/vector/inventory/crew', '/vector'))
  assert.ok(!active('/vector/inventory', '/vector'))
  assert.ok(active('/vector', '/vector'))
  assert.ok(!active('/vector/inventory-x', '/vector/inventory'))
})
