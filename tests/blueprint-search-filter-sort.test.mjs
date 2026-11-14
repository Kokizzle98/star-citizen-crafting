import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

// Blueprint PR 4: client-side search, filter, sort, filter options and the
// 100-plus-100 display step (PR4-OD-02 = A), plus the German display labels.

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [searchSource, messagesSource] = await Promise.all([
  read('lib/blueprints/blueprint-search-filter-sort.ts'),
  read('lib/blueprints/blueprint-messages.ts'),
])
const stripImports = source => source.replace(/^import\s[\s\S]*?['"][^'"\n]+['"];?[ \t]*$/gm, '')
const transpile = source => ts.transpileModule(stripImports(source), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const search = await load(transpile(searchSource))
const messages = await load(transpile(messagesSource))

const id = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const base = (n, extra) => ({
  blueprint_id: id(n), source_tag: `BP_CRAFT_${n}`, product_name: `Item ${n}`, gear: 'fpsgear', type: 'armour',
  subtype: 'combat', manufacturer: 'Behring', review_state: 'VALID', issues: [], scmdb_suggested_name: null, ...extra,
})
const catalog = [
  base(1, { product_name: 'Zeta Helmet', manufacturer: 'Virgil' }),
  base(2, { product_name: 'alpha Core', subtype: 'stealth' }),
  base(3, { product_name: null, source_tag: 'BP_CRAFT_RADR_RSI_S04_Polaris', gear: 'vehiclegear', type: 'radar', subtype: 'size4', manufacturer: null, review_state: 'REVIEW_REQUIRED', issues: ['PRODUCT_NAME_MISSING'] }),
  base(4, { product_name: 'Main Powerplant', gear: 'vehiclegear', type: 'powerplant', subtype: 'size4', manufacturer: 'Aegis Dynamics', source_tag: 'BP_CRAFT_POWR_AEGS_S04_Idris_SCItem' }),
  base(5, { product_name: 'Main Powerplant', gear: 'vehiclegear', type: 'powerplant', subtype: 'size4', manufacturer: 'Aegis Dynamics', source_tag: 'BP_CRAFT_POWR_AEGS_S04_Reclaimer_SCItem' }),
  base(6, { product_name: 'Mission Box', gear: 'missionitems', type: null, subtype: null, manufacturer: 'Unknown' }),
  base(7, { product_name: 'SureGrip S1 Tractor Beam', gear: 'vehiclegear', type: 'tractorbeam', subtype: 'size1', manufacturer: 'Greycat Industrial', review_state: 'REVIEW_REQUIRED', issues: ['CIG_DATA_ERROR', 'SOURCE_SUGGESTED_NAME'], scmdb_suggested_name: 'SureGrip TH1 Tractor Beam' }),
]
const rows = search.toBlueprintListRows(catalog, messages.blueprintGearLabel, messages.blueprintTypeLabel)
const owned = new Set([id(2)])
const crew = { [id(2)]: ['Bob'], [id(4)]: ['adam'] }
const statusOf = blueprintId => owned.has(blueprintId) ? 'SELF' : crew[blueprintId] ? 'CREW' : 'UNKNOWN'
const filter = patch => search.filterBlueprintRows(rows, { ...search.EMPTY_BLUEPRINT_FILTERS, ...patch }, statusOf)
  .map(row => row.blueprint_id)

test('display name falls back to the source tag without inventing a name', () => {
  assert.equal(rows[2].displayName, 'BP_CRAFT_RADR_RSI_S04_Polaris')
  assert.equal(rows[2].product_name, null)
  assert.equal(rows[6].displayName, 'SureGrip S1 Tractor Beam', 'the SCMDB suggestion is not adopted')
})

test('search covers name, tag, manufacturer, subtype and German labels, case-insensitively', () => {
  assert.deepEqual(filter({ query: 'ALPHA' }), [id(2)])
  assert.deepEqual(filter({ query: 'reclaimer' }), [id(5)])
  assert.deepEqual(filter({ query: 'greycat' }), [id(7)])
  assert.deepEqual(filter({ query: 'stealth' }), [id(2)])
  assert.deepEqual(filter({ query: 'rüstung' }), [id(1), id(2)])
  assert.deepEqual(filter({ query: 'traktor' }), [id(7)])
  assert.deepEqual(filter({ query: '  ' }).length, rows.length)
  assert.deepEqual(filter({ query: 'nothing-matches' }), [])
})

test('filters by area, type, manufacturer, empty values, ownership and review state', () => {
  assert.deepEqual(filter({ gear: 'missionitems' }), [id(6)])
  assert.deepEqual(filter({ type: 'powerplant' }), [id(4), id(5)])
  assert.deepEqual(filter({ type: search.BLUEPRINT_FILTER_NONE }), [id(6)])
  assert.deepEqual(filter({ manufacturer: search.BLUEPRINT_FILTER_NONE }), [id(3)])
  assert.deepEqual(filter({ manufacturer: 'Unknown' }), [id(6)], 'the literal source value "Unknown" stays a normal value')
  assert.deepEqual(filter({ ownership: 'SELF' }), [id(2)])
  assert.deepEqual(filter({ ownership: 'CREW' }), [id(4)], 'SELF has priority, so id 2 is not CREW')
  assert.deepEqual(filter({ ownership: 'UNKNOWN' }), [id(1), id(3), id(5), id(6), id(7)])
  assert.deepEqual(filter({ review: 'REVIEW_REQUIRED' }), [id(3), id(7)])
  assert.deepEqual(filter({ gear: 'vehiclegear', review: 'REVIEW_REQUIRED', query: 'sure' }), [id(7)])
})

test('sorts with empty values last and a stable tie-breaker', () => {
  const sorted = sort => search.sortBlueprintRows(rows, sort).map(row => row.blueprint_id)
  assert.deepEqual(sorted('NAME_ASC'), [id(2), id(4), id(5), id(6), id(7), id(1), id(3)])
  assert.deepEqual(sorted('NAME_DESC'), [id(1), id(7), id(6), id(4), id(5), id(2), id(3)])
  assert.deepEqual(sorted('MANUFACTURER_ASC'), [id(4), id(5), id(2), id(7), id(6), id(1), id(3)])
  assert.deepEqual(sorted('TYPE_ASC').slice(-1), [id(6)], 'rows without type are last')
  assert.deepEqual(sorted('TYPE_ASC').slice(0, 2), [id(4), id(5)], 'Kraftwerk before Radar and Rüstung')
  assert.notStrictEqual(search.sortBlueprintRows(rows, 'NAME_ASC'), rows)
})

test('filter options come from the loaded data, with explicit entries for empty values', () => {
  const options = search.blueprintFilterOptions(rows, messages.BLUEPRINT_NO_TYPE_LABEL, messages.BLUEPRINT_NO_MANUFACTURER_LABEL)
  assert.deepEqual(options.gears.map(option => option.value), ['vehiclegear', 'fpsgear', 'missionitems'])
  assert.deepEqual(options.types.at(-1), { value: search.BLUEPRINT_FILTER_NONE, label: 'Ohne Typ' })
  assert.deepEqual(options.manufacturers.at(-1), { value: search.BLUEPRINT_FILTER_NONE, label: 'Ohne Hersteller' })
  assert.ok(options.manufacturers.some(option => option.value === 'Unknown'))
  assert.equal(new Set(options.types.map(option => option.value)).size, options.types.length)
})

test('display grows in steps of 100 over the full filtered result', () => {
  assert.equal(search.BLUEPRINT_DISPLAY_STEP, 100)
  assert.equal(search.nextBlueprintStep(1618, 100), 100)
  assert.equal(search.nextBlueprintStep(1618, 1600), 18)
  assert.equal(search.nextBlueprintStep(1618, 1700), 0)
  assert.equal(search.nextBlueprintStep(42, 100), 0)
})

test('labels translate known values only and keep unknown values unchanged', () => {
  assert.equal(messages.blueprintTypeLabel('armour'), 'Rüstung')
  assert.equal(messages.blueprintTypeLabel('quantumdrive'), 'Quantenantrieb')
  assert.equal(messages.blueprintTypeLabel('hoverboard'), 'hoverboard')
  assert.equal(messages.blueprintTypeLabel(null), 'Ohne Typ')
  assert.equal(messages.blueprintTypeLabel('toString'), 'toString')
  assert.equal(messages.blueprintGearLabel('vehiclegear'), 'Fahrzeugkomponenten')
  assert.equal(messages.blueprintGearLabel('newgear'), 'newgear')
  assert.equal(messages.blueprintSuggestedNameMessage('SureGrip TH1 Tractor Beam'),
    'SCMDB schlägt den Namen „SureGrip TH1 Tractor Beam“ vor (nicht übernommen).')
})
