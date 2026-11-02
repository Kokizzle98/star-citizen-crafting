'use client'

import { useState } from 'react'
import { useUnitPreference } from '@/components/layout/UnitPreference'
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

function Lots({ rows, units, mode }: { rows: InventoryRow[]; units: MaterialUnits; mode: UnitMode }) {
  return <div className="vector-inventory-table" role="region" aria-label="Lots" tabIndex={0}>
    <table>
      <thead><tr><th scope="col">Lot</th><th scope="col">Spieler</th><th scope="col">Menge</th><th scope="col">Qualität</th><th scope="col">Location</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.inventory_id}>
        <td>#{row.inventory_id}</td><td>{row.player_name}</td>
        <td>{materialKind(units, row.material) ? formatQuantity([row], materialKind(units, row.material), mode) : `${row.amount} (Einheit unbekannt)`}</td>
        <td>Q{row.quality}</td><td>{row.location_name}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function InventoryView({ rows, units, metadataAvailable }: {
  rows: InventoryRow[]
  units: MaterialUnits
  metadataAvailable: boolean
}) {
  const [view, setView] = useState<'GLOBAL' | 'LOCATION'>('GLOBAL')
  const { mode } = useUnitPreference()
  const materials = (entries: InventoryRow[]) => groupBy(entries, (row) => row.material)
  const locations = (entries: InventoryRow[]) => groupBy(entries, (row) => row.location_id)

  return <section className="inventory-view" aria-label="Crew Inventory">
    <div className="inventory-view__controls" role="group" aria-label="Inventory Ansicht">
      <button type="button" aria-pressed={view === 'GLOBAL'} onClick={() => setView('GLOBAL')}>GLOBAL</button>
      <button type="button" aria-pressed={view === 'LOCATION'} onClick={() => setView('LOCATION')}>LOCATION</button>
    </div>
    {!metadataAvailable && <p role="status">LIVE Materialdaten nicht verfügbar; Einheiten sind unbekannt.</p>}
    {view === 'GLOBAL'
      ? materials(rows).map((materialRows) => <details className="inventory-group" key={materialRows[0].material}>
          <summary><span>{materialRows[0].material}</span><Summary rows={materialRows} units={units} mode={mode} /></summary>
          <div className="inventory-group__children">
            {locations(materialRows).map((locationRows) => <details className="inventory-group" key={locationRows[0].location_id}>
              <summary><span>{locationRows[0].location_name}</span><Summary rows={locationRows} units={units} mode={mode} /></summary>
              <Lots rows={locationRows} units={units} mode={mode} />
            </details>)}
          </div>
        </details>)
      : locations(rows).map((locationRows) => <details className="inventory-group" key={locationRows[0].location_id}>
          <summary><span>{locationRows[0].location_name}</span><span>{locationRows.length} {locationRows.length === 1 ? 'Lot' : 'Lots'}</span></summary>
          <div className="inventory-group__children">
            {materials(locationRows).map((materialRows) => <details className="inventory-group" key={materialRows[0].material}>
              <summary><span>{materialRows[0].material}</span><Summary rows={materialRows} units={units} mode={mode} /></summary>
              <Lots rows={materialRows} units={units} mode={mode} />
            </details>)}
          </div>
        </details>)}
  </section>
}
