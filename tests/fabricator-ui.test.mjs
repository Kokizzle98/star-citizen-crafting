import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Fabricator F2: static contract checks of the route, the server read
// boundary, the client workspace, navigation and styles (same approach as the
// Blueprint and Inventory UI tests; there is no component renderer here).

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [page, boundary, workspace, visual, sidebar, dashboard, css, labels] = await Promise.all([
  read('app/vector/fabricator/page.tsx'),
  read('lib/fabricator/fabricator-workspace-read.ts'),
  read('components/fabricator/FabricatorWorkspace.tsx'),
  read('components/fabricator/FabricatorVisual.tsx'),
  read('components/layout/VectorSidebar.tsx'),
  read('app/vector/page.tsx'),
  read('app/globals.css'),
  read('lib/fabricator/fabricator-labels.ts'),
])
const code = source => source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('route requires a session, reads through the boundary and covers every state', () => {
  assert.match(page, /await requireUser\(\)/)
  assert.match(page, /getFabricatorWorkspaceData\(\)/)
  assert.match(page, /data\.status === 'ready' && <FabricatorWorkspace catalog=\{data\.catalog\} crew=\{data\.crew\} \/>/)
  assert.match(page, /data\.status === 'guard_failed' && \(\s*<p role="alert"/)
  assert.match(page, /data\.status === 'read_error' && \(\s*<p role="alert"/)
  assert.match(page, /Es wird kein anderer Datensatz ersatzweise verwendet/)
  for (const status of ['VERSION_MISMATCH', 'BLUEPRINT_TOTAL_MISMATCH', 'CHANNEL_MISMATCH', 'DATASET_UNAVAILABLE', 'DATASET_AMBIGUOUS']) {
    assert.match(page, new RegExp(`${status}:`))
  }
  assert.doesNotMatch(code(page), /supabase\/admin|service_role|createSupabaseServerClient|ptu/i)
})

test('server boundary: server-only, guarded LIVE mirror plus the existing crew RPC, read-only', () => {
  assert.match(boundary, /^import 'server-only'/)
  assert.match(boundary, /getFabricatorLiveSource\(\)/)
  assert.match(boundary, /getActiveGroupInventory\(\)/)
  assert.match(boundary, /if \(source\.status === 'guard_failed'\) return \{ status: 'guard_failed', guard: source\.guard \}/)
  assert.match(boundary, /crew = \{ status: inventory\.status \}/)
  const body = code(boundary)
  assert.doesNotMatch(body, /\.(insert|update|upsert|delete)\(|\.rpc\(|supabase\/admin|service_role|SUPABASE_SECRET_KEY|ptu/i)
  assert.doesNotMatch(body, /owner_user_id:|created_at:|updated_at:/, 'owner ids and timestamps stay on the server')
})

test('workspace is read-only: no server action, no mutation, no reservation, no F3 controls', () => {
  const body = code(workspace)
  assert.doesNotMatch(body, /actions'|fetch\(|useRouter|router\.refresh|formAction|submit/)
  assert.doesNotMatch(body, /reserv|consum|type="range"|Slider|SMART|SAVE PREMIUM|MANUAL/i)
  assert.match(workspace, /^'use client'/)
  assert.match(workspace, /^import type \{ FabricatorCrewResult \} from '@\/lib\/fabricator\/fabricator-workspace-read'/m,
    'the server-only boundary is imported for its type only')
})

test('results: listbox with aria-activedescendant, Arrow/Home/End navigation and Enter selection', () => {
  assert.match(workspace, /role="listbox" tabIndex=\{0\}\s*aria-label="Produkte" aria-activedescendant=\{activeId\} onKeyDown=\{onListKeyDown\}/)
  assert.match(workspace, /role="option" aria-selected=\{selected\}/)
  assert.match(workspace, /role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="fabricator-results"/)
  assert.match(workspace, /if \(event\.key === 'Enter'\) \{\s*if \(activeIndex >= 0 && shown\[activeIndex\]\) \{\s*event\.preventDefault\(\)\s*selectFamily\(shown\[activeIndex\]\.key\)/)
  assert.match(workspace, /nextActiveIndex\(activeIndex, shown\.length, event\.key\)/)
  assert.match(workspace, /scrollIntoView\(\{ block: 'nearest' \}\)/)
  assert.match(css, /\.fabricator-result\.is-active \{\s*border-color: var\(--focus\);/)
  assert.match(css, /\.fabricator-results:focus-visible,\s*\.fabricator-filters input:focus-visible \{\s*outline: 2px solid var\(--focus\);/)
})

test('every control has a label; result count is a live status', () => {
  for (const id of ['fabricator-search', 'fabricator-category', 'fabricator-size', 'fabricator-craftability']) {
    assert.match(workspace, new RegExp(`<label htmlFor="${id}">`))
  }
  assert.match(workspace, /<p className="inventory-filter-result" role="status">/)
  assert.match(workspace, /Filter zurücksetzen/)
  assert.match(workspace, /disabled=\{!crewAvailable\}/)
})

test('status is never colour-only: glyph plus text label everywhere', () => {
  assert.match(workspace, /<span aria-hidden="true">\{FABRICATOR_CRAFTABILITY_GLYPHS\[status\]\}<\/span> \{FABRICATOR_CRAFTABILITY_LABELS\[status\]\}/)
  for (const label of ['Herstellbar', 'Teilweise', 'Nicht verfügbar', 'Nicht auflösbar', 'Crew-Bestand nicht verfügbar']) assert.match(labels, new RegExp(label))
  assert.match(workspace, /SLOT_STATUS\[craft\.status\]/)
  assert.match(workspace, /<span aria-hidden="true">\{use\.usable \? '✓' : '✕'\}<\/span>/)
})

test('armor slots: missing slots are disabled and named "nicht im Datensatz"; nothing is synthesized', () => {
  assert.match(workspace, /disabled=\{!present\}/)
  assert.match(workspace, /`\$\{FABRICATOR_SLOT_LABELS\[slot\]\} – nicht im Datensatz`/)
  assert.match(workspace, /Diese Komponente ist für die gewählte Variante nicht im Datensatz\./)
})

test('multi-blueprint: explicit choice, no default selection', () => {
  assert.match(workspace, /const blueprintIndex = choices\.length === 1 \? choices\[0\] : selection\.blueprint/)
  assert.match(workspace, /blueprint: null \}/)
  assert.match(workspace, /checked=\{selection\.blueprint === index\}/)
  assert.match(workspace, /Es wird keiner automatisch gewählt\./)
})

test('functional deviation is stated in words, not colour; short labels are display only', () => {
  assert.match(workspace, /component\?\.functional === 'FUNCTIONALLY_DIFFERENT' && \(\s*<p className="fabricator-notice fabricator-notice--warning" role="note">/)
  assert.match(workspace, /Werte weichen von anderen Varianten ab\./)
  assert.match(workspace, /abweichende Werte<\/span>/)
  assert.match(workspace, /if \(v\.label\) return v\.label/)
  assert.match(workspace, /<dt>Produkt<\/dt>/)
  assert.match(css, /\.fabricator-notice--warning \{\s*border-color: var\(--warning\);/)
})

test('min quality and location semantics are explained in the UI', () => {
  assert.match(workspace, /unter Mindestqualität – zählt nicht/)
  assert.match(workspace, /„In der Crew vorhanden“ heißt nicht, dass alles an einem Ort liegt\./)
  assert.match(workspace, /CREW_NOTICES\[crew\.status\]/)
  assert.match(workspace, /no_active_crew: 'Keine aktive Crew ausgewählt\./)
})

test('hero: VECTOR-own inline category placeholder, no external or broken image', () => {
  assert.doesNotMatch(code(visual) + code(workspace), /<img|next\/image|https?:\/\/|public\/assets|\.png|\.jpg/)
  assert.match(visual, /role="img"/)
  assert.match(visual, /aria-label=\{`Platzhalter für \$\{categoryLabel\} – kein Produktbild`\}/)
  assert.match(workspace, /<FabricatorVisual categoryKey=\{family\.categoryKey\} categoryLabel=\{categoryLabel\} \/>/)
})

test('responsive: two panes on desktop, stacked below 1100px', () => {
  assert.match(css, /\.fabricator-workspace__panes \{\s*display: grid;\s*grid-template-columns: minmax\(320px, 400px\) minmax\(0, 1fr\);/)
  assert.match(css, /@media \(max-width: 1100px\) \{\s*\.fabricator-workspace__panes \{\s*grid-template-columns: 1fr;/)
})

test('navigation: sidebar link with aria-current and an available dashboard card', () => {
  assert.match(sidebar, /href="\/vector\/fabricator"/)
  assert.match(sidebar, /aria-current=\{pathname === '\/vector\/fabricator' \? 'page' : undefined\}/)
  assert.doesNotMatch(sidebar, /label: 'Fabricator'/)
  assert.match(dashboard, /<Link\s+href="\/vector\/fabricator"\s+className="vector-module-card vector-module-card--link"/)
  assert.match(dashboard, /VERFÜGBAR[\s\S]*?<h2>Fabricator<\/h2>/)
})

test('armor set overview (OD-FAB-UX-01): pure navigation state, default after family and variant, no recipe and no material sum', () => {
  assert.match(workspace, /const SET_OVERVIEW = 'SET'/)
  assert.match(workspace, /const slot = family\.kind === 'ARMOR_SET' \? SET_OVERVIEW : variant\.components\[0\]\.slot/, 'a new armor family opens the overview')
  assert.match(workspace, /const slot = family\.kind === 'ARMOR_SET' \? SET_OVERVIEW : next\.components\[0\]\.slot/, 'a new variant / edition opens the overview')
  assert.match(workspace, /if \(slot === SET_OVERVIEW\) return null/, 'the overview resolves to no component, blueprint or recipe')
  assert.match(workspace, /\{overview\s*\? <SetOverview /)
  assert.match(workspace, /aria-pressed=\{overview\} onClick=\{\(\) => onChange\(\{ \.\.\.selection, slot: SET_OVERVIEW, blueprint: null \}\)\}>\s*Rüstungsset/)
  assert.match(workspace, /Das Rüstungsset ist kein eigenes Item, kein Blueprint und kein Rezept/)
  const overview = code(workspace).slice(code(workspace).indexOf('function SetOverview'), code(workspace).indexOf('function RecipeSection'))
  assert.ok(overview.length > 0)
  assert.doesNotMatch(overview, /recipe|RecipeSection|required|formatFabricatorQuantity|reduce\(|craftab/i, 'no recipe, no material sum, no aggregated status')
  assert.match(overview, /family\.slots\.map/)
  assert.match(overview, /nicht im Datensatz/)
  assert.match(overview, /component\.functional === 'FUNCTIONALLY_DIFFERENT'/)
  assert.match(overview, /onClick=\{\(\) => onSelect\(slot\)\}>Komponente öffnen/)
  assert.match(css, /\.fabricator-set__item \{/)
})

// Fabricator F3: MANUAL quality, available preset, material -> stat and stats.
const [quality, stats] = await Promise.all([
  read('components/fabricator/FabricatorQuality.tsx'),
  read('lib/fabricator/fabricator-stats.ts'),
])

test('F3 slider: native range + synced number input, Q0–1000, keyboard, no server roundtrip', () => {
  assert.match(quality, /^'use client'/)
  assert.match(quality, /type="range" min=\{0\} max=\{1000\} step=\{1\} value=\{quality\}/)
  assert.match(quality, /type="number" inputMode="numeric" min=\{0\} max=\{1000\} step=\{1\} value=\{draft\}/)
  assert.match(quality, /onKeyDown=\{onSliderKey\}/)
  assert.match(quality, /manualQualityKeyStep\(event\.key, quality\)/)
  assert.match(quality, /clampManualQuality\(/)
  assert.match(quality, /<label htmlFor="fabricator-quality-range">/)
  assert.match(quality, /<label htmlFor="fabricator-quality-number"/)
  assert.doesNotMatch(code(quality), /fetch\(|'use server'|useRouter|supabase|router\.refresh/)
  assert.match(css, /\.fabricator-quality input:focus-visible/)
})

test('F3: available preset and manual simulation are distinct and the simulation is never a stock promise', () => {
  assert.match(quality, /Verfügbares gemeinsames Preset/)
  assert.match(quality, /Aktuelle manuelle Simulation/)
  assert.match(quality, /ist eine Simulation und wird durch den aktuellen Bestand nicht garantiert/)
  assert.match(quality, /Auf verfügbares Preset zurücksetzen/)
  assert.match(quality, /kein Lager-Durchschnitt und nicht die Qualität des gecrafteten Items/)
  assert.match(labels, /Kein Bestands-Preset/)
  assert.match(workspace, /<FabricatorQuality key=\{blueprintIndex\}/, 'remount only on a new concrete item')
})

test('F3: stats are per concrete item, show Base / Crafted / Δ and status text, D4 relative effect', () => {
  assert.match(workspace, /blueprintBaselines\(catalog, blueprint\)/)
  assert.match(workspace, /availablePreset\(result\)/)
  for (const header of ['Basis', 'Gecraftet', 'Δ absolut', 'Δ %', 'Status']) assert.match(quality, new RegExp(`<th scope="col">${header}</th>`))
  assert.match(quality, /Relativer Crafting-Effekt/)
  assert.match(quality, /Absoluter Basiswert fehlt\./)
  assert.match(quality, /FABRICATOR_STAT_STATUS_GLYPHS\[row\.status\]\}<\/span> \{FABRICATOR_STAT_STATUS_LABELS\[row\.status\]\}/, 'never colour only')
  for (const status of ['RESOLVED', 'REVIEW_REQUIRED', 'SOURCE_DATA_MISSING', 'UNRESOLVED']) assert.match(labels, new RegExp(`${status}: '`))
  assert.doesNotMatch(code(stats), /family|fingerprint/i, 'no family-wide or fingerprint calculation identity')
})

test('F3: material -> affected stats and per-slot available quality in the recipe table', () => {
  assert.match(workspace, /affectedProperties\(recipe\)/)
  assert.match(workspace, /Beeinflusst: /)
  assert.match(workspace, /<th scope="col">Verfügbare Q<\/th>/)
  assert.match(workspace, /Bestand geteilt mit/)
  assert.match(workspace, /für das Preset verwendet: /)
  assert.match(quality, /beeinflusst durch /)
})
