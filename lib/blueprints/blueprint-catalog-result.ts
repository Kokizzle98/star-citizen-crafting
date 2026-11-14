// Pure result validation and status derivation for the Blueprint UI
// (Blueprint Ownership / Tracking PR 4). No I/O and no runtime imports, so the
// module is directly testable and shared by the server boundaries and the view.
//
// Ownership semantics (owner contract): a personal ownership row means VECTOR
// knows the blueprint as owned; a missing row means "not known", never
// "not owned". The crew never owns blueprints; the crew status is a derived
// view. SELF has display priority over CREW.

export type BlueprintIssue =
  | 'PRODUCT_NAME_MISSING'
  | 'CIG_DATA_ERROR'
  | 'SOURCE_SUGGESTED_NAME'
  | 'RECIPE_MISSING'

export type BlueprintReviewState = 'VALID' | 'REVIEW_REQUIRED'

export type BlueprintCatalogRow = {
  blueprint_id: string
  source_tag: string
  product_name: string | null
  gear: string
  type: string | null
  subtype: string | null
  manufacturer: string | null
  review_state: BlueprintReviewState
  issues: BlueprintIssue[]
  scmdb_suggested_name: string | null
}

export type BlueprintDataset = {
  id: string
  version: string
  blueprintTotal: number
}

export type BlueprintCatalogResult =
  | { status: 'success'; dataset: BlueprintDataset; rows: BlueprintCatalogRow[] }
  | { status: 'no_active_dataset' }
  | { status: 'read_error' }

export type OwnBlueprintOwnershipResult =
  | { status: 'success'; ownedIds: string[] }
  | { status: 'read_error' }

/** Crew owner nicknames per blueprint id; only blueprints with at least one other crew owner. */
export type CrewBlueprintOwners = Record<string, string[]>

export type CrewBlueprintStatusResult =
  | { status: 'success'; crewOwners: CrewBlueprintOwners }
  | { status: 'no_active_crew' }
  | { status: 'not_allowed' }
  | { status: 'read_error' }

export type BlueprintOwnershipStatus = 'SELF' | 'CREW' | 'UNKNOWN'

export type BlueprintOwnershipErrorCode =
  | 'AUTH_REQUIRED'
  | 'BLUEPRINT_ID_INVALID'
  | 'BLUEPRINT_NOT_FOUND'
  | 'OWNERSHIP_ACTION_INVALID'
  | 'OWNERSHIP_UPDATE_FAILED'

export type BlueprintOwnershipSuccessCode = 'OWNERSHIP_MARKED' | 'OWNERSHIP_UNMARKED'

export type BlueprintOwnershipWriteResult =
  | { ok: true; code: BlueprintOwnershipSuccessCode; blueprintId: string; confirmedAt: number }
  | { ok: false; code: BlueprintOwnershipErrorCode }

/** The UI shows exactly one channel. PTU is out of scope; there is no cross-channel fallback. */
export const BLUEPRINT_UI_SOURCE = 'SCMDB'
export const BLUEPRINT_UI_CHANNEL = 'LIVE'

/** Page size for Supabase range reads (the API caps one response, by default at 1000 rows). */
export const BLUEPRINT_READ_PAGE_SIZE = 1000

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ISSUES: readonly BlueprintIssue[] = ['PRODUCT_NAME_MISSING', 'CIG_DATA_ERROR', 'SOURCE_SUGGESTED_NAME', 'RECIPE_MISSING']

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalText(value: unknown): value is string | null {
  return value === null || nonempty(value)
}

export function isBlueprintId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** Accepts a UUID in any letter case and returns its canonical lowercase form, or null. */
export function canonicalizeBlueprintId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const canonical = value.trim().toLowerCase()
  return UUID_PATTERN.test(canonical) ? canonical : null
}

export function activeBlueprintDatasetResult(
  data: unknown,
  error: { message: string } | null,
): { status: 'success'; dataset: BlueprintDataset } | { status: 'no_active_dataset' } | { status: 'read_error' } {
  if (error || !Array.isArray(data)) return { status: 'read_error' }
  if (data.length === 0) return { status: 'no_active_dataset' }
  // The partial unique index allows at most one ACTIVE dataset per channel;
  // anything else is not trusted.
  if (data.length !== 1) return { status: 'read_error' }
  const row = record(data[0])
  if (
    !row || !isBlueprintId(row.id) || row.source !== BLUEPRINT_UI_SOURCE ||
    row.channel !== BLUEPRINT_UI_CHANNEL || row.status !== 'ACTIVE' || !nonempty(row.version) ||
    typeof row.blueprint_total !== 'number' || !Number.isInteger(row.blueprint_total) || row.blueprint_total < 0
  ) return { status: 'read_error' }
  return { status: 'success', dataset: { id: row.id, version: row.version, blueprintTotal: row.blueprint_total } }
}

function catalogRow(value: unknown): BlueprintCatalogRow | null {
  const row = record(value)
  if (
    !row || !isBlueprintId(row.blueprint_id) || !nonempty(row.source_tag) ||
    !optionalText(row.product_name) || !nonempty(row.gear) || !optionalText(row.type) ||
    !optionalText(row.subtype) || !optionalText(row.manufacturer) ||
    !optionalText(row.scmdb_suggested_name) ||
    (row.review_state !== 'VALID' && row.review_state !== 'REVIEW_REQUIRED') ||
    !Array.isArray(row.issues) ||
    !row.issues.every((issue) => (ISSUES as readonly unknown[]).includes(issue))
  ) return null
  const issues = row.issues as BlueprintIssue[]
  // Same consistency rule as the database check constraint.
  if ((row.review_state === 'VALID') !== (issues.length === 0)) return null
  return {
    blueprint_id: row.blueprint_id,
    source_tag: row.source_tag,
    product_name: row.product_name,
    gear: row.gear,
    type: row.type,
    subtype: row.subtype,
    manufacturer: row.manufacturer,
    review_state: row.review_state,
    issues: [...issues],
    scmdb_suggested_name: row.scmdb_suggested_name,
  }
}

/** Validates every catalog row and requires exactly the dataset's declared blueprint count. */
export function blueprintCatalogResult(
  dataset: BlueprintDataset,
  data: unknown[],
): BlueprintCatalogResult {
  const rows: BlueprintCatalogRow[] = []
  const seen = new Set<string>()
  for (const value of data) {
    const row = catalogRow(value)
    if (!row || seen.has(row.blueprint_id)) return { status: 'read_error' }
    seen.add(row.blueprint_id)
    rows.push(row)
  }
  if (rows.length !== dataset.blueprintTotal) return { status: 'read_error' }
  return { status: 'success', dataset, rows }
}

export function ownBlueprintOwnershipResult(data: unknown[]): OwnBlueprintOwnershipResult {
  const ownedIds: string[] = []
  const seen = new Set<string>()
  for (const value of data) {
    const row = record(value)
    if (!row || !isBlueprintId(row.blueprint_id) || seen.has(row.blueprint_id)) return { status: 'read_error' }
    seen.add(row.blueprint_id)
    ownedIds.push(row.blueprint_id)
  }
  return { status: 'success', ownedIds }
}

/** Maps the crew RPC error contract (same as get_active_group_inventory()). */
export function crewBlueprintErrorResult(error: { message: string }): CrewBlueprintStatusResult {
  switch (error.message) {
    case 'ACTIVE_GROUP_REQUIRED': return { status: 'no_active_crew' }
    case 'ACTIVE_GROUP_NOT_ALLOWED':
    case 'AUTH_REQUIRED': return { status: 'not_allowed' }
    default: return { status: 'read_error' }
  }
}

/**
 * Validates the rows of get_active_crew_blueprint_status(). Only the other
 * members' nicknames are kept: the caller's own state always comes from the
 * personal ownership read, so the view stays usable without a crew.
 */
export function crewBlueprintStatusResult(data: unknown[]): CrewBlueprintStatusResult {
  const crewOwners: CrewBlueprintOwners = {}
  const seen = new Set<string>()
  for (const value of data) {
    const row = record(value)
    if (
      !row || !isBlueprintId(row.blueprint_id) || seen.has(row.blueprint_id) ||
      (row.status !== 'SELF' && row.status !== 'CREW') ||
      !Array.isArray(row.crew_owner_nicknames) || !row.crew_owner_nicknames.every(nonempty) ||
      (row.status === 'CREW' && row.crew_owner_nicknames.length === 0)
    ) return { status: 'read_error' }
    seen.add(row.blueprint_id)
    if (row.crew_owner_nicknames.length > 0) crewOwners[row.blueprint_id] = [...row.crew_owner_nicknames]
  }
  return { status: 'success', crewOwners }
}

/** SELF > CREW > UNKNOWN. UNKNOWN means "not known", never "not owned". */
export function deriveBlueprintStatus(
  ownedBySelf: boolean,
  crewNicknames: readonly string[] | undefined,
): BlueprintOwnershipStatus {
  if (ownedBySelf) return 'SELF'
  return crewNicknames && crewNicknames.length > 0 ? 'CREW' : 'UNKNOWN'
}

export function ownershipWriteErrorCode(error: { message?: string } | null | undefined): BlueprintOwnershipErrorCode {
  switch (error?.message) {
    case 'AUTH_REQUIRED': return 'AUTH_REQUIRED'
    case 'BLUEPRINT_NOT_FOUND': return 'BLUEPRINT_NOT_FOUND'
    default: return 'OWNERSHIP_UPDATE_FAILED'
  }
}

export type PageFetch = (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>

export type AllPagesResult =
  | { ok: true; rows: unknown[] }
  | { ok: false; error: { message: string } | null }

/**
 * Reads a range-paged result until a short page arrives. Fails closed on an
 * error, a malformed page or more than `maxPages` full pages.
 */
export async function readAllPages(
  fetchPage: PageFetch,
  pageSize: number,
  maxPages: number,
): Promise<AllPagesResult> {
  const rows: unknown[] = []
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { ok: false, error }
    if (!Array.isArray(data) || data.length > pageSize) return { ok: false, error: null }
    rows.push(...data)
    if (data.length < pageSize) return { ok: true, rows }
  }
  return { ok: false, error: null }
}
