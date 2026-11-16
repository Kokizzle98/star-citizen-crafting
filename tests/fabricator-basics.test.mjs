import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const workspace = await read('components/fabricator/FabricatorWorkspace.tsx')
const hintBar = await read('components/inventory/KeyHintBar.tsx')
const chooser = workspace.slice(workspace.indexOf('function VariantChooser'), workspace.indexOf('/** Navigation only'))

test('the Fabricator renders the existing hint bar and uses the shared key set', () => {
  assert.match(workspace, /import \{ KeyHintBar \} from '@\/components\/inventory\/KeyHintBar'/)
  assert.match(workspace, /import \{ useKeySet \} from '@\/components\/layout\/useKeySet'/)
  assert.match(workspace, /<KeyHintBar page="crew"[^>]*omit=\{\['view'\]\}/, 'no Mein/Crew switch on this page')
  assert.match(hintBar, /omit\?: readonly string\[\]/)
  assert.match(hintBar, /\.filter\(\(entry\) => !omit\.includes\(entry\.id\)\)/)
  assert.doesNotMatch(hintBar, /fabricator/i, 'the bar stays generic')
})

test('W / S, D / F, A, T and R act on the Fabricator list; no new key rules', () => {
  const keys = workspace.slice(workspace.indexOf('useKeySet(('), workspace.indexOf('const optionId'))
  for (const action of ['select-prev', 'select-next', 'open', 'back', 'focus-search', 'reset-filters']) {
    assert.ok(keys.includes(`case '${action}'`), action)
  }
  assert.doesNotMatch(keys, /case 'edit'|case 'view-/)
  assert.match(keys, /getElementById\('fabricator-search'\)/)
})

test('a variant pick keeps the panel open; the note states the shared recipe only where true', () => {
  assert.match(chooser, /onClick=\{\(\) => onChoose\(v\)\}/)
  assert.doesNotMatch(chooser, /setOpen\(false\)/)
  assert.match(chooser, /Alle Varianten: gleiches Rezept\./)
  assert.match(chooser, /family\.variants\.some\(differs\)/, 'the sentence is shown only when no variant differs')
  assert.match(chooser, /Einzelne Varianten haben abweichende Werte\./)
})
