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

test('after a variant pick the focus goes to the summary of the variant line, not after a plain toggle', () => {
  // the disclosure focuses its own summary when the signal goes up, and never on mount (signal 0)
  assert.match(disclosure, /focusSummarySignal = 0/)
  assert.match(disclosure, /if \(focusSummarySignal > 0\) detailsRef\.current\?\.querySelector<HTMLElement>\(':scope > summary'\)\?\.focus\(\)/)
  assert.match(disclosure, /\}, \[focusSummarySignal\]\)/)
  // only the variant pick raises the signal; opening or closing by the summary does not
  assert.equal([...workspace.matchAll(/setFocusSignal\(/g)].length, 1, 'raised in one place only')
  assert.match(workspace, /const setOpen = \(next: boolean\) => \{ setOpenState\(next\); setFocusSignal\(signal => signal \+ 1\) \}/)
  assert.match(workspace, /onClick=\{\(\) => \{ onChoose\(v\); setOpen\(false\) \}\}/, 'the pick uses the focusing close')
  assert.match(workspace, /onOpenChange=\{setOpenState\} focusSummarySignal=\{focusSignal\}/, 'a plain toggle does not')
  // other disclosures (recipe, quality) never ask for focus
  const quality = code(workspace)
  assert.equal([...quality.matchAll(/focusSummarySignal=/g)].length, 1)
})

function code(source) { return source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') }
