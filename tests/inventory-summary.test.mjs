import assert from 'node:assert/strict'
import test from 'node:test'
import { loadLibModule, readText } from './fabricator-fixture.mjs'

// UX-3b (INVENTORY_UX_V1_1 sections 5, 5.1, 8.3, 9, 18): material rows with
// average and range, depth indicator, key figure strip, two-level GLOBAL.

const summary = await loadLibModule('lib/inventory/inventory-summary')
const display = await loadLibModule('lib/inventory/inventory-display')
const tiers = await loadLibModule('lib/quality/tiers')

const row = (id, material, microScu, quality, extra = {}) => ({
  inventory_id: String(id), owner_user_id: 'u1', player_name: 'Kokizzle', material,
  amount: String(microScu / 1_000_000), amount_micro_scu: String(microScu), input_unit: 'SCU',
  quality, location_id: 'loc-a', location_name: 'Lorville',
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...extra,
})
const piece = (id, material, amount, quality, extra = {}) => ({ ...row(id, material, 1, quality, extra), amount: String(amount) })
const units = { Copper: 'volume', Iron: 'volume', Pistol: 'count', Knife: 'count' }

test('average quality is quantity-weighted and rounded half up', () => {
  // 1 SCU Q900 + 3 SCU Q500 -> (900 + 1500) / 4 = 600 (not the plain mean 700)
  const rows = [row(1, 'Copper', 1_000_000, 900), row(2, 'Copper', 3_000_000, 500)]
  assert.equal(summary.materialAverageQuality(rows, 'volume'), 600)
  // 1 : 1 of Q1 and Q0 -> 0.5 -> halves round up to 1 (the Fabricator floor is not used here)
  assert.equal(summary.materialAverageQuality([row(3, 'Copper', 1, 1), row(4, 'Copper', 1, 0)], 'volume'), 1)
  // 999.33 rounds to 999, not to a higher tier
  assert.equal(summary.materialAverageQuality([row(5, 'Copper', 1, 1000), row(6, 'Copper', 2, 999)], 'volume'), 999)
})

test('the tier is taken from the rounded average, so chip number and label agree', () => {
  // 499.5 rounds to 500 -> STANDARD, not SCRAP
  const average = summary.materialAverageQuality([row(1, 'Copper', 1, 500), row(2, 'Copper', 1, 499)], 'volume')
  assert.equal(average, 500)
  assert.equal(tiers.tierFor(average).id, 'STANDARD')
})

test('COUNT is weighted by pieces, VOLUME by micro SCU, unknown unit has no average', () => {
  assert.equal(summary.materialAverageQuality([piece(1, 'Pistol', 1, 1000), piece(2, 'Pistol', 3, 0)], 'count'), 250)
  assert.equal(summary.materialAverageQuality([piece(1, 'Pistol', '0.5', 800), piece(2, 'Pistol', 1.5, 400)], 'count'), 500)
  assert.equal(summary.materialAverageQuality([row(1, 'Mystery', 1_000_000, 900)], undefined), null)
  assert.equal(summary.materialAverageQuality([], 'volume'), null)
})

test('zero total quantity gives no average instead of NaN', () => {
  assert.equal(summary.materialAverageQuality([row(1, 'Copper', 0, 900)], 'volume'), null)
})

test('quality range is the minimum and maximum of the included lots', () => {
  assert.deepEqual(summary.qualityRange([row(1, 'Copper', 1, 700), row(2, 'Copper', 1, 300), row(3, 'Copper', 1, 950)]), { min: 300, max: 950 })
  assert.equal(summary.qualityRange([]), null)
})

test('key figures: distinct materials, volume and count kept apart, lots, newest update', () => {
  const rows = [
    row(1, 'Copper', 1_500_000, 900, { updated_at: '2026-11-10T08:00:00Z' }),
    row(2, 'Copper', 500_000, 700, { updated_at: '2026-11-13T09:30:00Z' }),
    row(3, 'Iron', 250_000, 600),
    piece(4, 'Pistol', 2, 800),
    piece(5, 'Knife', 3, 800),
  ]
  const kpis = summary.inventoryKpis(rows, units)
  assert.equal(kpis.materials, 4)
  assert.equal(kpis.lots, 5)
  assert.equal(kpis.volumeRows.length, 3)
  assert.equal(kpis.countRows.length, 2)
  assert.equal(kpis.unknownUnitLots, 0)
  assert.equal(kpis.latestUpdatedAt, '2026-11-13T09:30:00Z')
  // SCU and pieces are never one sum
  assert.equal(display.formatQuantity(kpis.volumeRows, 'volume', 'SCU'), '2.25 SCU')
  assert.equal(display.formatQuantity(kpis.countRows, 'count', 'SCU'), '5 Stück')
})

test('key figures: empty input and unknown units are not guessed', () => {
  const empty = summary.inventoryKpis([], units)
  assert.deepEqual([empty.materials, empty.lots, empty.volumeRows.length, empty.countRows.length, empty.unknownUnitLots, empty.latestUpdatedAt], [0, 0, 0, 0, 0, null])
  const unknown = summary.inventoryKpis([row(1, 'Mystery', 1_000_000, 500)], units)
  assert.deepEqual([unknown.volumeRows.length, unknown.countRows.length, unknown.unknownUnitLots, unknown.materials], [0, 0, 1, 1])
  // only count lots: no volume lots, the volume figure stays empty
  const onlyCount = summary.inventoryKpis([piece(1, 'Pistol', 1, 500)], units)
  assert.equal(onlyCount.volumeRows.length, 0)
})

test('"Zuletzt geändert": today with time, otherwise the date, Europe/Berlin', () => {
  const now = new Date('2026-11-13T17:44:00Z') // 18:44 in Berlin
  assert.equal(summary.formatLastChanged('2026-11-13T09:30:00Z', now), 'heute, 10:30')
  assert.equal(summary.formatLastChanged('2026-11-12T09:30:00Z', now), '12.11.2026')
  // close to midnight: 23:30Z on the 12th is 00:30 on the 13th in Berlin -> today
  assert.equal(summary.formatLastChanged('2026-11-12T23:30:00Z', now), 'heute, 00:30')
  // 23:30Z on the 13th is already 00:30 on the 14th in Berlin -> a date, not today
  assert.equal(summary.formatLastChanged('2026-11-13T23:30:00Z', now), '14.11.2026')
  // without `now` (server render) it is always the plain date, so no hydration mismatch
  assert.equal(summary.formatLastChanged('2026-11-13T09:30:00Z', null), '13.11.2026')
  assert.equal(summary.formatLastChanged(null, now), '–')
  assert.equal(summary.formatLastChanged('not a date', now), '–')
})

test('depth indicator text per view: deepest expanded level', () => {
  assert.equal(summary.depthLabel('GLOBAL', false, false), 'Ebene 1 von 2')
  assert.equal(summary.depthLabel('GLOBAL', true, false), 'Ebene 2 von 2')
  assert.equal(summary.depthLabel('LOCATION', false, false), 'Ebene 1 von 3')
  assert.equal(summary.depthLabel('LOCATION', true, false), 'Ebene 2 von 3')
  assert.equal(summary.depthLabel('LOCATION', true, true), 'Ebene 3 von 3')
  assert.equal(summary.depthLabel('GLOBAL', true, true), 'Ebene 2 von 2', 'GLOBAL never has a third level')
})

const strip = await readText('components/inventory/InventoryKpiStrip.tsx')
const view = await readText('components/inventory/InventoryView.tsx')
const code = source => source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('GLOBAL has two levels (Material -> Lots), LOCATION is Material -> Ort -> Lots', () => {
  const src = code(view)
  const global = src.slice(src.indexOf("view === 'GLOBAL'\n      ?"), src.indexOf(': materialGroups.map', src.indexOf("view === 'GLOBAL'\n      ?")))
  assert.match(global, /id=\{`G:m:/)
  assert.doesNotMatch(global, /locations\(/, 'no location level between material and lot in GLOBAL')
  assert.match(global, /<Lots rows=\{materialRows\}/)
  const location = src.slice(src.indexOf(': materialGroups.map'))
  assert.ok(location.indexOf('`L:m:') < location.indexOf('locations(materialRows)'), 'material first, then location')
  assert.ok(location.indexOf('locations(materialRows)') < location.indexOf('<Lots rows={locationRows}'), 'lots last')
})

test('groups start collapsed and the depth indicator is shown in the list head', () => {
  const src = code(view)
  assert.match(src, /useState<ReadonlySet<string>>\(new Set\(\)\)/)
  assert.match(src, /open=\{open\.has\(id\)\}/)
  assert.match(src, /<p className="inventory-depth" role="status">\{depthLabel\(view, materialOpen, locationOpen\)\}<\/p>/)
})

test('material row shows quantity, average chip with text label, range and lot count', () => {
  const src = code(view)
  assert.match(src, /materialAverageQuality\(rows, kind\)/)
  assert.match(src, /<QualityChip quality=\{average\} \/>/)
  assert.match(src, /<QualityChip quality=\{range\.min\} \/> – <QualityChip quality=\{range\.max\} \/>/)
  assert.match(src, /rows\.length === 1 \? 'Lot' : 'Lots'/)
})

test('key figure strip: five tiles in order, on the filtered rows, display only', () => {
  const src = code(strip)
  const labels = [...src.matchAll(/<dt>([^<]+)<\/dt>/g)].map(match => match[1])
  assert.deepEqual(labels, ['Materialien', 'Menge SCU', 'Menge Stück', 'Lots', 'Zuletzt geändert'])
  assert.match(src, /aria-label="Kennzahlen"/)
  assert.match(src, /crew \? 'Crew-Bestand' : 'dein Bestand'/)
  assert.doesNotMatch(src, /<button|onClick|<a |Link/, 'the strip has no controls')
  assert.match(src, /formatQuantity\(kpis\.volumeRows, 'volume', mode\)/, 'SCU follows the unit preference')
  assert.match(src, /formatQuantity\(kpis\.countRows, 'count', mode\)/)
  assert.doesNotMatch(src, /weightedQuality|materialAverageQuality|Ø/, 'no overall average across materials')
  const src2 = code(view)
  assert.match(src2, /<InventoryKpiStrip rows=\{visibleRows\} units=\{units\} crew=\{crewViewerUserId !== undefined\} \/>/)
  assert.ok(src2.indexOf('<InventoryKpiStrip') < src2.indexOf('id="inventory-search"'), 'strip sits above the filters')
})

test('anchor jump opens the material (and in LOCATION the place), scrolls and highlights', () => {
  const src = code(view)
  assert.match(src, /`G:m:\$\{row\.material\}`/)
  assert.match(src, /`L:m:\$\{row\.material\}`/)
  assert.match(src, /`L:l:\$\{row\.material\}\|\$\{row\.location_id\}`/)
  assert.match(src, /scrollIntoView/)
  assert.match(src, /inventory-lot--highlight/)
  assert.match(src, /rows\.find\(\(candidate\) => candidate\.inventory_id === match\[1\]\)/, 'an unknown lot id does nothing')
})

test('Crew Inventory still has no write controls (strip is display only)', async () => {
  const crew = code(await readText('app/vector/inventory/crew/page.tsx'))
  assert.doesNotMatch(crew, /AddInventoryLotForm|inventory-write|inventory-update-write|inventory-delete-write/)
  assert.match(crew, /currentUserId=\{null\}/)
})
