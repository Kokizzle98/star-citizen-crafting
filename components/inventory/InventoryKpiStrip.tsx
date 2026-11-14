'use client'

import { useEffect, useState } from 'react'
import { useUnitPreference } from '@/components/layout/UnitPreference'
import { formatQuantity } from '@/lib/inventory/inventory-display'
import type { InventoryRow } from '@/lib/inventory/inventory-result'
import { formatLastChanged, inventoryKpis, type MaterialUnitsLike } from '@/lib/inventory/inventory-summary'

// Read-only key figure strip above the filters (UX-3b, Mockup "Mein Inventory").
// It uses the same rows as the list (after filtering). SCU and pieces are
// never added together and there is no average across different materials.
export function InventoryKpiStrip({ rows, units, crew }: { rows: InventoryRow[]; units: MaterialUnitsLike; crew: boolean }) {
  const { mode } = useUnitPreference()
  // `now` is only known on the client after mount, so the first render
  // (server and client) always shows the plain date and cannot mismatch.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])

  const kpis = inventoryKpis(rows, units)
  const unknownHint = kpis.unknownUnitLots > 0 ? ` · ${kpis.unknownUnitLots} ohne bekannte Einheit` : ''
  const volume = kpis.volumeRows.length > 0
    ? formatQuantity(kpis.volumeRows, 'volume', mode)
    : kpis.unknownUnitLots > 0 ? '–' : '0'
  const count = kpis.countRows.length > 0
    ? formatQuantity(kpis.countRows, 'count', mode)
    : kpis.unknownUnitLots > 0 ? '–' : '0'

  return <section className="inventory-kpi-strip" aria-label="Kennzahlen">
    <dl>
      <div><dt>Materialien</dt><dd className="inventory-kpi-strip__value">{kpis.materials}</dd><dd className="inventory-kpi-strip__sub">verschiedene</dd></div>
      <div><dt>Menge SCU</dt><dd className="inventory-kpi-strip__value">{volume}</dd><dd className="inventory-kpi-strip__sub">Crafting-Materialien{unknownHint}</dd></div>
      <div><dt>Menge Stück</dt><dd className="inventory-kpi-strip__value">{count}</dd><dd className="inventory-kpi-strip__sub">Handminables{unknownHint}</dd></div>
      <div><dt>Lots</dt><dd className="inventory-kpi-strip__value">{kpis.lots}</dd><dd className="inventory-kpi-strip__sub">{crew ? 'Crew-Bestand' : 'dein Bestand'}</dd></div>
      <div><dt>Zuletzt geändert</dt><dd className="inventory-kpi-strip__value">{formatLastChanged(kpis.latestUpdatedAt, now)}</dd></div>
    </dl>
  </section>
}
