'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUnitPreference } from '@/components/layout/UnitPreference'
import { EditInventoryLotForm } from '@/components/inventory/EditInventoryLotForm'
import { inventoryEditInitialValue } from '@/lib/inventory/inventory-edit-display'
import { INVENTORY_SUCCESS_MESSAGES } from '@/lib/inventory/inventory-error-messages'
import type { InventoryLocationOption } from '@/lib/inventory/inventory-form-options'
import { formatQuantity, type UnitMode } from '@/lib/inventory/inventory-display'
import type { InventoryRow } from '@/lib/inventory/inventory-result'
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
    <span>Q{Math.min(...qualities)}–Q{Math.max(...qualities)}</span>
    <span>{rows.length} {rows.length === 1 ? 'Lot' : 'Lots'}</span>
  </span>
}

type Editing = {
  currentUserId: string | null
  locations: InventoryLocationOption[] | null
  editingLotId: string | null
  pending: boolean
  setPending: (pending: boolean) => void
  start: (id: string) => void
  cancel: () => void
  success: () => void
}

function Lots({ rows, units, mode, editing }: { rows: InventoryRow[]; units: MaterialUnits; mode: UnitMode; editing: Editing }) {
  return <div className="vector-inventory-table" role="region" aria-label="Lots" tabIndex={0}>
    <table>
      <thead><tr><th scope="col">Lot</th><th scope="col">Spieler</th><th scope="col">Menge</th><th scope="col">Qualität</th><th scope="col">Location</th><th scope="col">Aktion</th></tr></thead>
      <tbody>{rows.map((row) => {
        const initial = inventoryEditInitialValue(row, materialKind(units, row.material))
        const canEdit = editing.currentUserId !== null && row.owner_user_id === editing.currentUserId && initial && editing.locations
        return <tr key={row.inventory_id}>
          {editing.editingLotId === row.inventory_id && canEdit && editing.locations
            ? <td colSpan={6}><EditInventoryLotForm key={row.inventory_id} row={row} initial={initial} locations={editing.locations}
                pending={editing.pending} setPending={editing.setPending} onCancel={editing.cancel} onSuccess={editing.success} /></td>
            : <>
              <td>#{row.inventory_id}</td><td>{row.player_name}</td>
              <td>{materialKind(units, row.material) ? formatQuantity([row], materialKind(units, row.material), mode) : `${row.amount} (Einheit unbekannt)`}</td>
              <td>Q{row.quality}</td><td>{row.location_name}</td>
              <td>{canEdit && <button type="button" disabled={editing.pending} onClick={() => editing.start(row.inventory_id)}>Bearbeiten</button>}</td>
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
  const [editingLotId, setEditingLotId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const editing: Editing = {
    currentUserId, locations: locationOptions, editingLotId, pending, setPending,
    start: (id) => { setSuccess(false); setEditingLotId(id) },
    cancel: () => setEditingLotId(null),
    success: () => { setEditingLotId(null); setSuccess(true); router.refresh() },
  }
  const { mode } = useUnitPreference()
  const materials = (entries: InventoryRow[]) => groupBy(entries, (row) => row.material)
  const locations = (entries: InventoryRow[]) => groupBy(entries, (row) => row.location_id)

  return <section className="inventory-view" aria-label="Crew Inventory">
    <div role="status">{success ? INVENTORY_SUCCESS_MESSAGES.LOT_UPDATED : null}</div>
    <div className="inventory-view__controls" role="group" aria-label="Inventory Ansicht">
      <button type="button" disabled={pending} aria-pressed={view === 'GLOBAL'} onClick={() => { setEditingLotId(null); setView('GLOBAL') }}>GLOBAL</button>
      <button type="button" disabled={pending} aria-pressed={view === 'LOCATION'} onClick={() => { setEditingLotId(null); setView('LOCATION') }}>LOCATION</button>
    </div>
    {!metadataAvailable && <p role="status">LIVE Materialdaten nicht verfügbar; Einheiten sind unbekannt.</p>}
    {view === 'GLOBAL'
      ? materials(rows).map((materialRows) => <details className="inventory-group" key={materialRows[0].material}>
          <summary><span>{materialRows[0].material}</span><Summary rows={materialRows} units={units} mode={mode} /></summary>
          <div className="inventory-group__children">
            {locations(materialRows).map((locationRows) => <details className="inventory-group" key={locationRows[0].location_id}>
              <summary><span>{locationRows[0].location_name}</span><Summary rows={locationRows} units={units} mode={mode} /></summary>
              <Lots rows={locationRows} units={units} mode={mode} editing={editing} />
            </details>)}
          </div>
        </details>)
      : locations(rows).map((locationRows) => <details className="inventory-group" key={locationRows[0].location_id}>
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
