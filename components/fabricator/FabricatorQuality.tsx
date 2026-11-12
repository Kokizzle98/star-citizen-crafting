'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import type { FabricatorBaselineView, FabricatorPropertyView, FabricatorRecipeView } from '@/lib/fabricator/fabricator-catalog'
import {
  FABRICATOR_PRESET_MESSAGES,
  FABRICATOR_STAT_REASON_MESSAGES,
  FABRICATOR_STAT_STATUS_GLYPHS,
  FABRICATOR_STAT_STATUS_LABELS,
} from '@/lib/fabricator/fabricator-labels'
import {
  clampManualQuality,
  initialManualQuality,
  manualQualityKeyStep,
  type FabricatorAvailablePreset,
} from '@/lib/fabricator/fabricator-preset'
import {
  fabricatorStats,
  formatPercent,
  formatStatValue,
  slotQualities,
  type FabricatorStatRow,
} from '@/lib/fabricator/fabricator-stats'

// Fabricator F3: MANUAL quality (one global value Q0–1000, D2 = C) with the
// inventory-aware AVAILABLE PRESET (D-F3-1) and the product stats of exactly
// this concrete item. Everything is computed on the client: dragging the
// slider never calls the server. The manual value is a simulation and is
// never presented as craftable with the current stock.

export function FabricatorQuality({ recipe, baselines, properties, preset }: {
  recipe: FabricatorRecipeView
  baselines: Readonly<Record<string, FabricatorBaselineView>>
  properties: Readonly<Record<string, FabricatorPropertyView>>
  preset: FabricatorAvailablePreset
}) {
  const [quality, setQuality] = useState(() => initialManualQuality(preset))
  const [draft, setDraft] = useState(() => String(initialManualQuality(preset)))

  const rows = useMemo(
    () => fabricatorStats(recipe, baselines, slotQualities(recipe, quality), properties),
    [recipe, baselines, properties, quality],
  )
  const highestMinQuality = Math.max(0, ...recipe.slots.map(slot => slot.material.minQuality))
  const presetQuality = preset.status === 'AVAILABLE' ? preset.quality : null

  function apply(next: number) {
    setQuality(next)
    setDraft(String(next))
  }

  function onSliderKey(event: KeyboardEvent<HTMLInputElement>) {
    const next = manualQualityKeyStep(event.key, quality)
    if (next === null) return
    event.preventDefault()
    apply(next)
  }

  function onNumberChange(value: string) {
    setDraft(value)
    if (value.trim() === '') return
    const number = Number(value)
    if (Number.isFinite(number)) setQuality(clampManualQuality(number, quality))
  }

  return (
    <section className="fabricator-quality" aria-labelledby="fabricator-quality-title">
      <h3 id="fabricator-quality-title">Qualität &amp; Produktwerte</h3>

      <dl className="fabricator-quality__summary">
        <dt>Verfügbares gemeinsames Preset</dt>
        <dd>
          {presetQuality !== null
            ? <strong>Q{presetQuality}</strong>
            : <span className="fabricator-muted">{FABRICATOR_PRESET_MESSAGES[preset.status === 'NONE' ? preset.reason : 'UNRESOLVED']}</span>}
        </dd>
        <dt>Aktuelle manuelle Simulation</dt>
        <dd><strong>Q{quality}</strong></dd>
      </dl>
      {presetQuality !== null && (
        <p className="fabricator-muted">
          Das Preset ist die niedrigste real erreichbare Material-Qualität aller Slots (mengengewichtet über die tatsächlich
          benötigten Mengen). Es ist kein Lager-Durchschnitt und nicht die Qualität des gecrafteten Items.
        </p>
      )}

      <div className="fabricator-quality__controls">
        <label htmlFor="fabricator-quality-range">Qualität (MANUAL, für alle Slots)</label>
        <input id="fabricator-quality-range" type="range" min={0} max={1000} step={1} value={quality}
          aria-valuetext={`Q${quality}`} onKeyDown={onSliderKey}
          onChange={event => apply(clampManualQuality(event.target.value, quality))} />
        <label htmlFor="fabricator-quality-number" className="visually-hidden">Qualität als Zahl</label>
        <input id="fabricator-quality-number" type="number" inputMode="numeric" min={0} max={1000} step={1} value={draft}
          onChange={event => onNumberChange(event.target.value)}
          onBlur={() => setDraft(String(quality))}
          onKeyDown={event => { if (event.key === 'Enter') setDraft(String(quality)) }} />
        <button type="button" disabled={presetQuality === null || presetQuality === quality}
          onClick={() => presetQuality !== null && apply(presetQuality)}>
          Auf verfügbares Preset zurücksetzen
        </button>
      </div>

      {presetQuality !== null && quality > presetQuality && (
        <p className="fabricator-notice fabricator-notice--warning" role="status">
          <span aria-hidden="true">⚠</span> Q{quality} ist eine Simulation und wird durch den aktuellen Bestand nicht garantiert
          (verfügbar: Q{presetQuality}).
        </p>
      )}
      {presetQuality === null && (
        <p className="fabricator-notice" role="status">
          <span aria-hidden="true">ℹ</span> Q{quality} ist eine Simulation. Ob der Bestand diese Qualität erlaubt, ist nicht belegt.
        </p>
      )}
      {quality < highestMinQuality && (
        <p className="fabricator-notice fabricator-notice--warning" role="status">
          <span aria-hidden="true">⚠</span> Q{quality} liegt unter der Mindestqualität mindestens eines Materials (Q{highestMinQuality}).
          Ingame wäre das so nicht herstellbar.
        </p>
      )}

      {rows.length === 0
        ? <p className="fabricator-notice">Dieses Rezept enthält keine Qualitätsmodifikatoren.</p>
        : <div className="vector-inventory-table fabricator-stats" role="region" aria-label="Produktwerte" tabIndex={0}>
            <table>
              <thead><tr>
                <th scope="col">Wert</th><th scope="col">Basis</th><th scope="col">Gecraftet</th>
                <th scope="col">Δ absolut</th><th scope="col">Δ %</th><th scope="col">Status</th>
              </tr></thead>
              <tbody>{rows.map(row => <StatRow key={row.propertyKey} row={row} recipe={recipe} />)}</tbody>
            </table>
          </div>}
    </section>
  )
}

const unavailable = <span className="fabricator-muted">nicht verfügbar</span>

function StatRow({ row, recipe }: { row: FabricatorStatRow; recipe: FabricatorRecipeView }) {
  const resolved = row.status === 'RESOLVED'
  const materials = recipe.slots.filter(slot => row.slotKeys.includes(slot.slotKey)).map(slot => slot.material.name)
  return (
    <tr>
      <th scope="row">
        {row.name}
        <span className="fabricator-stat__materials">beeinflusst durch {materials.join(', ')}</span>
      </th>
      <td>{resolved && row.baseValue !== null ? formatStatValue(row, row.baseValue) : unavailable}</td>
      <td>{resolved && row.craftedValue !== null ? formatStatValue(row, row.craftedValue) : unavailable}</td>
      <td>{resolved && row.absoluteDelta !== null ? formatStatValue(row, row.absoluteDelta, 'delta') : '—'}</td>
      <td>
        {resolved
          ? formatPercent(row.percentDelta)
          : row.relativeEffectPercent !== null
            ? <>Relativer Crafting-Effekt {formatPercent(row.relativeEffectPercent)}</>
            : '—'}
      </td>
      <td>
        <span className={`fabricator-stat-status fabricator-stat-status--${row.status.toLowerCase()}`}>
          <span aria-hidden="true">{FABRICATOR_STAT_STATUS_GLYPHS[row.status]}</span> {FABRICATOR_STAT_STATUS_LABELS[row.status]}
        </span>
        {!resolved && row.relativeEffectPercent !== null && <span className="fabricator-stat__reason">Absoluter Basiswert fehlt.</span>}
        {row.reason && <span className="fabricator-stat__reason">{FABRICATOR_STAT_REASON_MESSAGES[row.reason] ?? row.reason}</span>}
        {resolved && row.baseValue === 0 && <span className="fabricator-stat__reason">Basiswert 0: keine Prozentangabe.</span>}
      </td>
    </tr>
  )
}
