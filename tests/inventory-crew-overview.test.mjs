import assert from 'node:assert/strict'
import test from 'node:test'
import { loadLibModule, readText } from './fabricator-fixture.mjs'

// UX-4 (INVENTORY_UX_V1_1 sections 2, 8.3, 9, 16, 18): crew overview derived
// from the rows only. No player level in the tree, display only.

const overview = await loadLibModule('lib/inventory/inventory-crew-overview')

const row = (id, material, microScu, quality, extra = {}) => ({
  inventory_id: String(id), owner_user_id: 'u1', player_name: 'Kokizzle', material,
  amount: String(microScu / 1_000_000), amount_micro_scu: String(microScu), input_unit: 'SCU',
  quality, location_id: 'loc-a', location_name: 'Lorville',
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...extra,
})
const piece = (id, material, amount, quality, extra = {}) => ({ ...row(id, material, 1, quality, extra), amount: String(amount) })
const units = { Copper: 'volume', Iron: 'volume', Gold: 'volume', Pistol: 'count' }
const tierCount = (distribution, id) => distribution.tiers.find(entry => entry.tier.id === id).materials

test('player count per material: distinct owners, one owner counts once', () => {
  const two = [row(1, 'Copper', 1, 900, { owner_user_id: 'u1' }), row(2, 'Copper', 1, 800, { owner_user_id: 'u2', player_name: 'Anna' })]
  assert.equal(overview.materialPlayerCount(two), 2)
  const one = [row(1, 'Copper', 1, 900), row(2, 'Copper', 1, 800, { location_id: 'loc-b' })]
  assert.equal(overview.materialPlayerCount(one), 1)
  assert.equal(overview.playerCountLabel(1), '1 Spieler')
  assert.equal(overview.playerCountLabel(2), '2 Spieler')
})

test('player count counts owners by id, not by name', () => {
  const rows = [row(1, 'Copper', 1, 900, { owner_user_id: 'u1', player_name: 'Max' }), row(2, 'Copper', 1, 900, { owner_user_id: 'u2', player_name: 'Max' })]
  assert.equal(overview.materialPlayerCount(rows), 2)
})

test('quality distribution counts a material once, in the tier of its rounded average', () => {
  const rows = [
    // Copper: 2 lots, average 600 -> STANDARD (still one material)
    row(1, 'Copper', 1_000_000, 900), row(2, 'Copper', 3_000_000, 500),
    // Iron: 499.5 rounds to 500 -> STANDARD, not SCRAP
    row(3, 'Iron', 1, 500), row(4, 'Iron', 1, 499),
    // Gold: Q1000 -> PERFECT
    row(5, 'Gold', 1_000_000, 1000),
  ]
  const distribution = overview.qualityDistribution(rows, units)
  assert.equal(tierCount(distribution, 'STANDARD'), 2)
  assert.equal(tierCount(distribution, 'PERFECT'), 1)
  assert.equal(tierCount(distribution, 'SCRAP'), 0)
  assert.equal(distribution.counted, 3)
  assert.deepEqual(distribution.tiers.map(entry => entry.tier.id), ['SCRAP', 'STANDARD', 'BULK', 'PRODUCTION', 'PRIME', 'PERFECT'])
})

test('quality distribution leaves out COUNT and unknown-unit materials and says so', () => {
  const rows = [row(1, 'Copper', 1_000_000, 900), piece(2, 'Pistol', 2, 100), row(3, 'Mystery', 1_000_000, 100)]
  const distribution = overview.qualityDistribution(rows, units)
  assert.equal(distribution.counted, 1)
  assert.equal(distribution.countMaterials, 1)
  assert.equal(distribution.unknownUnitMaterials, 1)
  assert.equal(distribution.tiers.reduce((sum, entry) => sum + entry.materials, 0), 1)
  assert.equal(tierCount(distribution, 'SCRAP'), 0, 'low-quality piece / unknown lots do not leak into a tier')
})

test('player overview groups by owner_user_id: same name stays two entries', () => {
  const rows = [
    row(1, 'Copper', 1, 900, { owner_user_id: 'u1', player_name: 'Max' }),
    row(2, 'Iron', 1, 900, { owner_user_id: 'u1', player_name: 'Max' }),
    row(3, 'Iron', 1, 900, { owner_user_id: 'u1', player_name: 'Max', location_id: 'loc-b' }),
    row(4, 'Copper', 1, 900, { owner_user_id: 'u2', player_name: 'Max' }),
  ]
  const players = overview.playerOverview(rows)
  assert.equal(players.length, 2)
  assert.deepEqual(players.map(p => [p.ownerUserId, p.playerName, p.lots, p.materials]), [['u1', 'Max', 3, 2], ['u2', 'Max', 1, 1]])
})

test('empty input gives empty results, nothing is invented', () => {
  assert.equal(overview.materialPlayerCount([]), 0)
  assert.deepEqual(overview.playerOverview([]), [])
  const distribution = overview.qualityDistribution([], units)
  assert.equal(distribution.counted, 0)
  assert.equal(distribution.tiers.length, 6)
  assert.ok(distribution.tiers.every(entry => entry.materials === 0))
})

const code = source => source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const view = code(await readText('components/inventory/InventoryView.tsx'))
const component = code(await readText('components/inventory/InventoryCrewOverview.tsx'))

test('crew page shows overview and player count; Mein Inventory shows neither', () => {
  assert.match(view, /crewViewerUserId !== undefined && <InventoryCrewOverview rows=\{visibleRows\} units=\{units\} \/>/)
  assert.match(view, /showPlayers=\{crewViewerUserId !== undefined\}/)
  assert.match(view, /showPlayers = false/, 'default is off, so Mein Inventory is unchanged')
  assert.match(view, /showPlayers && <span>\{playerCountLabel\(materialPlayerCount\(rows\)\)\}<\/span>/)
  // order in the material row: quantity, average, range, players, lots
  const summary = view.slice(view.indexOf('function Summary'), view.indexOf('function Group'))
  const order = ['<strong>', '<abbr', 'quality={range.min}', 'showPlayers &&', "'Lot'"].map(token => summary.indexOf(token))
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), 'Menge, Ø, Spanne, Spieler, Lots')
  // location rows (level 2 of LOCATION) do not get a player count
  assert.match(view, /summary=\{<Summary rows=\{locationRows\} units=\{units\} mode=\{mode\} \/>\}/)
})

test('overview sits between the key figure strip and the filters, with its own label', () => {
  assert.ok(view.indexOf('<InventoryKpiStrip') < view.indexOf('<InventoryCrewOverview'))
  assert.ok(view.indexOf('<InventoryCrewOverview') < view.indexOf('id="inventory-search"'))
  assert.match(component, /aria-label="Crew-Überblick"/)
})

test('overview is display only: no controls, no filter effect, no write code', () => {
  assert.doesNotMatch(component, /<button|<input|<select|<a |Link|onClick|onChange|useState|inventory-write|inventory-update-write|inventory-delete-write|submitInventory/)
  assert.doesNotMatch(component, /materialAverageQuality|weightedQuality/, 'no overall average across materials')
})

test('tree structure unchanged: still no player level', () => {
  assert.doesNotMatch(view, /groupBy\(entries, \(row\) => row\.owner_user_id\)|G:p:|L:p:/)
  assert.match(view, /id=\{`G:m:/)
  assert.match(view, /`L:l:\$\{materialRows\[0\]\.material\}\|\$\{locationRows\[0\]\.location_id\}`/)
})

test('Crew page still has no write controls', async () => {
  const crew = code(await readText('app/vector/inventory/crew/page.tsx'))
  assert.doesNotMatch(crew, /AddInventoryLotForm|inventory-write|inventory-update-write|inventory-delete-write/)
  assert.match(crew, /currentUserId=\{null\}/)
})
