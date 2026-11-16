import assert from 'node:assert/strict'
import test from 'node:test'
import { readText } from './fabricator-fixture.mjs'

// UX-6a follow-up: visible expand indicator and focus after a variant pick.

const [css, disclosure, workspace] = await Promise.all([
  readText('app/globals.css'),
  readText('components/fabricator/FabricatorDisclosure.tsx'),
  readText('components/fabricator/FabricatorWorkspace.tsx'),
])

test('every Fabricator summary shows an own indicator: native marker hidden, shape changes with the open state', () => {
  assert.match(css, /\.fabricator-disclosure__summary \{[^}]*list-style: none;/)
  assert.match(css, /\.fabricator-disclosure__summary::-webkit-details-marker \{\s*display: none;/)
  assert.match(css, /\.fabricator-disclosure__summary::before \{[^}]*content: '▸';/)
  assert.match(css, /\.fabricator-disclosure\[open\] > \.fabricator-disclosure__summary::before \{[^}]*content: '▾';/)
  assert.match(css, /\.fabricator-disclosure__summary:focus-visible \{\s*outline: 2px solid var\(--focus\);/)
  assert.doesNotMatch(css.slice(css.indexOf('.fabricator-disclosure__summary::before')), /@keyframes fabricator-disclosure|transition:[^;]*transform/)
})

test('a variant pick keeps the panel open and does not move the focus (FAB-UX-1); the summary toggles it', () => {
  const chooser = workspace.slice(workspace.indexOf('function VariantChooser'), workspace.indexOf('/** Navigation only'))
  assert.match(chooser, /onClick=\{\(\) => onChoose\(v\)\}/, 'the pick only chooses')
  assert.doesNotMatch(code(chooser), /setOpen\(false\)|focusSignal|setFocusSignal/, 'no close and no focus jump after a pick')
  assert.match(chooser, /onOpenChange=\{setOpen\}/, 'open and close stay with the summary line')
  // other disclosures (recipe, quality) never ask for focus
  assert.equal([...code(workspace).matchAll(/focusSummarySignal=/g)].length, 0)
})

function code(source) { return source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') }
