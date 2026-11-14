// Round trip Crew Inventory -> Mein Inventory (editor of one own lot) -> back
// (INVENTORY_UX_V1_2 sections 3.1, 18 no. 22 and 23). Pure functions only:
// the position of the Crew page is saved before the jump and restored after
// saving or cancelling. Nothing here reads or writes inventory data.
//
// - The URL carries only a short marker (`from=crew` plus the `#lot-<id>` anchor
//   that already exists, and `return=<id>` for the way back). No names, no
//   user ids, no position data.
// - The position itself lives in sessionStorage, one key per lot, valid for one
//   round trip (it is deleted when read) and for a limited time.
// - sessionStorage may be missing, empty, full or throw: every access is guarded
//   and the fallback is always "top of Crew Inventory".

export const RETURN_STATE_TTL_MS = 15 * 60 * 1000
const MAX_ENTRIES = 500
const MAX_KEY_LENGTH = 300

export const CREW_PATH = '/vector/inventory/crew'
export const OWN_PATH = '/vector/inventory'

export type ReturnView = 'GLOBAL' | 'LOCATION'

export type ReturnState = {
  v: 1
  savedAt: number
  view: ReturnView
  /** Open groups (the view's own group ids). */
  open: string[]
  /** Entered groups (the key selection path). */
  path: string[]
  selected: string | null
  scrollY: number
}

export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** An inventory id as the app uses it: digits without leading zero. */
export function isLotId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value)
}

/** Link of the edit symbol on Crew Inventory. */
export function editLinkHref(lotId: string): string {
  return `${OWN_PATH}?from=crew#lot-${lotId}`
}

/** Lot to edit if (and only if) the URL carries the crew marker and a lot anchor. */
export function parseEditMarker(search: string, hash: string): string | null {
  if (new URLSearchParams(search).get('from') !== 'crew') return null
  const match = /^#lot-([1-9]\d{0,17})$/.exec(hash)
  return match ? match[1] : null
}

/** Way back: Crew Inventory with the marker for the lot that was edited. */
export function returnHref(lotId: string): string {
  return `${CREW_PATH}?return=${lotId}`
}

/** Lot id of the return marker on Crew Inventory, or null. */
export function parseReturnMarker(search: string): string | null {
  const value = new URLSearchParams(search).get('return')
  return isLotId(value) ? value : null
}

export function returnStorageKey(lotId: string): string {
  return `vector.inventory.return.${lotId}`
}

export function buildReturnState(input: Omit<ReturnState, 'v' | 'savedAt'>, now: number): ReturnState {
  return { v: 1, savedAt: now, ...input }
}

export function serializeReturnState(state: ReturnState): string {
  return JSON.stringify(state)
}

function isKeyList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_ENTRIES
    && value.every((entry) => typeof entry === 'string' && entry.length <= MAX_KEY_LENGTH)
}

/** Reads a saved state. Anything unexpected, wrong or too old gives null. */
export function parseReturnState(text: string | null, now: number): ReturnState | null {
  if (text === null) return null
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (typeof raw !== 'object' || raw === null) return null
  const state = raw as Record<string, unknown>
  if (state.v !== 1) return null
  const savedAt = state.savedAt
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null
  if (now - savedAt > RETURN_STATE_TTL_MS || savedAt - now > 60_000) return null
  if (state.view !== 'GLOBAL' && state.view !== 'LOCATION') return null
  if (!isKeyList(state.open) || !isKeyList(state.path)) return null
  const selected = state.selected
  if (selected !== null && (typeof selected !== 'string' || selected.length > MAX_KEY_LENGTH)) return null
  const scrollY = state.scrollY
  if (typeof scrollY !== 'number' || !Number.isFinite(scrollY) || scrollY < 0) return null
  return { v: 1, savedAt, view: state.view, open: state.open, path: state.path, selected, scrollY }
}

/** Saves the position for one lot. Returns false if it could not be saved (then the way back leads to the top). */
export function saveReturnState(storage: StorageLike | null, lotId: string, state: ReturnState): boolean {
  if (storage === null || !isLotId(lotId)) return false
  try {
    storage.setItem(returnStorageKey(lotId), serializeReturnState(state))
    return true
  } catch {
    return false
  }
}

/** Reads and deletes the saved position (one round trip only). Missing or broken storage gives null. */
export function takeReturnState(storage: StorageLike | null, lotId: string, now: number): ReturnState | null {
  if (storage === null || !isLotId(lotId)) return null
  const key = returnStorageKey(lotId)
  let text: string | null = null
  try { text = storage.getItem(key) } catch { text = null }
  discardReturnState(storage, lotId)
  return parseReturnState(text, now)
}

export function discardReturnState(storage: StorageLike | null, lotId: string): void {
  if (storage === null || !isLotId(lotId)) return
  try { storage.removeItem(returnStorageKey(lotId)) } catch { /* nothing to clean up */ }
}
