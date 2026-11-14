import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../lib/inventory/inventory-search-filter-sort.ts', import.meta.url),
  'utf8',
)

const transpiled = ts.transpileModule(source.replace(/^import .*$/gm, ''), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const module = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
)

const { filterInventoryRows, sortInventoryRows } = module

const rows = [
  {
    inventory_id: '10',
    owner_user_id: 'user-a',
    player_name: 'Kokizzle98',
    material: 'Copper',
    amount: '1.000000',
    amount_micro_scu: '1000000',
    input_unit: 'SCU',
    quality: 500,
    location_id: 'loc-a',
    location_name: 'Area18',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-03T10:00:00Z',
  },
  {
    inventory_id: '2',
    owner_user_id: 'user-b',
    player_name: 'AccaliaAyame',
    material: 'Aluminum',
    amount: '2.000000',
    amount_micro_scu: '2000000',
    input_unit: 'SCU',
    quality: 900,
    location_id: 'loc-b',
    location_name: 'Levski',
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-04T10:00:00Z',
  },
  {
    inventory_id: '7',
    owner_user_id: 'user-a',
    player_name: 'Kokizzle98',
    material: 'Copper',
    amount: '3.000000',
    amount_micro_scu: '3000000',
    input_unit: 'SCU',
    quality: 250,
    location_id: 'loc-b',
    location_name: 'Levski',
    created_at: '2026-11-03T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
  },
]

const filters = {
  query: '',
  player: '',
  locationId: '',
  qualityMin: null,
  qualityMax: null,
}

test('search matches material, player and location case-insensitively', () => {
  assert.deepEqual(
    filterInventoryRows(rows, { ...filters, query: 'cOpPeR' }).map(row => row.inventory_id),
    ['10', '7'],
  )
  assert.deepEqual(
    filterInventoryRows(rows, { ...filters, query: 'accalia' }).map(row => row.inventory_id),
    ['2'],
  )
  assert.deepEqual(
    filterInventoryRows(rows, { ...filters, query: 'levski' }).map(row => row.inventory_id),
    ['2', '7'],
  )
})

test('player, location and inclusive quality filters compose', () => {
  assert.deepEqual(
    filterInventoryRows(rows, {
      ...filters,
      player: 'Kokizzle98',
      locationId: 'loc-b',
      qualityMin: 250,
      qualityMax: 250,
    }).map(row => row.inventory_id),
    ['7'],
  )
})

test('sort modes are deterministic and do not mutate input rows', () => {
  const original = rows.map(row => row.inventory_id)

  assert.deepEqual(sortInventoryRows(rows, 'MATERIAL_ASC').map(row => row.inventory_id), ['2', '7', '10'])
  assert.deepEqual(sortInventoryRows(rows, 'MATERIAL_DESC').map(row => row.inventory_id), ['7', '10', '2'])
  assert.deepEqual(sortInventoryRows(rows, 'LOCATION_ASC').map(row => row.inventory_id), ['10', '2', '7'])
  assert.deepEqual(sortInventoryRows(rows, 'LOCATION_DESC').map(row => row.inventory_id), ['2', '7', '10'])
  assert.deepEqual(sortInventoryRows(rows, 'QUALITY_ASC').map(row => row.inventory_id), ['7', '10', '2'])
  assert.deepEqual(sortInventoryRows(rows, 'QUALITY_DESC').map(row => row.inventory_id), ['2', '10', '7'])
  assert.deepEqual(sortInventoryRows(rows, 'UPDATED_DESC').map(row => row.inventory_id), ['2', '10', '7'])
  assert.deepEqual(sortInventoryRows(rows, 'UPDATED_ASC').map(row => row.inventory_id), ['7', '10', '2'])

  assert.deepEqual(rows.map(row => row.inventory_id), original)
})

const view = await readFile(
  new URL('../components/inventory/InventoryView.tsx', import.meta.url),
  'utf8',
)

test('Inventory UI exposes accessible search filter sort controls and result feedback', () => {
  assert.match(view, /type="search"/)
  assert.match(view, /htmlFor="inventory-search"/)
  assert.match(view, /htmlFor="inventory-player-filter"/)
  assert.match(view, /htmlFor="inventory-location-filter"/)
  assert.match(view, /htmlFor="inventory-quality-min"/)
  assert.match(view, /htmlFor="inventory-quality-max"/)
  assert.match(view, /htmlFor="inventory-sort"/)
  assert.match(view, /Filter zurücksetzen/)
  assert.match(view, /role="status"/)
  assert.match(view, /visibleRows\.length/)
})

test('Inventory UI filters before grouping in both views', () => {
  assert.match(view, /materials\(visibleRows\)/)
  assert.match(view, /locations\(materialRows\)/) // UX-3b: Material -> Ort -> Lots, locations group inside the filtered material rows
  assert.match(view, /filterInventoryRows\(rows/)
  assert.match(view, /sortInventoryRows\(filterInventoryRows/)
})

test('Inventory UI keeps edit delete ownership and focus contracts intact', () => {
  assert.match(view, /row\.owner_user_id === editing\.currentUserId/)
  assert.match(view, /restoreEditFocusId/)
  assert.match(view, /restoreDeleteFocusId/)
  assert.match(view, /editing\.confirmDelete\(row\.inventory_id\)/)
})
