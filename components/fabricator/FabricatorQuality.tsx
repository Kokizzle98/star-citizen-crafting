'use client'

import { QualityChip, QualityLegend } from '@/components/quality/QualityChip'
import { useMemo, useState, type KeyboardEvent } from 'react'
import type { FabricatorBaselineView, FabricatorPropertyView, FabricatorRecipeView } from '@/lib/fabricator/fabricator-catalog'
import type { FabricatorRecipeCraftability } from '@/lib/fabricator/fabricator-craftability'
import {
  FABRICATOR_PRESET_MESSAGES,
  FABRICATOR_STAT_REASON_MESSAGES,
  FABRICATOR_STAT_STATUS_GLYPHS,
  FABRICATOR_STAT_STATUS_LABELS,
} from '@/lib/fabricator/fabricator-labels'
import {
  clampManualQuality,
  initialManualQuality,
  initialSlotQualities,
  manualQualityKeyStep,
  setAllSlotQualities,
  type FabricatorAvailablePreset,
} from '@/lib/fabricator/fabricator-preset'
import {
  fabricatorStats,
  formatPercent,
  formatStatValue,
  type FabricatorStatRow,
} from '@/lib/fabricator/fabricator-stats'

// Fabricator F3: MANUAL quality per material plus the stats of exactly this
// concrete item (owner correction 2026-11-12, acceptance points 3 / 4).
//
// Material -> own quality -> own stat effect -> combined result:
// - every quality-relevant recipe material (slot) has its own slider; changing
//   one never changes another;
// - the global control is only a bulk helper: moving it sets all materials to
//   one value, afterwards each material is independent again (no coupling);
// - materials affecting the same stat stay separate inputs; only their
//   effects combine in the stat, through the unchanged engine.
// Everything is computed on the client (no server roundtrip). A manual value
// is a simulation and never a statement that the current stock allows it.

const formatQualityRange = (values: number[]) => {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? `alle Q${min}` : `Q${min} bis Q${max} (unterschiedlich je Material)`
}

const formatContribution = (operation: 'MULTIPLICATIVE' | 'ADDITIVE', value: number) => operation === 'MULTIPLICATIVE'
  ? `×${value.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`
  : `${value > 0 ? '+' : ''}${value.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`

/** Native range + synced number input for one quality value (Q0–1000). */
function QualityInput({ id, label, value, onChange }: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
}) {
  // Text being typed; null = show the committed value (also after a bulk change).
  const [draft, setDraft] = useState<string | null>(null)

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    const next = manualQualityKeyStep(event.key, value)
    if (next === null) return
    event.preventDefault()
    setDraft(null)
    onChange(next)
  }

  function onNumber(text: string) {
    setDraft(text)
    if (text.trim() === '') return
    const number = Number(text)
    if (Number.isFinite(number)) onChange(clampManualQuality(number, value))
  }

  return (
    <div className="fabricator-quality__controls">
      <label htmlFor={`${id}-range`}>{label}</label>
      <input id={`${id}-range`} type="range" min={0} max={1000} step={1} value={value}
        aria-valuetext={`Q${value}`} onKeyDown={onKey}
        onChange={event => { setDraft(null); onChange(clampManualQuality(event.target.value, value)) }} />
      <label htmlFor={`${id}-number`} className="visually-hidden">{label} als Zahl</label>
      <input id={`${id}-number`} type="number" inputMode="numeric" min={0} max={1000} step={1} value={draft ?? String(value)}
        onChange={event => onNumber(event.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={event => { if (event.key === 'Enter') setDraft(null) }} />
    </div>
  )
}

export function FabricatorQuality({ recipe, baselines, properties, preset, craftability }: {
  recipe: FabricatorRecipeView
  baselines: Readonly<Record<string, FabricatorBaselineView>>
  properties: Readonly<Record<string, FabricatorPropertyView>>
  preset: FabricatorAvailablePreset
  craftability: FabricatorRecipeCraftability | null
}) {
  // The simulation model: one independent quality per recipe slot.
  const [qualities, setQualities] = useState<Record<string, number>>(() => initialSlotQualities(recipe.slots, craftability))
  const [bulk, setBulk] = useState(() => initialManualQuality(preset))

  const rows = useMemo(
    () => fabricatorStats(recipe, baselines, qualities, properties),
    [recipe, baselines, properties, qualities],
  )
  const relevant = recipe.slots.filter(slot => slot.modifiers.length > 0)
  const withoutEffect = recipe.slots.filter(slot => slot.modifiers.length === 0)
  const available = (slotKey: string) => craftability?.slots.find(slot => slot.slotKey === slotKey)?.quality ?? null
  const anyAvailable = recipe.slots.some(slot => available(slot.slotKey) !== null)
  const presetQuality = preset.status === 'AVAILABLE' ? preset.quality : null

  function setOne(slotKey: string, value: number) {
    setQualities(current => ({ ...current, [slotKey]: value }))
  }

  function setAll(value: number) {
    setBulk(value)
    setQualities(setAllSlotQualities(recipe.slots, value))
  }

  return (
    <section className="fabricator-quality" aria-labelledby="fabricator-quality-title">
      <h3 id="fabricator-quality-title">Qualität &amp; Produktwerte</h3>
      <QualityLegend />

      <dl className="fabricator-quality__summary">
        <dt>Verfügbares gemeinsames Preset</dt>
        <dd>
          {presetQuality !== null
            ? <QualityChip quality={presetQuality} />
            : <span className="fabricator-muted">{FABRICATOR_PRESET_MESSAGES[preset.status === 'NONE' ? preset.reason : 'UNRESOLVED']}</span>}
        </dd>
        <dt>Aktuelle Materialqualitäten (Simulation)</dt>
        <dd>{relevant.length > 0 ? formatQualityRange(relevant.map(slot => qualities[slot.slotKey])) : '—'}</dd>
      </dl>
      <p className="fabricator-muted">
        Jedes Material hat eine eigene Qualität. Das gemeinsame Preset ist die niedrigste real erreichbare Material-Qualität
        aller Slots (mengengewichtet über die tatsächlich benötigten Mengen); es ist kein Lager-Durchschnitt und nicht die
        Qualität des gecrafteten Items.
      </p>

      <fieldset className="fabricator-choice">
        <legend>Alle Materialien gemeinsam setzen</legend>
        <p className="fabricator-muted">Setzt alle Materialien auf einen Wert. Danach ist jedes Material wieder einzeln einstellbar.</p>
        <QualityInput id="fabricator-quality-all" label="Qualität für alle Materialien" value={bulk} onChange={setAll} />
        <div className="fabricator-choice__options">
          <button type="button" disabled={!anyAvailable}
            onClick={() => setQualities(initialSlotQualities(recipe.slots, craftability))}>
            Auf verfügbare Material-Qualitäten zurücksetzen
          </button>
          <button type="button" disabled={presetQuality === null}
            onClick={() => presetQuality !== null && setAll(presetQuality)}>
            Alle auf gemeinsames Preset{presetQuality !== null ? ` (Q${presetQuality})` : ''}
          </button>
        </div>
      </fieldset>

      {relevant.length > 0 && (
        <ul className="fabricator-quality__materials" aria-label="Qualität je Material">
          {relevant.map(slot => {
            const quality = qualities[slot.slotKey]
            const own = available(slot.slotKey)
            return (
              <li key={slot.slotKey} className="fabricator-quality__material">
                <p>
                  <strong>{slot.material.name}</strong> <span className="fabricator-muted">· {slot.name}</span>
                  <span className="fabricator-material__quality">
                    {own !== null ? <>Verfügbar: <QualityChip quality={own} /> (bestmöglich, mengengewichtet)</> : 'Verfügbar: kein ausreichender nutzbarer Bestand'}
                    {slot.material.minQuality > 0 ? ` · Mindestqualität Q${slot.material.minQuality}` : ''}
                  </span>
                </p>
                <QualityInput id={`fabricator-quality-slot-${slot.slotKey}`} label={`Qualität ${slot.material.name} (${slot.name})`}
                  value={quality} onChange={value => setOne(slot.slotKey, value)} />
                <ul className="fabricator-quality__effects" aria-label={`Auswirkung von ${slot.material.name}`}>
                  {rows.filter(row => row.slotKeys.includes(slot.slotKey)).map(row => {
                    const contribution = row.contributions.find(c => c.slotKey === slot.slotKey)
                    return (
                      <li key={row.propertyKey}>
                        Beeinflusst {row.name}:{' '}
                        {contribution && contribution.value !== null
                          ? formatContribution(contribution.operation, contribution.value)
                          : <span className="fabricator-muted">kein SCMDB-Modifikator für Q{quality}</span>}
                      </li>
                    )
                  })}
                </ul>
                {own !== null && quality > own && (
                  <p className="fabricator-notice fabricator-notice--warning" role="status">
                    <span aria-hidden="true">⚠</span> Q{quality} ist eine Simulation und wird durch den aktuellen Bestand nicht garantiert (verfügbar: Q{own}).
                  </p>
                )}
                {quality < slot.material.minQuality && (
                  <p className="fabricator-notice fabricator-notice--warning" role="status">
                    <span aria-hidden="true">⚠</span> Q{quality} liegt unter der Mindestqualität Q{slot.material.minQuality}. Ingame wäre das so nicht herstellbar.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {withoutEffect.length > 0 && (
        <p className="fabricator-muted">
          Ohne Einfluss auf Produktwerte (laut SCMDB): {withoutEffect.map(slot => `${slot.material.name} (${slot.name})`).join(', ')}
        </p>
      )}
      {!anyAvailable && (
        <p className="fabricator-notice" role="status">
          <span aria-hidden="true">ℹ</span> Die Materialqualitäten sind eine Simulation. Ob der Bestand sie erlaubt, ist nicht belegt.
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
  // Each contributing material stays listed separately with its own quality.
  const materials = row.contributions.map(contribution => {
    const slot = recipe.slots.find(s => s.slotKey === contribution.slotKey)
    return `${slot?.material.name ?? contribution.slotKey} (Q${contribution.quality})`
  })
  return (
    <tr>
      <th scope="row">
        {row.name}
        <span className="fabricator-stat__materials">beeinflusst durch {materials.join(' + ')}</span>
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
