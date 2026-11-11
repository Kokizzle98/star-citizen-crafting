import assert from 'node:assert/strict'
import test from 'node:test'
import { loadFabricatorModule } from './fabricator-fixture.mjs'

// Fabricator F2: ranking, filters and keyboard index helper (pure functions).

const search = await loadFabricatorModule('fabricator-search')

const family = (key, title, extra = {}) => ({
  key, kind: 'SINGLE', status: 'RESOLVED', reviewReasons: [], title, titleFromTag: false, titleDetail: null,
  categoryKey: 'PowerPlant', manufacturer: 'Amon & Reese Co.', sizeLabel: 'S2', subcategories: ['size2'], slots: [],
  variants: [{ variantKey: '', isBase: null, components: [{ slot: null, itemName: title, manufacturer: null, subcategory: null, sizeLabel: null, blueprints: [0] }] }],
  ...extra,
})
const row = (f, craft = 'AVAILABLE', names = []) => search.toFabricatorSearchRow(f, f.categoryKey === 'ARMOR' ? 'Armor' : 'Power Plant', craft, names)

const rows = [
  row(family('a', 'Rifle')),
  row(family('b', 'Rifleman Core', { categoryKey: 'ARMOR', sizeLabel: null })),
  row(family('c', 'Killshot Rifle', { sizeLabel: 'S3' })),
  row(family('d', 'Sniperrifle')),
  row(family('e', 'Zeta', { manufacturer: 'Rifle Works' }), 'PARTIAL'),
  row(family('f', 'Alpha'), 'UNAVAILABLE', ['Alpha "Rifle" Edition']),
  row(family('g', 'Killshot Rifle', { sizeLabel: 'S3' })),
]
const keys = (filters) => search.filterAndRankFabricatorRows(rows, { ...search.EMPTY_FABRICATOR_FILTERS, ...filters }).map(r => r.key)

test('ranking: exact > startsWith > word start > name contains > other fields', () => {
  assert.deepEqual(keys({ query: 'rifle' }), ['a', 'b', 'c', 'g', 'd', 'f', 'e'])
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map(k => search.fabricatorMatchTier(rows.find(r => r.key === k), 'rifle')), [0, 1, 2, 3, 4])
  assert.equal(search.fabricatorMatchTier(rows[0], 'nothing'), null)
})

test('case-insensitive, trimmed, multi-word and over manufacturer, category, subcategory, size and variant names', () => {
  assert.deepEqual(keys({ query: '  KILLSHOT rifle ' }), ['c', 'g'])
  assert.deepEqual(keys({ query: 'amon' }).length, 6)
  assert.deepEqual(keys({ query: 'armor' }), ['b'])
  assert.deepEqual(keys({ query: 'size2' }).length, 7)
  assert.deepEqual(keys({ query: 's3' }), ['c', 'g'])
  assert.deepEqual(keys({ query: 'edition' }), ['f'])
})

test('deterministic ties: identical names are ordered by the stable family key', () => {
  const shuffled = [rows[6], rows[2], rows[0]]
  assert.deepEqual(search.filterAndRankFabricatorRows(shuffled, { ...search.EMPTY_FABRICATOR_FILTERS, query: 'killshot' }).map(r => r.key), ['c', 'g'])
  assert.deepEqual(keys({}), ['f', 'c', 'g', 'a', 'b', 'd', 'e'])
})

test('no identity inference: search never merges, splits or renames families', () => {
  const before = rows.map(r => ({ ...r }))
  const result = search.filterAndRankFabricatorRows(rows, { ...search.EMPTY_FABRICATOR_FILTERS, query: 'killshot rifle' })
  assert.deepEqual(result.map(r => r.key), ['c', 'g'], 'two families with the same name stay two results')
  assert.deepEqual(rows, before, 'rows are not mutated')
  for (const r of result) assert.ok(rows.includes(r))
})

test('filters: category, size (incl. without size), craftability, reset and result count', () => {
  assert.deepEqual(keys({ category: 'ARMOR' }), ['b'])
  assert.deepEqual(keys({ size: 'S3' }), ['c', 'g'])
  assert.deepEqual(keys({ size: search.FABRICATOR_NO_SIZE }), ['b'])
  assert.deepEqual(keys({ craftability: 'PARTIAL' }), ['e'])
  assert.deepEqual(keys({ category: 'PowerPlant', size: 'S2', craftability: 'AVAILABLE', query: 'rifle' }), ['a', 'd'])
  assert.equal(keys(search.EMPTY_FABRICATOR_FILTERS).length, rows.length)
})

test('filter options come from the data only', () => {
  const options = search.fabricatorFilterOptions(rows)
  assert.deepEqual(options.categories, [{ value: 'ARMOR', label: 'Armor' }, { value: 'PowerPlant', label: 'Power Plant' }])
  assert.deepEqual(options.sizes.map(s => s.value), ['S2', 'S3', search.FABRICATOR_NO_SIZE])
  assert.deepEqual(options.craftability, ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'])
  assert.deepEqual(search.fabricatorFilterOptions([]), { categories: [], sizes: [], craftability: [] })
})

test('keyboard index: arrows clamp, Home/End jump, empty list has no active option', () => {
  assert.equal(search.nextActiveIndex(-1, 5, 'ArrowDown'), 0)
  assert.equal(search.nextActiveIndex(0, 5, 'ArrowDown'), 1)
  assert.equal(search.nextActiveIndex(4, 5, 'ArrowDown'), 4)
  assert.equal(search.nextActiveIndex(0, 5, 'ArrowUp'), 0)
  assert.equal(search.nextActiveIndex(3, 5, 'Home'), 0)
  assert.equal(search.nextActiveIndex(1, 5, 'End'), 4)
  assert.equal(search.nextActiveIndex(2, 5, 'x'), 2)
  assert.equal(search.nextActiveIndex(2, 0, 'ArrowDown'), -1)
})
