// Global key set (INVENTORY_UX_V1_1 section 13.1) as pure functions.
//
// This file decides two things only: "should this key act?" and "which action
// does it mean?". It touches no DOM and no React, so the rules are testable.
// Everything reachable by these keys stays reachable by Tab, Enter and Space.

export type KeyAction =
  | { type: 'select-prev' }
  | { type: 'select-next' }
  | { type: 'open' }
  | { type: 'back' }
  | { type: 'view-prev' }
  | { type: 'view-next' }
  | { type: 'focus-search' }
  | { type: 'reset-filters' }
  | { type: 'goto'; digit: number }

/** The part of a KeyboardEvent the rules need. */
export type KeyEventLike = {
  key: string
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  isComposing?: boolean
}

/** The part of an element the rules need. */
export type TargetLike = {
  tagName?: string
  type?: string
  isContentEditable?: boolean
} | null

export type KeyContext = {
  /** An inline editor (lot edit) is open. */
  inlineEditorActive: boolean
  /** The account drawer is open. */
  accountDrawerOpen: boolean
  /** Element that has the focus. */
  target: TargetLike
}

const LETTER_ACTIONS: Readonly<Record<string, KeyAction>> = {
  w: { type: 'select-prev' },
  s: { type: 'select-next' },
  d: { type: 'open' },
  f: { type: 'open' },
  a: { type: 'back' },
  q: { type: 'view-prev' },
  e: { type: 'view-next' },
  t: { type: 'focus-search' },
  r: { type: 'reset-filters' },
}

// Inputs that take no typed text: letters do not collide with them.
const NON_TEXT_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'])

/** Ctrl, Alt or Meta is held: browser and system shortcuts must not be disturbed. */
export function hasCommandModifier(event: KeyEventLike): boolean {
  return Boolean(event.ctrlKey || event.altKey || event.metaKey)
}

/** Focus is in a text, number, search or select field (or any editable text). */
export function isTypingTarget(target: TargetLike): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = (target.tagName ?? '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') return !NON_TEXT_INPUT_TYPES.has((target.type ?? 'text').toLowerCase())
  return false
}

/** Letter and number keys act only outside typing, outside an inline editor, without Strg/Alt/Meta and with the account drawer closed. */
export function shouldHandleKey(event: KeyEventLike, context: KeyContext): boolean {
  if (event.isComposing) return false
  if (hasCommandModifier(event)) return false
  if (context.accountDrawerOpen) return false
  if (context.inlineEditorActive) return false
  if (isTypingTarget(context.target)) return false
  return true
}

/** Key -> action. Unknown keys (also 0, 7, 8, 9) mean nothing. */
export function keyAction(key: string): KeyAction | null {
  if (/^[1-6]$/.test(key)) return { type: 'goto', digit: Number(key) }
  return LETTER_ACTIONS[key.toLowerCase()] ?? null
}

/** Full decision for a letter or number key: the action, or null if the key must not act. */
export function resolveKey(event: KeyEventLike, context: KeyContext): KeyAction | null {
  if (!shouldHandleKey(event, context)) return null
  return keyAction(event.key)
}

/**
 * Number key -> route, by position in the navigation (the single source is
 * components/layout/navigation.ts). Entries that are not built yet (`soon` or
 * no route) ignore their key; so do positions that do not exist.
 */
export function routeForDigit(
  digit: number,
  navigation: readonly { href: string | null; soon: boolean }[],
): string | null {
  if (!Number.isInteger(digit) || digit < 1) return null
  const entry = navigation[digit - 1]
  if (!entry || entry.soon || entry.href === null) return null
  return entry.href
}

export type EscapeResult = 'cancel-edit' | 'close-transient' | 'back' | 'none'

/**
 * Esc order (section 13.1): first cancel an active inline edit, then close a
 * transient element; only when neither is active, Esc means "back one level".
 * While typing in a field, Esc is never "back" (the field keeps it).
 */
export function escapeAction(state: {
  inlineEditActive: boolean
  transientActive: boolean
  typing: boolean
}): EscapeResult {
  if (state.inlineEditActive) return 'cancel-edit'
  if (state.transientActive) return 'close-transient'
  if (state.typing) return 'none'
  return 'back'
}

/** Previous / next entry of a list. No wrap-around. Without a (valid) current entry: next = first, previous = last. */
export function moveSelection(keys: readonly string[], current: string | null, direction: 'prev' | 'next'): string | null {
  if (keys.length === 0) return null
  const index = current === null ? -1 : keys.indexOf(current)
  if (index === -1) return direction === 'next' ? keys[0] : keys[keys.length - 1]
  const next = direction === 'next' ? Math.min(index + 1, keys.length - 1) : Math.max(index - 1, 0)
  return keys[next]
}

/** One level deeper: append the entered group to the path. */
export function enterLevel(path: readonly string[], key: string): string[] {
  return [...path, key]
}

/** One level back: drop the last entered group. At the top level the path stays empty. */
export function leaveLevel(path: readonly string[]): string[] {
  return path.slice(0, -1)
}

/** Keeps the longest prefix of the path whose groups still exist and are open (filters, view switch or a click may have changed the tree). */
export function trimPath(path: readonly string[], isValid: (prefix: readonly string[], key: string) => boolean): string[] {
  for (let index = 0; index < path.length; index += 1) {
    if (!isValid(path.slice(0, index), path[index])) return path.slice(0, index)
  }
  return [...path]
}
