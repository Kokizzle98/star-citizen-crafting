'use client'

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitInventoryLotDelete } from '@/app/vector/inventory/actions'
import { useUnitPreference } from '@/components/layout/UnitPreference'
import { InventoryKpiStrip } from '@/components/inventory/InventoryKpiStrip'
import { InventoryCrewOverview } from '@/components/inventory/InventoryCrewOverview'
import { QualityChip, QualityLegend } from '@/components/quality/QualityChip'
import { EditInventoryLotForm } from '@/components/inventory/EditInventoryLotForm'
import { useInventoryKeys } from '@/components/inventory/useInventoryKeys'
import { inventoryEditInitialValue } from '@/lib/inventory/inventory-edit-display'
import { INVENTORY_ERROR_MESSAGES, INVENTORY_SUCCESS_MESSAGES, type InventoryErrorCode } from '@/lib/inventory/inventory-error-messages'
import type { InventoryLocationOption } from '@/lib/inventory/inventory-form-options'
import { formatQuantity, type UnitMode } from '@/lib/inventory/inventory-display'
import { materialPlayerCount, playerCountLabel } from '@/lib/inventory/inventory-crew-overview'
import type { InventoryRow } from '@/lib/inventory/inventory-result'
import {
  filterInventoryRows,
  sortInventoryRows,
  type InventorySort,
} from '@/lib/inventory/inventory-search-filter-sort'
import { depthLabel, materialAverageQuality, materialKindOf, qualityRange } from '@/lib/inventory/inventory-summary'
import type { MaterialUnits } from '@/lib/inventory/material-units'

function groupBy(rows: InventoryRow[], key: (row: InventoryRow) => string) {
  const groups = new Map<string, InventoryRow[]>()
  for (const row of rows) {
    const id = key(row)
    const group = groups.get(id)
    if (group) group.push(row)
    else groups.set(id, [row])
  }
  return [...groups.values()].sort((a, b) => key(a[0]).localeCompare(key(b[0]), 'de'))
}

const materialKind = materialKindOf

/** Summary of the rows of ONE material (material row, or location row inside a material). */
function Summary({ rows, units, mode, showPlayers = false }: { rows: InventoryRow[]; units: MaterialUnits; mode: UnitMode; showPlayers?: boolean }) {
  const kind = materialKind(units, rows[0].material)
  const average = materialAverageQuality(rows, kind)
  const range = qualityRange(rows)
  return <span className="inventory-summary">
    <strong>{formatQuantity(rows, kind, mode)}</strong>
    <span><abbr title="Durchschnittsqualität, nach Menge gewichtet">Ø</abbr> {average === null ? '–' : <QualityChip quality={average} />}</span>
    {range && <span><QualityChip quality={range.min} /> – <QualityChip quality={range.max} /></span>}
    {showPlayers && <span>{playerCountLabel(materialPlayerCount(rows))}</span>}
    <span>{rows.length} {rows.length === 1 ? 'Lot' : 'Lots'}</span>
  </span>
}

/** A collapsible group whose open state lives in the view (needed for the depth indicator and the anchor jump). */
function Group({ id, open, selected, onOpenChange, title, summary, children }: {
  id: string
  selected: boolean
  open: ReadonlySet<string>
  onOpenChange: (id: string, open: boolean) => void
  title: string
  summary: React.ReactNode
  children: React.ReactNode
}) {
  return <details className="inventory-group" open={open.has(id)} onToggle={(event) => onOpenChange(id, event.currentTarget.open)}>
    <summary data-key-selected={selected ? 'true' : undefined}><span>{title}</span>{summary}</summary>
    {children}
  </details>
}

type Editing = {
  currentUserId: string | null
  /** Crew page only (read-only): id of the viewer for the "own lot" link. `undefined` = not the crew page. */
  crewViewerUserId: string | null | undefined
  locations: InventoryLocationOption[] | null
  editingLotId: string | null
  deletingLotId: string | null
  deleteCancelRef: RefObject<HTMLButtonElement>
  editTriggerRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  deleteTriggerRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  /** Lot to highlight briefly after an anchor jump. */
  highlightLotId: string | null
  /** Entry selected with the keys W / S (section 13.1); a lot key is `lot:<id>`. */
  selectedKey: string | null
  pending: boolean
  setPending: (pending: boolean) => void
  start: (id: string) => void
  cancel: () => void
  success: (code: 'LOT_UPDATED' | 'LOT_MERGED') => void
  startDelete: (id: string) => void
  cancelDelete: () => void
  confirmDelete: (id: string) => void
}

const lotKey = (row: InventoryRow) => `lot:${row.inventory_id}`

function Lots({ rows, units, mode, editing }: { rows: InventoryRow[]; units: MaterialUnits; mode: UnitMode; editing: Editing }) {
  return <div className="vector-inventory-table" role="region" aria-label="Lots" tabIndex={0}>
    <table>
      <thead><tr><th scope="col">Lot</th><th scope="col">Spieler</th><th scope="col">Menge</th><th scope="col">Qualität</th><th scope="col">Location</th><th scope="col">Aktion</th></tr></thead>
      <tbody>{rows.map((row) => {
        const initial = inventoryEditInitialValue(row, materialKind(units, row.material))
        const canEdit = editing.currentUserId !== null && row.owner_user_id === editing.currentUserId && initial && editing.locations
        const canDelete = editing.currentUserId !== null && row.owner_user_id === editing.currentUserId
        return <tr key={row.inventory_id} id={`lot-${row.inventory_id}`} className={editing.highlightLotId === row.inventory_id ? 'inventory-lot--highlight' : undefined}
          data-key-selected={editing.selectedKey === lotKey(row) ? 'true' : undefined}>
          {editing.editingLotId === row.inventory_id && canEdit && editing.locations
            ? <td colSpan={6}><EditInventoryLotForm key={row.inventory_id} row={row} initial={initial} locations={editing.locations}
                pending={editing.pending} setPending={editing.setPending} onCancel={editing.cancel} onSuccess={editing.success} /></td>
            : <>
              <td>#{row.inventory_id}</td><td>{row.player_name}</td>
              <td>{materialKind(units, row.material) ? formatQuantity([row], materialKind(units, row.material), mode) : `${row.amount} (Einheit unbekannt)`}</td>
              <td><QualityChip quality={row.quality} /></td><td>{row.location_name}</td>
              <td>{editing.deletingLotId === row.inventory_id && canDelete
                ? <div role="group" aria-labelledby={`delete-question-${row.inventory_id}`}>
                    <p id={`delete-question-${row.inventory_id}`}>Lot #{row.inventory_id} ({row.material}) löschen?</p>
                    <button type="button" ref={editing.deleteCancelRef} aria-describedby={`delete-question-${row.inventory_id}`} disabled={editing.pending} onClick={editing.cancelDelete}>Abbrechen</button>
                    <button type="button" aria-describedby={`delete-question-${row.inventory_id}`} disabled={editing.pending} onClick={() => editing.confirmDelete(row.inventory_id)}>Löschen</button>
                  </div>
                : <>
                    {canEdit && <button type="button" ref={(element) => {
                      if (element) editing.editTriggerRefs.current.set(row.inventory_id, element)
                      else editing.editTriggerRefs.current.delete(row.inventory_id)
                    }} disabled={editing.pending} onClick={() => editing.start(row.inventory_id)}>Bearbeiten</button>}
                    {canDelete && <button type="button" ref={(element) => {
                      if (element) editing.deleteTriggerRefs.current.set(row.inventory_id, element)
                      else editing.deleteTriggerRefs.current.delete(row.inventory_id)
                    }} disabled={editing.pending} onClick={() => editing.startDelete(row.inventory_id)}>Löschen</button>}
                    {editing.crewViewerUserId !== undefined && (row.owner_user_id === editing.crewViewerUserId
                      ? <Link href={`/vector/inventory#lot-${row.inventory_id}`}>In Mein Inventory bearbeiten</Link>
                      : <span>Nur ansehen</span>)}
                  </>}</td>
            </>}
        </tr>
      })}</tbody>
    </table>
  </div>
}

export function InventoryView({ rows, units, metadataAvailable, currentUserId, locations: locationOptions, label, crewViewerUserId }: {
  rows: InventoryRow[]
  units: MaterialUnits
  metadataAvailable: boolean
  currentUserId: string | null
  locations: InventoryLocationOption[] | null
  /** Accessible name of the page section ("Mein Inventory" / "Crew Inventory"). */
  label: string
  /** Crew page only: read-only mode. Pass `currentUserId={null}`; this id only marks own lots with a link. */
  crewViewerUserId?: string | null
}) {
  const [view, setView] = useState<'GLOBAL' | 'LOCATION'>('GLOBAL')
  const [query, setQuery] = useState('')
  const [playerFilter, setPlayerFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [qualityMin, setQualityMin] = useState('')
  const [qualityMax, setQualityMax] = useState('')
  const [sort, setSort] = useState<InventorySort>('MATERIAL_ASC')
  const [editingLotId, setEditingLotId] = useState<string | null>(null)
  const [deletingLotId, setDeletingLotId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())
  const [highlightLotId, setHighlightLotId] = useState<string | null>(null)
  const [success, setSuccess] = useState<'LOT_UPDATED' | 'LOT_MERGED' | 'LOT_DELETED' | null>(null)
  const [error, setError] = useState<InventoryErrorCode | null>(null)
  const deletePending = useRef(false)
  const deleteCancelRef = useRef<HTMLButtonElement>(null)
  const editTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const restoreEditFocusId = useRef<string | null>(null)
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const restoreDeleteFocusId = useRef<string | null>(null)
  const router = useRouter()
  useEffect(() => {
    if (editingLotId === null && restoreEditFocusId.current !== null) {
      editTriggerRefs.current.get(restoreEditFocusId.current)?.focus()
      restoreEditFocusId.current = null
    }
  }, [editingLotId])
  useEffect(() => {
    if (deletingLotId !== null) {
      deleteCancelRef.current?.focus()
    } else if (restoreDeleteFocusId.current !== null) {
      deleteTriggerRefs.current.get(restoreDeleteFocusId.current)?.focus()
      restoreDeleteFocusId.current = null
    }
  }, [deletingLotId])
  async function confirmDelete(id: string) {
    if (pending || deletePending.current || deletingLotId !== id) return
    deletePending.current = true
    setPending(true)
    setError(null)
    const data = new FormData()
    data.set('inventoryId', id)
    try {
      const result = await submitInventoryLotDelete(data)
      if (result.ok) {
        setDeletingLotId(null)
        setSuccess(result.code)
        router.refresh()
      } else setError(result.code)
    } catch (error) {
      console.error('Inventory lot delete failed', error)
      setError('DELETE_FAILED')
    } finally {
      deletePending.current = false
      setPending(false)
    }
  }
  const setGroupOpen = (id: string, open: boolean) => setOpenGroups((previous) => {
    if (previous.has(id) === open) return previous
    const next = new Set(previous)
    if (open) next.add(id)
    else next.delete(id)
    return next
  })
  // Anchor jump (/vector/inventory#lot-<id>): open the groups that contain the
  // lot in both views, then scroll to it and highlight it briefly. A hash for
  // an unknown lot does nothing.
  const anchorHandled = useRef(false)
  const [anchorLotId, setAnchorLotId] = useState<string | null>(null)
  useEffect(() => {
    if (anchorHandled.current) return
    anchorHandled.current = true
    const match = /^#lot-([1-9]\d*)$/.exec(window.location.hash)
    const row = match ? rows.find((candidate) => candidate.inventory_id === match[1]) : undefined
    if (!row) return
    setOpenGroups(new Set([
      `G:m:${row.material}`,
      `L:m:${row.material}`,
      `L:l:${row.material}|${row.location_id}`,
    ]))
    setAnchorLotId(row.inventory_id)
  }, [rows])
  useEffect(() => {
    if (anchorLotId === null) return
    document.getElementById(`lot-${anchorLotId}`)?.scrollIntoView({ block: 'center' })
    setHighlightLotId(anchorLotId) // the highlight fades out by CSS animation, no timer
  }, [anchorLotId])
  const { mode } = useUnitPreference()
  const materials = (entries: InventoryRow[]) => groupBy(entries, (row) => row.material)
  const locations = (entries: InventoryRow[]) => groupBy(entries, (row) => row.location_id)
  const players = [...new Set(rows.map((row) => row.player_name))]
    .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))
  const filterLocations = [...new Map(
    rows.map((row) => [row.location_id, row.location_name] as const),
  ).entries()].sort((a, b) => a[1].localeCompare(b[1], 'de', { sensitivity: 'base' }))
  const parsedQualityMin = /^(?:0|[1-9]\d{0,2}|1000)$/.test(qualityMin) ? Number(qualityMin) : null
  const parsedQualityMax = /^(?:0|[1-9]\d{0,2}|1000)$/.test(qualityMax) ? Number(qualityMax) : null
  const visibleRows = sortInventoryRows(filterInventoryRows(rows, {
    query,
    player: playerFilter,
    locationId: locationFilter,
    qualityMin: parsedQualityMin,
    qualityMax: parsedQualityMax,
  }), sort)
  const materialGroups = materials(visibleRows)
  const materialOpen = materialGroups.some((group) => openGroups.has(`${view === 'GLOBAL' ? 'G' : 'L'}:m:${group[0].material}`))
  const locationOpen = view === 'LOCATION' && materialGroups.some((group) =>
    openGroups.has(`L:m:${group[0].material}`) &&
    locations(group).some((locationRows) => openGroups.has(`L:l:${group[0].material}|${locationRows[0].location_id}`)))

  const resetFilters = () => {
    setQuery('')
    setPlayerFilter('')
    setLocationFilter('')
    setQualityMin('')
    setQualityMax('')
    setSort('MATERIAL_ASC')
  }
  // Entries of the list below a path of entered groups, in the order they are drawn (keys W / S / D / F / A).
  const groupPrefix = view === 'GLOBAL' ? 'G' : 'L'
  const materialKey = (rowsOfMaterial: InventoryRow[]) => `${groupPrefix}:m:${rowsOfMaterial[0].material}`
  const locationKey = (rowsOfLocation: InventoryRow[]) => `L:l:${rowsOfLocation[0].material}|${rowsOfLocation[0].location_id}`
  const childKeys = (path: readonly string[]): string[] | null => {
    if (path.length === 0) return materialGroups.map(materialKey)
    const material = materialGroups.find((group) => materialKey(group) === path[0])
    if (!material) return null
    if (path.length === 1) return view === 'GLOBAL' ? material.map(lotKey) : locations(material).map(locationKey)
    if (view === 'GLOBAL' || path.length > 2) return null
    const location = locations(material).find((group) => locationKey(group) === path[1])
    return location ? location.map(lotKey) : null
  }
  const { selectedKey } = useInventoryKeys({
    childKeys,
    openGroups,
    setGroupOpen,
    inlineEditActive: editingLotId !== null,
    transientActive: deletingLotId !== null,
    cancelEdit: () => editing.cancel(),
    cancelTransient: () => editing.cancelDelete(),
    blocked: pending,
    resetFilters,
  })

  const editing: Editing = {
    currentUserId, crewViewerUserId, locations: locationOptions, highlightLotId, selectedKey, editingLotId, deletingLotId, deleteCancelRef, editTriggerRefs, deleteTriggerRefs, pending, setPending,
    start: (id) => { setSuccess(null); setError(null); setDeletingLotId(null); setEditingLotId(id) },
    cancel: () => { restoreEditFocusId.current = editingLotId; setEditingLotId(null) },
    success: (code) => { setEditingLotId(null); setSuccess(code); router.refresh() },
    startDelete: (id) => { setSuccess(null); setError(null); setEditingLotId(null); setDeletingLotId(id) },
    cancelDelete: () => { restoreDeleteFocusId.current = deletingLotId; setDeletingLotId(null); setError(null) },
    confirmDelete,
  }
  return <section className="inventory-view" aria-label={label}>
    <div role="status">{success ? INVENTORY_SUCCESS_MESSAGES[success] : null}</div>
    {error && <div role="alert">{INVENTORY_ERROR_MESSAGES[error]}</div>}
    <div className="inventory-view__controls" role="group" aria-label="Inventory Ansicht">
      <button type="button" disabled={pending} aria-pressed={view === 'GLOBAL'} onClick={() => { setEditingLotId(null); setDeletingLotId(null); setError(null); setView('GLOBAL') }}>GLOBAL</button>
      <button type="button" disabled={pending} aria-pressed={view === 'LOCATION'} onClick={() => { setEditingLotId(null); setDeletingLotId(null); setError(null); setView('LOCATION') }}>LOCATION</button>
    </div>
    {!metadataAvailable && <p role="status">LIVE Materialdaten nicht verfügbar; Einheiten sind unbekannt.</p>}
    <InventoryKpiStrip rows={visibleRows} units={units} crew={crewViewerUserId !== undefined} />
    {crewViewerUserId !== undefined && <InventoryCrewOverview rows={visibleRows} units={units} />}
    <div className="inventory-filter-controls" aria-label="Inventory durchsuchen, filtern und sortieren">
      <div className="inventory-filter-controls__field inventory-filter-controls__search">
        <label htmlFor="inventory-search">Suche</label>
        <input
          id="inventory-search"
          type="search"
          value={query}
          placeholder="Material, Spieler oder Location"
          disabled={pending}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="inventory-player-filter">Spieler</label>
        <select
          id="inventory-player-filter"
          value={playerFilter}
          disabled={pending}
          onChange={(event) => setPlayerFilter(event.target.value)}
        >
          <option value="">Alle Spieler</option>
          {players.map((player) => <option key={player} value={player}>{player}</option>)}
        </select>
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="inventory-location-filter">Location</label>
        <select
          id="inventory-location-filter"
          value={locationFilter}
          disabled={pending}
          onChange={(event) => setLocationFilter(event.target.value)}
        >
          <option value="">Alle Locations</option>
          {filterLocations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="inventory-quality-min">Qualität von</label>
        <input
          id="inventory-quality-min"
          inputMode="numeric"
          value={qualityMin}
          placeholder="0"
          disabled={pending}
          aria-invalid={qualityMin !== '' && parsedQualityMin === null}
          onChange={(event) => setQualityMin(event.target.value)}
        />
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="inventory-quality-max">Qualität bis</label>
        <input
          id="inventory-quality-max"
          inputMode="numeric"
          value={qualityMax}
          placeholder="1000"
          disabled={pending}
          aria-invalid={qualityMax !== '' && parsedQualityMax === null}
          onChange={(event) => setQualityMax(event.target.value)}
        />
      </div>

      <div className="inventory-filter-controls__field">
        <label htmlFor="inventory-sort">Sortierung</label>
        <select
          id="inventory-sort"
          value={sort}
          disabled={pending}
          onChange={(event) => setSort(event.target.value as InventorySort)}
        >
          <option value="MATERIAL_ASC">Material A–Z</option>
          <option value="MATERIAL_DESC">Material Z–A</option>
          <option value="LOCATION_ASC">Location A–Z</option>
          <option value="LOCATION_DESC">Location Z–A</option>
          <option value="QUALITY_ASC">Qualität aufsteigend</option>
          <option value="QUALITY_DESC">Qualität absteigend</option>
          <option value="UPDATED_DESC">Zuletzt aktualisiert</option>
          <option value="UPDATED_ASC">Älteste Aktualisierung</option>
        </select>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={resetFilters}
      >
        Filter zurücksetzen
      </button>
    </div>

    <p className="inventory-filter-result" role="status">
      {visibleRows.length} von {rows.length} {rows.length === 1 ? 'Lot' : 'Lots'}
    </p>
    <QualityLegend />

    {visibleRows.length === 0
      ? <p className="inventory-filter-empty">Keine Lots entsprechen den aktuellen Filtern.</p>
      : null}

    {visibleRows.length > 0 && <p className="inventory-depth" role="status">{depthLabel(view, materialOpen, locationOpen)}</p>}

    {view === 'GLOBAL'
      ? materialGroups.map((materialRows) => <Group key={materialRows[0].material} id={`G:m:${materialRows[0].material}`} selected={selectedKey === materialKey(materialRows)}
          open={openGroups} onOpenChange={setGroupOpen} title={materialRows[0].material}
          summary={<Summary rows={materialRows} units={units} mode={mode} showPlayers={crewViewerUserId !== undefined} />}>
          <Lots rows={materialRows} units={units} mode={mode} editing={editing} />
        </Group>)
      : materialGroups.map((materialRows) => <Group key={materialRows[0].material} id={`L:m:${materialRows[0].material}`} selected={selectedKey === materialKey(materialRows)}
          open={openGroups} onOpenChange={setGroupOpen} title={materialRows[0].material}
          summary={<Summary rows={materialRows} units={units} mode={mode} showPlayers={crewViewerUserId !== undefined} />}>
          <div className="inventory-group__children">
            {locations(materialRows).map((locationRows) => <Group key={locationRows[0].location_id}
              id={`L:l:${materialRows[0].material}|${locationRows[0].location_id}`} selected={selectedKey === locationKey(locationRows)}
              open={openGroups} onOpenChange={setGroupOpen} title={locationRows[0].location_name}
              summary={<Summary rows={locationRows} units={units} mode={mode} />}>
              <Lots rows={locationRows} units={units} mode={mode} editing={editing} />
            </Group>)}
          </div>
        </Group>)}
  </section>
}
