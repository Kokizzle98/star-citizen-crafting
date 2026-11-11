import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Blueprint PR 4: static contract checks of the page, the client view, the
// sidebar link, the dashboard entry and the styles (same approach as the
// Inventory UI tests; there is no component renderer in this repository).

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [page, view, sidebar, dashboard, css, messages] = await Promise.all([
  read('app/vector/blueprints/page.tsx'),
  read('components/blueprints/BlueprintCatalogView.tsx'),
  read('components/layout/VectorSidebar.tsx'),
  read('app/vector/page.tsx'),
  read('app/globals.css'),
  read('lib/blueprints/blueprint-messages.ts'),
])
const code = source => source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('page requires a session, reads through the boundary and covers every catalog state', () => {
  assert.match(page, /await requireUser\(\)/)
  assert.match(page, /getBlueprintPageData\(\)/)
  assert.match(page, /ownedIds=\{own\.status === 'success' \? own\.ownedIds : null\}/)
  assert.match(page, /currentUserId=\{user\.id\}/)
  assert.match(page, /catalog\.status === 'no_active_dataset'/)
  assert.match(page, /catalog\.status === 'read_error' && <p role="alert">/)
  assert.doesNotMatch(code(page), /supabase\/admin|service_role|createSupabaseServerClient/)
})

test('status is shown as text Du / Crew / Nicht bekannt and never as "not owned"', () => {
  assert.match(view, /<\/span> Du<\/span>/)
  assert.match(view, /<\/span> Crew<\/span>/)
  assert.match(view, /<\/span> Nicht bekannt<\/span>/)
  assert.match(view, /auch: \{nicknames\.join\(', '\)\}/)
  assert.match(view, /deriveBlueprintStatus\(owned\.has\(blueprintId\), crewOwners\[blueprintId\]\)/)
  for (const source of [view, messages, page]) {
    assert.doesNotMatch(source, /nicht im Besitz|nicht besessen|not owned'|Nicht vorhanden/i)
  }
  assert.doesNotMatch(code(view), /scmdb_is_default|isDefault/)
})

test('an unreadable own ownership disables the toggles instead of showing "Nicht bekannt"', () => {
  assert.match(view, /const ownershipAvailable = ownedIds !== null/)
  assert.match(view, /if \(!available\) \{\s*return <span className="blueprint-status blueprint-status--unavailable">Status nicht verfügbar<\/span>/)
  assert.match(view, /disabled=\{!ownershipAvailable\}/)
  assert.match(view, /BLUEPRINT_OWN_READ_ERROR/)
})

test('crew status is optional and its unavailability is explained without blocking personal ownership', () => {
  assert.match(view, /crew\.status !== 'success' && <p className="blueprint-notice">\{BLUEPRINT_CREW_NOTICES\[crew\.status\]\}<\/p>/)
  assert.match(view, /crew\.status === 'success' && <option value="CREW">Crew<\/option>/)
  assert.match(messages, /no_active_crew: 'Keine aktive Crew ausgewählt\./)
  assert.match(messages, /dein eigener Besitz funktioniert weiter/)
})

test('ownership toggle: confirmed update only, per-row pending, double action guard, accessible name', () => {
  assert.match(view, /if \(!ownershipAvailable \|\| pendingRef\.current\.has\(id\)\) return/)
  assert.match(view, /const result = await submitBlueprintOwnership\(data\)\s*if \(result\.ok\) \{/)
  const confirmed = view.indexOf('if (result.ok) {')
  assert.ok(view.indexOf('setOwned((current)') > confirmed, 'ownership state changes only after a confirmed result')
  assert.doesNotMatch(code(view), /router\.refresh|useRouter|revalidatePath/)
  assert.match(view, /data\.set\('blueprintId', id\)/)
  assert.match(view, /data\.set\('intent', owned\.has\(id\) \? 'UNMARK' : 'MARK'\)/)
  assert.doesNotMatch(code(view), /user_id|userId'/)
  assert.match(view, /aria-pressed=\{ownershipAvailable \? ownedBySelf : undefined\}/)
  assert.match(view, /aria-label=\{`Besitze ich: \$\{row\.displayName\}`\}/)
  assert.match(view, /aria-busy=\{pending \|\| undefined\}/)
  assert.match(view, /aria-disabled=\{pending \|\| undefined\}/)
  assert.match(view, /'Speichert…'/)
})

test('success and error feedback use live regions; focus never falls back to the page body', () => {
  assert.match(view, /<div role="status" className="blueprint-announcement">/)
  assert.match(view, /announcement\?\.kind === 'error' && <div role="alert"/)
  assert.match(view, /BLUEPRINT_OWNERSHIP_SUCCESS_MESSAGES\[result\.code\]/)
  assert.match(view, /BLUEPRINT_OWNERSHIP_ERROR_MESSAGES\[result\.code\]/)
  assert.match(view, /document\.activeElement === document\.body\) resultRef\.current\?\.focus\(\)/)
  assert.match(view, /<p ref=\{resultRef\} tabIndex=\{-1\} className="inventory-filter-result" role="status">/)
})

test('100-plus-100 display, filters reset the display and every control has a label', () => {
  assert.match(view, /useState\(BLUEPRINT_DISPLAY_STEP\)/)
  assert.match(view, /const shownRows = visibleRows\.slice\(0, limit\)/)
  assert.match(view, /setLimit\(\(current\) => current \+ BLUEPRINT_DISPLAY_STEP\)/)
  assert.match(view, /Weitere \{moreStep\} anzeigen/)
  assert.match(view, /function updateFilters[\s\S]*?setLimit\(BLUEPRINT_DISPLAY_STEP\)/)
  for (const control of ['blueprint-search', 'blueprint-gear-filter', 'blueprint-type-filter', 'blueprint-manufacturer-filter',
    'blueprint-ownership-filter', 'blueprint-review-filter', 'blueprint-sort']) {
    assert.match(view, new RegExp(`<label htmlFor="${control}">`))
    assert.match(view, new RegExp(`id="${control}"`))
  }
  assert.match(view, /<option value="REVIEW_REQUIRED">Prüfung nötig<\/option>/)
})

test('REVIEW_REQUIRED is visible as text with the source issues and does not block ownership', () => {
  assert.match(view, /row\.review_state === 'REVIEW_REQUIRED' && <ReviewNote row=\{row\} \/>/)
  assert.match(view, /<span aria-hidden="true">⚠<\/span> Prüfung nötig/)
  assert.match(view, /blueprintSuggestedNameMessage\(row\.scmdb_suggested_name\)/)
  assert.match(view, /Name fehlt in SCMDB/)
  assert.match(messages, /Besitz kann trotzdem markiert werden/)
})

test('table is a labelled, keyboard-scrollable region with column headers', () => {
  assert.match(view, /className="vector-inventory-table blueprint-table" role="region" aria-label="Blueprints" tabIndex=\{0\}/)
  assert.equal((view.match(/<th scope="col">/g) ?? []).length, 5)
})

test('sidebar links to the route and the dashboard offers an entry', () => {
  assert.match(sidebar, /href="\/vector\/blueprints"/)
  assert.match(sidebar, /aria-current=\{pathname === '\/vector\/blueprints' \? 'page' : undefined\}/)
  assert.doesNotMatch(sidebar, /label: 'Blueprints'/)
  assert.match(sidebar, /href="\/vector\/inventory"/)
  assert.match(dashboard, /<Link\s+href="\/vector\/blueprints"\s+className="vector-module-card vector-module-card--link"/)
  assert.match(dashboard, /VERFÜGBAR[\s\S]*?<h2>Blueprints<\/h2>/)
})

test('status styles exist and never rely on colour alone', () => {
  for (const selector of ['.blueprint-status--self', '.blueprint-status--crew', '.blueprint-status--unknown',
    '.blueprint-review__chip', ".blueprint-toggle[aria-pressed='true']", '.blueprint-filter-controls']) {
    assert.ok(css.includes(selector), selector)
  }
  assert.match(css, /@media \(max-width: 700px\) \{\s*\.blueprint-filter-controls/)
})
