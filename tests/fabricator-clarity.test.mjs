import assert from 'node:assert/strict'
import test from 'node:test'
import { loadLibModule, readText } from './fabricator-fixture.mjs'

// UX-6a: Fabricator clarity pass (progressive disclosure) and the topbar
// dataset version. Static contract checks of the markup, same approach as
// fabricator-ui.test.mjs (there is no component renderer in this repository).
// No calculation, status text or data source is touched by this work package.

const [workspace, quality, disclosure, css, topbar, label, pin] = await Promise.all([
  readText('components/fabricator/FabricatorWorkspace.tsx'),
  readText('components/fabricator/FabricatorQuality.tsx'),
  readText('components/fabricator/FabricatorDisclosure.tsx'),
  readText('app/globals.css'),
  readText('components/layout/VectorTopbar.tsx'),
  readText('components/layout/dataset-label.ts'),
  readText('lib/blueprints/blueprint-sync-payload.ts'),
])
const code = source => source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('one collapse pattern: native details/summary, closed by default, no custom key handling', () => {
  assert.match(disclosure, /<details className=/)
  assert.match(disclosure, /<summary className="fabricator-disclosure__summary">/)
  assert.doesNotMatch(code(disclosure), /defaultOpen|open=\{true\}|onKeyDown|tabIndex|role=/, 'closed by default; the browser handles Tab / Enter / Space')
  assert.match(css, /\.fabricator-disclosure__summary:focus-visible \{\s*outline: 2px solid var\(--focus\);/)
  assert.match(css, /\.fabricator-disclosure__summary \{[^}]*cursor: pointer;/)
})

test('recipe and crew stock are collapsed and moved below stats and overall quality; status stays in the summary', () => {
  const recipe = workspace.slice(workspace.indexOf('function RecipeSection'))
  const qualityAt = recipe.indexOf('<FabricatorQuality')
  const recipeAt = recipe.indexOf('<FabricatorDisclosure className="fabricator-recipe"')
  assert.ok(qualityAt > 0 && recipeAt > qualityAt, 'values and quality come before the recipe')
  const summary = recipe.slice(recipeAt, recipe.indexOf('</>}>', recipeAt))
  assert.match(summary, /Rezept &amp; Crew-Bestand/)
  assert.match(summary, /<StatusBadge status=\{result \? result\.status : 'CREW_UNAVAILABLE'\} \/>/, 'same status as before, visible while closed')
  assert.match(summary, /Materialien gedeckt/)
  // The table, lots and multi-location note live inside the collapsed body.
  const body = recipe.slice(recipe.indexOf('</>}>', recipeAt))
  for (const needle of ['Materialbedarf', 'LotList', 'Der nutzbare Bestand liegt an mehreren Locations', 'Herstellungszeit laut SCMDB']) {
    assert.ok(body.includes(needle), needle)
  }
  assert.match(recipe, /recipe\.issues\.length > 0 && \(/, 'recipe warnings stay visible')
})

test('a new concrete item resets the collapsed state (deliberate, keyed by blueprint)', () => {
  assert.match(workspace, /<RecipeSection key=\{blueprintIndex!\} blueprintIndex=\{blueprintIndex!\}/)
})

test('material quality details are collapsed; the compact overall quality stays in the primary view', () => {
  const at = quality.indexOf('<FabricatorDisclosure className="fabricator-disclosure--quality"')
  assert.ok(at > 0)
  const before = quality.slice(0, at)
  const after = quality.slice(at)
  for (const needle of ['Verfügbares gemeinsames Preset', 'Aktuelle Materialqualitäten (Simulation)', 'aria-label="Produktwerte"']) {
    assert.ok(before.includes(needle), `primary: ${needle}`)
  }
  assert.ok(before.indexOf('aria-label="Produktwerte"') < before.indexOf('Verfügbares gemeinsames Preset'), 'stats before overall quality')
  for (const needle of ['Alle Materialien gemeinsam setzen', 'aria-label="Qualität je Material"', '<QualityInput id={`fabricator-quality-slot-']) {
    assert.ok(after.includes(needle), `details: ${needle}`)
  }
  assert.match(quality, /Material-Qualität im Detail/)
  assert.match(quality, /formatQualityRange\(relevant\.map\(slot => qualities\[slot\.slotKey\]\)\)/, 'existing range, no new average')
  assert.doesNotMatch(code(quality), /reduce\(|average|mean\(|\/ relevant\.length/i)
})

test('variant choice is one compact line after the pick, every variant stays reachable and named', () => {
  assert.match(workspace, /<VariantChooser key=\{family\.key\} family=\{family\} current=\{variant\}/)
  const chooser = workspace.slice(workspace.indexOf('function VariantChooser'), workspace.indexOf('/** Navigation only'))
  assert.match(chooser, /useState\(false\)/, 'starts compact')
  assert.match(chooser, /onClick=\{\(\) => \{ onChoose\(v\); setOpen\(false\) \}\}/, 'closes after the pick')
  assert.match(chooser, /<strong>\{label\(current\)\}<\/strong>/)
  assert.match(chooser, /differs\(current\) && <span className="fabricator-choice__hint">abweichende Werte<\/span>/)
  assert.match(chooser, /Ändern/)
  assert.match(chooser, /family\.variants\.map\(v => \(/, 'all variants listed in the expanded part')
  assert.match(chooser, /aria-pressed=\{v\.variantKey === current\.variantKey\}/)
})

test('narrow widths: summaries wrap, bodies can shrink, no horizontal page scroll introduced', () => {
  assert.match(css, /\.fabricator-disclosure__summary \{[^}]*flex-wrap: wrap;/)
  assert.match(css, /\.fabricator-disclosure__body \{\s*min-width: 0;/)
})

test('topbar shows LIVE with the game version from the existing pin, no PTU, no selection', () => {
  assert.match(topbar, /import \{ SCMDB_BLUEPRINT_LIVE_SYNC_PIN \} from '@\/lib\/blueprints\/blueprint-sync-payload'/)
  assert.doesNotMatch(code(label), /\d+\.\d+\.\d+/, 'no hard-coded version in the label helper')
  assert.match(pin, /version: '4\.10\.2-live\.12913470'/)
  assert.match(topbar, /liveDatasetLabel\(SCMDB_BLUEPRINT_LIVE_SYNC_PIN\.version\)/)
  assert.match(topbar, /<strong className="vector-topbar__live">● \{datasetText\}<\/strong>/)
  assert.match(topbar, /const datasetText = dataset\.gameVersion \? `LIVE · \$\{dataset\.gameVersion\}` : 'LIVE'/)
  assert.match(topbar, /aria-label=\{`Dataset: \$\{datasetText\.replace\(' · ', ', Spielversion '\)\}\. Dataset-Auswahl folgt später\.`\}/)
  assert.match(topbar, /title=\{`Aktiver LIVE-Datensatz \$\{dataset\.build\}/)
  assert.match(topbar, /aria-disabled="true"/, 'still no selection')
  assert.doesNotMatch(code(label), /ptu/i)
  assert.deepEqual(code(topbar).match(/ptu/gi), ['PTU'], 'PTU appears only in the existing "selection follows later" title')
})

test('dataset label helper: game version from a LIVE build, fail-soft otherwise', async () => {
  const { liveDatasetLabel } = await loadLibModule('components/layout/dataset-label')
  assert.deepEqual(liveDatasetLabel('4.10.2-live.12913470'), { gameVersion: '4.10.2', build: '4.10.2-live.12913470' })
  assert.equal(liveDatasetLabel('4.10.3-live.1').gameVersion, '4.10.3')
  assert.equal(liveDatasetLabel('5.0.0-ptu.13189690').gameVersion, null, 'a PTU build never yields a version label')
  assert.equal(liveDatasetLabel('').gameVersion, null)
})
