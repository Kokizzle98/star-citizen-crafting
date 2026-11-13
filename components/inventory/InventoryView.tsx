'use client'

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { submitInventoryLotDelete } from '@/app/vector/inventory/actions'
import { useUnitPreference } from '@/components/layout/UnitPreference'
import { QualityChip, QualityLegend } from '@/components/quality/QualityChip'
import { EditInventoryLotForm } from '@/components/inventory/EditInventoryLotForm'
import { inventoryEditInitialValue } from '@/lib/inventory/inventory-edit-display'
import { INVENTORY_ERROR_MESSAGES, INVENTORY_SUCCESS_MESSAGES, type InventoryErrorCode } from '@/lib/inventory/inventory-error-messages'
import type { InventoryLocationOption } from '@/lib/inventory/inventory-form-options'
import { formatQuantity, type UnitMode } from '@/lib/inventory/inventory-display'
import type { InventoryRow } from '@/lib/inventory/inventory-result'
import {
  filterInventoryRows,
  sortInventoryRows,
  type InventorySort,
} from '@/lib/inventory/inventory-search-filter-sort'
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

function materialKind(units: MaterialUnits, name: string) {
  return Object.hasOwn(units, name) ? units[name] : undefined
}

function Summary({ rows, units, mode }: { rows: InventoryRow[]; units: MaterialUnits; mode: UnitMode }) {
  const qualities = rows.map((row) => row.quality)
  return <span className="inventory-summary">
    <strong>{formatQuantity(rows, materialKind(units, rows[0].material), mode)}</strong>
    <span><QualityChip quality={Math.min(...qualities)} /> – <QualityChip quality={Math.max(...qualities)} /></span>
    <span>{rows.length} {rows.length === 1 ? 'Lot' : 'Lots'}</span>
  </span>
}

type Editing = {
  currentUserId: string | null
  locations: InventoryLocationOption[] | null
  editingLotId: string | null
  deletingLotId: string | null
  deleteCancelRef: RefObject<HTMLButtonElement>
  editTriggerRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  deleteTriggerRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  pending: boolean
  setPending: (pending: boolean) => void
  start: (id: string) => void
  cancel: () => void
  success: (code: 'LOT_UPDATED' | 'LOT_MERGED') => void
  startDelete: (id: string) => void
  cancelDelete: () => void
  confirmDelete: (id: string) => void
}

function Lots({ rows, units, mode, editing }: { rows: InventoryRow[]; units: MaterialUnits; mode: UnitMode; editing: Editing }) {
  return <div className="vector-inventory-table" role="region" aria-label="Lots" tabIndex={0}>
    <table>
      <thead><tr><th scope="col">Lot</th><th scope="col">Spieler</th><th scope="col">Menge</th><th scope="col">Qualität</th><th scope="col">Location</th><th scope="col">Aktion</th></tr></thead>
      <tbody>{rows.map((row) => {
        const initial = inventoryEditInitialValue(row, materialKind(units, row.material))
        const canEdit = editing.currentUserId !== null && row.owner_user_id === editing.currentUserId && initial && editing.locations
        const canDelete = editing.currentUserId !== null && row.owner_user_id === editing.currentUserId
        return <tr key={row.inventory_id}>
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
                  </>}</td>
            </>}
        </tr>
      })}</tbody>
    </table>
  </div>
}

export function InventoryView({ rows, units, metadataAvailable, currentUserId, locations: locationOptions }: {
  rows: InventoryRow[]
  units: MaterialUnits
  metadataAvailable: boolean
  currentUserId: string | null
  locations: InventoryLocationOption[] | null
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
  const editing: Editing = {
    currentUserId, locations: locationOptions, editingLotId, deletingLotId, deleteCancelRef, editTriggerRefs, deleteTriggerRefs, pending, setPending,
    start: (id) => { setSuccess(null); setError(null); setDeletingLotId(null); setEditingLotId(id) },
    cancel: () => { restoreEditFocusId.current = editingLotId; setEditingLotId(null) },
    success: (code) => { setEditingLotId(null); setSuccess(code); router.refresh() },
    startDelete: (id) => { setSuccess(null); setError(null); setEditingLotId(null); setDeletingLotId(id) },
    cancelDelete: () => { restoreDeleteFocusId.current = deletingLotId; setDeletingLotId(null); setError(null) },
    confirmDelete,
  }
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

  return <section className="inventory-view" aria-label="Crew Inventory">
    <div role="status">{success ? INVENTORY_SUCCESS_MESSAGES[success] : null}</div>
    {error && <div role="alert">{INVENTORY_ERROR_MESSAGES[error]}</div>}
    <div className="inventory-view__controls" role="group" aria-label="Inventory Ansicht">
      <button type="button" disabled={pending} aria-pressed={view === 'GLOBAL'} onClick={() => { setEditingLotId(null); setDeletingLotId(null); setError(null); setView('GLOBAL') }}>GLOBAL</button>
      <button type="button" disabled={pending} aria-pressed={view === 'LOCATION'} onClick={() => { setEditingLotId(null); setDeletingLotId(null); setError(null); setView('LOCATION') }}>LOCATION</button>
    </div>
    {!metadataAvailable && <p role="status">LIVE Materialdaten nicht verfügbar; Einheiten sind unbekannt.</p>}
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
        onClick={() => {
          setQuery('')
          setPlayerFilter('')
          setLocationFilter('')
          setQualityMin('')
          setQualityMax('')
          setSort('MATERIAL_ASC')
        }}
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

    {view === 'GLOBAL'
      ? materials(visibleRows).map((materialRows) => <details className="inventory-group" key={materialRows[0].material}>
          <summary><span>{materialRows[0].material}</span><Summary rows={materialRows} units={units} mode={mode} /></summary>
          <div className="inventory-group__children">
            {locations(materialRows).map((locationRows) => <details className="inventory-group" key={locationRows[0].location_id}>
              <summary><span>{locationRows[0].location_name}</span><Summary rows={locationRows} units={units} mode={mode} /></summary>
              <Lots rows={locationRows} units={units} mode={mode} editing={editing} />
            </details>)}
          </div>
        </details>)
      : locations(visibleRows).map((locationRows) => <details className="inventory-group" key={locationRows[0].location_id}>
          <summary><span>{locationRows[0].location_name}</span><span>{locationRows.length} {locationRows.length === 1 ? 'Lot' : 'Lots'}</span></summary>
          <div className="inventory-group__children">
            {materials(locationRows).map((materialRows) => <details className="inventory-group" key={materialRows[0].material}>
              <summary><span>{materialRows[0].material}</span><Summary rows={materialRows} units={units} mode={mode} /></summary>
              <Lots rows={materialRows} units={units} mode={mode} editing={editing} />
            </details>)}
          </div>
        </details>)}
  </section>
}
