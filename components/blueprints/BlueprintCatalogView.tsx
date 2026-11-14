'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { submitBlueprintOwnership } from '@/app/vector/blueprints/actions'
import {
  deriveBlueprintStatus,
  type BlueprintCatalogRow,
  type BlueprintOwnershipStatus,
  type CrewBlueprintStatusResult,
} from '@/lib/blueprints/blueprint-catalog-result'
import {
  BLUEPRINT_CREW_NOTICES,
  BLUEPRINT_ISSUE_MESSAGES,
  BLUEPRINT_NO_MANUFACTURER_LABEL,
  BLUEPRINT_NO_TYPE_LABEL,
  BLUEPRINT_OWN_READ_ERROR,
  BLUEPRINT_OWNERSHIP_ERROR_MESSAGES,
  BLUEPRINT_OWNERSHIP_SUCCESS_MESSAGES,
  BLUEPRINT_REVIEW_HELP,
  blueprintGearLabel,
  blueprintSuggestedNameMessage,
  blueprintTypeLabel,
} from '@/lib/blueprints/blueprint-messages'
import {
  BLUEPRINT_DISPLAY_STEP,
  EMPTY_BLUEPRINT_FILTERS,
  blueprintFilterOptions,
  filterBlueprintRows,
  nextBlueprintStep,
  sortBlueprintRows,
  toBlueprintListRows,
  type BlueprintFilters,
  type BlueprintListRow,
  type BlueprintSort,
} from '@/lib/blueprints/blueprint-search-filter-sort'

// Owner decision PR4-OD-01 = B: ownership changes only after a confirmed server
// result, never optimistically, and without reloading the catalog. Confirmed
// changes are also kept here for the browser session, so a page snapshot that a
// client-side navigation restores from the router cache cannot show an older
// state. A change is applied only when it was confirmed after the snapshot was
// loaded (both timestamps come from the server); older changes are dropped
// because the snapshot already contains them.
type ConfirmedChange = { owned: boolean; confirmedAt: number }
const confirmedChanges = new Map<string, Map<string, ConfirmedChange>>()

function initialOwned(ownedIds: string[], userId: string, loadedAt: number) {
  const owned = new Set(ownedIds)
  const changes = confirmedChanges.get(userId)
  if (changes) {
    for (const [blueprintId, change] of changes) {
      if (change.confirmedAt <= loadedAt) changes.delete(blueprintId)
      else if (change.owned) owned.add(blueprintId)
      else owned.delete(blueprintId)
    }
  }
  return owned
}

function rememberConfirmedChange(userId: string, blueprintId: string, owned: boolean, confirmedAt: number) {
  const changes = confirmedChanges.get(userId) ?? new Map<string, ConfirmedChange>()
  changes.set(blueprintId, { owned, confirmedAt })
  confirmedChanges.set(userId, changes)
}

type Announcement = { kind: 'success' | 'error'; text: string }

function StatusCell({ status, nicknames, available }: {
  status: BlueprintOwnershipStatus
  nicknames: string[]
  available: boolean
}) {
  if (!available) {
    return <span className="blueprint-status blueprint-status--unavailable">Status nicht verfügbar</span>
  }
  if (status === 'SELF') {
    return <>
      <span className="blueprint-status blueprint-status--self"><span aria-hidden="true">●</span> Du</span>
      {nicknames.length > 0 && <span className="blueprint-status__crew">auch: {nicknames.join(', ')}</span>}
    </>
  }
  if (status === 'CREW') {
    return <>
      <span className="blueprint-status blueprint-status--crew"><span aria-hidden="true">◆</span> Crew</span>
      <span className="blueprint-status__crew">{nicknames.join(', ')}</span>
    </>
  }
  return <span className="blueprint-status blueprint-status--unknown"><span aria-hidden="true">○</span> Nicht bekannt</span>
}

function ReviewNote({ row }: { row: BlueprintListRow }) {
  return <div className="blueprint-review">
    <span className="blueprint-review__chip"><span aria-hidden="true">⚠</span> Prüfung nötig</span>
    <ul className="blueprint-review__issues">
      {row.issues.map((issue) => <li key={issue}>
        {issue === 'SOURCE_SUGGESTED_NAME'
          ? blueprintSuggestedNameMessage(row.scmdb_suggested_name)
          : BLUEPRINT_ISSUE_MESSAGES[issue]}
      </li>)}
    </ul>
  </div>
}

export function BlueprintCatalogView({ rows, ownedIds, crew, currentUserId, loadedAt }: {
  rows: BlueprintCatalogRow[]
  /** null when the caller's own ownership could not be read. */
  ownedIds: string[] | null
  crew: CrewBlueprintStatusResult
  currentUserId: string
  loadedAt: number
}) {
  const ownershipAvailable = ownedIds !== null
  const [owned, setOwned] = useState(() => initialOwned(ownedIds ?? [], currentUserId, loadedAt))
  const [filters, setFilters] = useState<BlueprintFilters>(EMPTY_BLUEPRINT_FILTERS)
  const [sort, setSort] = useState<BlueprintSort>('NAME_ASC')
  const [limit, setLimit] = useState(BLUEPRINT_DISPLAY_STEP)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [focusCheck, setFocusCheck] = useState(0)
  const pendingRef = useRef(new Set<string>())
  const toggleRefs = useRef(new Map<string, HTMLButtonElement>())
  const lastActionId = useRef<string | null>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)

  const crewOwners = useMemo(() => crew.status === 'success' ? crew.crewOwners : {}, [crew])
  const statusOf = useCallback(
    (blueprintId: string) => deriveBlueprintStatus(owned.has(blueprintId), crewOwners[blueprintId]),
    [owned, crewOwners],
  )
  const listRows = useMemo(() => toBlueprintListRows(rows, blueprintGearLabel, blueprintTypeLabel), [rows])
  const options = useMemo(
    () => blueprintFilterOptions(listRows, BLUEPRINT_NO_TYPE_LABEL, BLUEPRINT_NO_MANUFACTURER_LABEL),
    [listRows],
  )
  const visibleRows = useMemo(
    () => sortBlueprintRows(filterBlueprintRows(listRows, filters, statusOf), sort),
    [listRows, filters, statusOf, sort],
  )
  const shownRows = visibleRows.slice(0, limit)
  const moreStep = nextBlueprintStep(visibleRows.length, limit)
  const hasReviewRows = shownRows.some((row) => row.review_state === 'REVIEW_REQUIRED')

  // After an action or "show more": keep focus where it is; only when the
  // focused control has disappeared (e.g. filtered out) move it to the result
  // summary instead of losing it to the document body.
  useEffect(() => {
    if (focusCheck === 0) return
    const id = lastActionId.current
    if (id !== null && toggleRefs.current.has(id)) return
    if (document.activeElement === null || document.activeElement === document.body) resultRef.current?.focus()
  }, [focusCheck])

  function updateFilters(patch: Partial<BlueprintFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
    setLimit(BLUEPRINT_DISPLAY_STEP)
  }

  async function toggleOwnership(row: BlueprintListRow) {
    const id = row.blueprint_id
    if (!ownershipAvailable || pendingRef.current.has(id)) return
    pendingRef.current.add(id)
    setPendingIds(new Set(pendingRef.current))
    setAnnouncement(null)
    const data = new FormData()
    data.set('blueprintId', id)
    data.set('intent', owned.has(id) ? 'UNMARK' : 'MARK')
    try {
      const result = await submitBlueprintOwnership(data)
      if (result.ok) {
        const nowOwned = result.code === 'OWNERSHIP_MARKED'
        setOwned((current) => {
          const next = new Set(current)
          if (nowOwned) next.add(id)
          else next.delete(id)
          return next
        })
        rememberConfirmedChange(currentUserId, id, nowOwned, result.confirmedAt)
        setAnnouncement({ kind: 'success', text: `${row.displayName}: ${BLUEPRINT_OWNERSHIP_SUCCESS_MESSAGES[result.code]}` })
      } else {
        setAnnouncement({ kind: 'error', text: `${row.displayName}: ${BLUEPRINT_OWNERSHIP_ERROR_MESSAGES[result.code]}` })
      }
    } catch (error) {
      console.error('Blueprint ownership update failed', error)
      setAnnouncement({ kind: 'error', text: `${row.displayName}: ${BLUEPRINT_OWNERSHIP_ERROR_MESSAGES.OWNERSHIP_UPDATE_FAILED}` })
    } finally {
      pendingRef.current.delete(id)
      setPendingIds(new Set(pendingRef.current))
      lastActionId.current = id
      setFocusCheck((value) => value + 1)
    }
  }

  return <section className="blueprint-catalog" aria-label="Blueprint-Katalog">
    <div role="status" className="blueprint-announcement">
      {announcement?.kind === 'success' ? announcement.text : null}
    </div>
    {announcement?.kind === 'error' && <div role="alert" className="blueprint-announcement blueprint-announcement--error">{announcement.text}</div>}

    {!ownershipAvailable && <p role="alert" className="blueprint-notice blueprint-notice--error">{BLUEPRINT_OWN_READ_ERROR}</p>}
    {crew.status !== 'success' && <p className="blueprint-notice">{BLUEPRINT_CREW_NOTICES[crew.status]}</p>}

    <div className="inventory-filter-controls blueprint-filter-controls" role="group" aria-label="Blueprints durchsuchen, filtern und sortieren">
      <div className="inventory-filter-controls__field inventory-filter-controls__search">
        <label htmlFor="blueprint-search">Suche</label>
        <input id="blueprint-search" type="search" value={filters.query}
          placeholder="Name, Tag, Hersteller oder Typ"
          onChange={(event) => updateFilters({ query: event.target.value })} />
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="blueprint-gear-filter">Bereich</label>
        <select id="blueprint-gear-filter" value={filters.gear} onChange={(event) => updateFilters({ gear: event.target.value })}>
          <option value="">Alle Bereiche</option>
          {options.gears.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="blueprint-type-filter">Typ</label>
        <select id="blueprint-type-filter" value={filters.type} onChange={(event) => updateFilters({ type: event.target.value })}>
          <option value="">Alle Typen</option>
          {options.types.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="blueprint-manufacturer-filter">Hersteller</label>
        <select id="blueprint-manufacturer-filter" value={filters.manufacturer} onChange={(event) => updateFilters({ manufacturer: event.target.value })}>
          <option value="">Alle Hersteller</option>
          {options.manufacturers.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="blueprint-ownership-filter">Besitz</label>
        <select id="blueprint-ownership-filter" value={filters.ownership} disabled={!ownershipAvailable}
          onChange={(event) => updateFilters({ ownership: event.target.value as BlueprintFilters['ownership'] })}>
          <option value="">Alle</option>
          <option value="SELF">Du</option>
          {crew.status === 'success' && <option value="CREW">Crew</option>}
          <option value="UNKNOWN">Nicht bekannt</option>
        </select>
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="blueprint-review-filter">Datenprüfung</label>
        <select id="blueprint-review-filter" value={filters.review}
          onChange={(event) => updateFilters({ review: event.target.value as BlueprintFilters['review'] })}>
          <option value="">Alle</option>
          <option value="REVIEW_REQUIRED">Prüfung nötig</option>
        </select>
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="blueprint-sort">Sortierung</label>
        <select id="blueprint-sort" value={sort} onChange={(event) => { setSort(event.target.value as BlueprintSort); setLimit(BLUEPRINT_DISPLAY_STEP) }}>
          <option value="NAME_ASC">Name A–Z</option>
          <option value="NAME_DESC">Name Z–A</option>
          <option value="MANUFACTURER_ASC">Hersteller A–Z</option>
          <option value="TYPE_ASC">Typ A–Z</option>
        </select>
      </div>

      <button type="button" onClick={() => { updateFilters(EMPTY_BLUEPRINT_FILTERS); setSort('NAME_ASC') }}>
        Filter zurücksetzen
      </button>
    </div>

    <p ref={resultRef} tabIndex={-1} className="inventory-filter-result" role="status">
      {visibleRows.length} von {rows.length} Blueprints{visibleRows.length > 0 ? ` · ${shownRows.length} angezeigt` : ''}
    </p>

    {hasReviewRows && <p className="blueprint-legend">
      <span className="blueprint-review__chip"><span aria-hidden="true">⚠</span> Prüfung nötig</span> {BLUEPRINT_REVIEW_HELP}
    </p>}

    {visibleRows.length === 0
      ? <p className="inventory-filter-empty">Keine Blueprints entsprechen den aktuellen Filtern.</p>
      : <div className="vector-inventory-table blueprint-table" role="region" aria-label="Blueprints" tabIndex={0}>
          <table>
            <thead><tr>
              <th scope="col">Blueprint</th><th scope="col">Typ</th><th scope="col">Hersteller</th>
              <th scope="col">Besitz</th><th scope="col">Aktion</th>
            </tr></thead>
            <tbody>{shownRows.map((row) => {
              const ownedBySelf = owned.has(row.blueprint_id)
              const pending = pendingIds.has(row.blueprint_id)
              return <tr key={row.blueprint_id}>
                <td>
                  <span className="blueprint-name">{row.displayName}</span>
                  {row.product_name === null
                    ? <span className="blueprint-meta">Name fehlt in SCMDB · Tag wird angezeigt</span>
                    : <span className="blueprint-meta blueprint-tag">{row.source_tag}</span>}
                  {row.review_state === 'REVIEW_REQUIRED' && <ReviewNote row={row} />}
                </td>
                <td>
                  {row.typeLabel}{row.subtype ? ` · ${row.subtype}` : ''}
                  <span className="blueprint-meta">{row.gearLabel}</span>
                </td>
                <td>{row.manufacturer ?? <span className="blueprint-muted">{BLUEPRINT_NO_MANUFACTURER_LABEL}</span>}</td>
                <td>
                  <StatusCell status={statusOf(row.blueprint_id)} nicknames={crewOwners[row.blueprint_id] ?? []}
                    available={ownershipAvailable} />
                </td>
                <td>
                  <button type="button" className="blueprint-toggle"
                    ref={(element) => {
                      if (element) toggleRefs.current.set(row.blueprint_id, element)
                      else toggleRefs.current.delete(row.blueprint_id)
                    }}
                    aria-pressed={ownershipAvailable ? ownedBySelf : undefined}
                    aria-label={`Besitze ich: ${row.displayName}`}
                    aria-busy={pending || undefined}
                    aria-disabled={pending || undefined}
                    disabled={!ownershipAvailable}
                    onClick={() => { void toggleOwnership(row) }}>
                    {pending
                      ? 'Speichert…'
                      : <><span aria-hidden="true">{ownedBySelf ? '✓' : '+'}</span> Besitze ich</>}
                  </button>
                </td>
              </tr>
            })}</tbody>
          </table>
        </div>}

    {moreStep > 0 && <button type="button" className="blueprint-more"
      onClick={() => { lastActionId.current = null; setLimit((current) => current + BLUEPRINT_DISPLAY_STEP); setFocusCheck((value) => value + 1) }}>
      Weitere {moreStep} anzeigen
    </button>}
  </section>
}
