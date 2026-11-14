// Key help (INVENTORY_UX_V1_1 section 13.1): which key does what, as DATA.
//
// This is display only. It adds no key and changes no key rule; the rules live
// in lib/keyboard/key-set.ts. The tests compare this table with keyAction() and
// escapeAction() so help and logic cannot drift apart.

import type { KeyAction } from './key-set'

/** Where a key applies. `mein-crew` = the switch between the two inventory pages. */
export type KeyHelpContext = 'global' | 'inventory' | 'mein-crew' | 'inline-editor' | 'delete-confirm'

/** State of the inventory page; decides which keys the hint bar shows. */
export type HintState = 'normal' | 'inline-editor' | 'delete-confirm'

export type KeyHelpEntry = {
  id: string
  /** Shown as key caps, e.g. "W / S". */
  label: string
  /** The real key characters (lower case or digit) the entry stands for; `Escape` for Esc. */
  keys: readonly string[]
  /** What those keys mean in key-set.ts (`escape` for Esc). */
  action: KeyAction['type'] | 'escape'
  context: KeyHelpContext
  /** Full German text for the overview. */
  text: string
  /** Short German text for the hint bar. */
  short: string
  /** The hint bar shows this entry in these states. */
  hintIn: readonly HintState[]
  /** Number keys of areas that are not built yet ("BALD"): no effect. */
  soon?: boolean
}

export const KEY_HELP: readonly KeyHelpEntry[] = [
  { id: 'select', label: 'W / S', keys: ['w', 's'], action: 'select-prev', context: 'inventory',
    text: 'Eintrag davor / danach wählen', short: 'wählen', hintIn: ['normal'] },
  { id: 'open', label: 'D / F', keys: ['d', 'f'], action: 'open', context: 'inventory',
    text: 'Gewählten Eintrag öffnen (eine Ebene tiefer)', short: 'öffnen', hintIn: ['normal'] },
  { id: 'back', label: 'A', keys: ['a'], action: 'back', context: 'inventory',
    text: 'Eine Ebene zurück', short: 'zurück', hintIn: ['normal'] },
  { id: 'view', label: 'Q / E', keys: ['q', 'e'], action: 'view-prev', context: 'mein-crew',
    text: 'Q = Mein Inventory, E = Crew Inventory', short: 'Mein/Crew', hintIn: ['normal'] },
  { id: 'search', label: 'T', keys: ['t'], action: 'focus-search', context: 'inventory',
    text: 'Zur Suche springen', short: 'Suche', hintIn: ['normal'] },
  { id: 'reset', label: 'R', keys: ['r'], action: 'reset-filters', context: 'inventory',
    text: 'Filter zurücksetzen', short: 'Filter zurücksetzen', hintIn: ['normal'] },
  { id: 'areas', label: '1 – 4', keys: ['1', '2', '3', '4'], action: 'goto', context: 'global',
    text: 'Bereich öffnen: 1 Dashboard, 2 Inventory, 3 Blueprints, 4 Fabricator', short: 'Bereich', hintIn: [] },
  { id: 'areas-soon', label: '5 / 6', keys: ['5', '6'], action: 'goto', context: 'global', soon: true,
    text: '5 Fleet und 6 Trading: BALD, noch ohne Wirkung', short: 'BALD', hintIn: [] },
  { id: 'esc-back', label: 'Esc', keys: ['Escape'], action: 'escape', context: 'inventory',
    text: 'Zuerst Bearbeiten abbrechen oder Rückfrage schließen, sonst eine Ebene zurück', short: 'zurück', hintIn: [] },
  { id: 'esc-edit', label: 'Esc', keys: ['Escape'], action: 'escape', context: 'inline-editor',
    text: 'Bearbeiten abbrechen (Buchstaben und Zahlen ruhen währenddessen)', short: 'abbrechen', hintIn: ['inline-editor'] },
  { id: 'esc-delete', label: 'Esc', keys: ['Escape'], action: 'escape', context: 'delete-confirm',
    text: 'Löschen-Rückfrage schließen (die Listen-Tasten ruhen währenddessen)', short: 'schließen', hintIn: ['delete-confirm'] },
]

export const KEY_HELP_CONTEXT_TITLES: Readonly<Record<KeyHelpContext, string>> = {
  global: 'Überall',
  inventory: 'Im Inventory',
  'mein-crew': 'Mein / Crew',
  'inline-editor': 'Beim Bearbeiten eines Lots',
  'delete-confirm': 'Bei der Löschen-Rückfrage',
}

export const KEY_HELP_CONTEXT_ORDER: readonly KeyHelpContext[] = ['global', 'inventory', 'mein-crew', 'inline-editor', 'delete-confirm']

export const KEY_HELP_FOOTNOTES: readonly string[] = [
  'Alles geht auch mit Tab, Enter und Leertaste.',
  'Buchstaben und Zahlen ruhen, solange du in einem Feld tippst.',
]

/**
 * Which hint-bar state applies. The Crew page is read-only: it has neither an
 * inline editor nor a delete question, so it always shows the normal keys.
 */
export function hintState(state: { page: 'own' | 'crew'; inlineEditorActive: boolean; deleteConfirmOpen: boolean }): HintState {
  if (state.page === 'crew') return 'normal'
  if (state.inlineEditorActive) return 'inline-editor'
  if (state.deleteConfirmOpen) return 'delete-confirm'
  return 'normal'
}

/** The entries the hint bar shows in the given page state. */
export function hintEntries(state: { page: 'own' | 'crew'; inlineEditorActive: boolean; deleteConfirmOpen: boolean }): KeyHelpEntry[] {
  const current = hintState(state)
  return KEY_HELP.filter((entry) => entry.hintIn.includes(current))
}

/** Entries of one context for the overview, in table order. */
export function entriesForContext(context: KeyHelpContext): KeyHelpEntry[] {
  return KEY_HELP.filter((entry) => entry.context === context)
}
