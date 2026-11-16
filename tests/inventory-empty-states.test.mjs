import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// The repo has no render tests: these source tests prove each hint exists in its component.
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('case 1: own inventory without lots names the add action', async () => {
  const page = await read('app/vector/inventory/page.tsx')
  assert.match(page, /ownRows\.length === 0[\s\S]*noch kein Material im Inventory[\s\S]*„Lot hinzufügen“/)
})

test('case 2: crew inventory without lots names the next step', async () => {
  const page = await read('app/vector/inventory/crew/page.tsx')
  assert.match(page, /result\.rows\.length === 0[\s\S]*noch kein Inventory vorhanden[\s\S]*„Mein Inventory“ Lots hinzufügen/)
})

test('case 3: Location view explains when every lot is in Unbekannt', async () => {
  const view = await read('components/inventory/InventoryView.tsx')
  assert.match(view, /view === 'LOCATION' && rows\.length > 0 && rows\.every\(\(row\) => row\.location_name === 'Unbekannt'\)/)
  assert.match(view, /Alle Lots liegen in „Unbekannt“, deshalb zeigt die Location-Ansicht nichts anderes als Global/)
  assert.match(view, /über „Bearbeiten“ eine Location/)
})

test('case 4: empty filter result names the reset action and its key', async () => {
  const view = await read('components/inventory/InventoryView.tsx')
  assert.match(view, /visibleRows\.length === 0[\s\S]*Keine Treffer für diesen Filter[\s\S]*„Filter zurücksetzen“ \(Taste R\)/)
  assert.match(view, />\s*Filter zurücksetzen\s*</)
})

test('case 5: missing player name message is understandable without developer knowledge', async () => {
  const messages = await read('lib/inventory/inventory-error-messages.ts')
  assert.match(messages, /PLAYER_CONTEXT_REQUIRED:\s*'Für dein Konto ist noch kein Spielername hinterlegt/)
  assert.doesNotMatch(messages, /Spielerprofil/)
})
