'use client'

import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type {
  FabricatorCatalog,
  FabricatorComponentView,
  FabricatorFamilyView,
  FabricatorVariantView,
} from '@/lib/fabricator/fabricator-catalog'
import {
  bestCraftability,
  formatFabricatorQuantity,
  indexCrewLots,
  recipeCraftability,
  type FabricatorRecipeCraftability,
  type FabricatorSlotCraftability,
} from '@/lib/fabricator/fabricator-craftability'
import {
  FABRICATOR_CRAFTABILITY_GLYPHS,
  FABRICATOR_CRAFTABILITY_LABELS,
  FABRICATOR_MATERIAL_KIND_LABELS,
  FABRICATOR_RECIPE_ISSUE_MESSAGES,
  FABRICATOR_REVIEW_MESSAGES,
  FABRICATOR_SLOT_LABELS,
  fabricatorCategoryLabel,
} from '@/lib/fabricator/fabricator-labels'
import type { FabricatorArmorSlot } from '@/lib/fabricator/fabricator-product-family'
import {
  EMPTY_FABRICATOR_FILTERS,
  FABRICATOR_DISPLAY_STEP,
  fabricatorFilterOptions,
  filterAndRankFabricatorRows,
  nextActiveIndex,
  toFabricatorSearchRow,
  type FabricatorCraftabilityFilterValue,
  type FabricatorFilters,
} from '@/lib/fabricator/fabricator-search'
import type { FabricatorCrewResult } from '@/lib/fabricator/fabricator-workspace-read'
import { FabricatorVisual } from './FabricatorVisual'

// Fabricator F2 workspace: product selection on the left, the selected
// product with recipe and crew craftability on the right. Read-only: no
// inventory change, reservation or consumption. Family and variant identity
// come from the F1 contracts; search only orders and narrows the list.

const CREW_NOTICES: Record<Exclude<FabricatorCrewResult['status'], 'success'>, string> = {
  no_active_crew: 'Keine aktive Crew ausgewählt. Rezepte bleiben sichtbar, der Crew-Bestand wird nicht verglichen.',
  unauthorized: 'Der Crew-Kontext ist nicht verfügbar. Rezepte bleiben sichtbar, der Crew-Bestand wird nicht verglichen.',
  read_error: 'Der Crew-Bestand konnte nicht geladen werden. Rezepte bleiben sichtbar.',
}

const LOT_REASON: Record<string, string> = {
  BELOW_MIN_QUALITY: 'unter Mindestqualität – zählt nicht',
  DIMENSION_MISMATCH: 'andere Mengeneinheit – zählt nicht',
  QUANTITY_INVALID: 'Menge nicht eindeutig lesbar – zählt nicht',
}

const SLOT_STATUS: Record<FabricatorSlotCraftability['status'], string> = {
  COVERED: 'Gedeckt',
  INSUFFICIENT: 'Zu wenig',
  NONE: 'Kein nutzbarer Bestand',
  UNRESOLVED: 'Material nicht auflösbar',
}

type Selection = {
  familyKey: string
  variantKey: string
  slot: FabricatorArmorSlot | null
  /** Chosen blueprint index when the component has several; null until the user chooses. */
  blueprint: number | null
}

function initialSelection(family: FabricatorFamilyView): Selection {
  const variant = family.variants.find(v => v.isBase) ?? family.variants[0]
  return { familyKey: family.key, variantKey: variant.variantKey, slot: variant.components[0].slot, blueprint: null }
}

function componentOf(variant: FabricatorVariantView, slot: FabricatorArmorSlot | null): FabricatorComponentView | null {
  if (slot === null) return variant.components[0] ?? null
  return variant.components.find(component => component.slot === slot) ?? null
}

function StatusBadge({ status }: { status: keyof typeof FABRICATOR_CRAFTABILITY_LABELS }) {
  return (
    <span className={`fabricator-status fabricator-status--${status.toLowerCase()}`}>
      <span aria-hidden="true">{FABRICATOR_CRAFTABILITY_GLYPHS[status]}</span> {FABRICATOR_CRAFTABILITY_LABELS[status]}
    </span>
  )
}

export function FabricatorWorkspace({ catalog, crew }: { catalog: FabricatorCatalog; crew: FabricatorCrewResult }) {
  const [filters, setFilters] = useState<FabricatorFilters>(EMPTY_FABRICATOR_FILTERS)
  const [limit, setLimit] = useState(FABRICATOR_DISPLAY_STEP)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [selection, setSelection] = useState<Selection | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const crewAvailable = crew.status === 'success'
  const lotsByMaterial = useMemo(() => indexCrewLots(crew.status === 'success' ? crew.lots : []), [crew])
  const recipeResults = useMemo(
    () => crewAvailable ? catalog.recipes.map(recipe => recipeCraftability(recipe, lotsByMaterial)) : null,
    [catalog.recipes, crewAvailable, lotsByMaterial],
  )

  const familiesByKey = useMemo(() => new Map(catalog.families.map(family => [family.key, family])), [catalog.families])
  const rows = useMemo(() => catalog.families.map(family => {
    const indexes = family.variants.flatMap(v => v.components.flatMap(c => c.blueprints))
    const status: FabricatorCraftabilityFilterValue = recipeResults
      ? bestCraftability(indexes.map(index => recipeResults[catalog.blueprints[index].recipe].status))
      : 'CREW_UNAVAILABLE'
    const names = indexes.map(index => catalog.blueprints[index].productName)
    return toFabricatorSearchRow(family, fabricatorCategoryLabel(family.categoryKey), status, names)
  }), [catalog, recipeResults])
  const options = useMemo(() => fabricatorFilterOptions(rows), [rows])
  const visible = useMemo(() => filterAndRankFabricatorRows(rows, filters), [rows, filters])
  const shown = visible.slice(0, limit)
  const rowByKey = useMemo(() => new Map(rows.map(row => [row.key, row])), [rows])

  function updateFilters(patch: Partial<FabricatorFilters>) {
    setFilters(current => ({ ...current, ...patch }))
    setLimit(FABRICATOR_DISPLAY_STEP)
    setActiveIndex(-1)
  }

  function selectFamily(key: string) {
    const family = familiesByKey.get(key)
    if (family) setSelection(initialSelection(family))
  }

  function onListKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter') {
      if (activeIndex >= 0 && shown[activeIndex]) {
        event.preventDefault()
        selectFamily(shown[activeIndex].key)
      }
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (event.currentTarget instanceof HTMLInputElement && (event.key === 'Home' || event.key === 'End')) return
    event.preventDefault()
    const next = nextActiveIndex(activeIndex, shown.length, event.key)
    setActiveIndex(next)
    if (next >= 0) document.getElementById(optionId(shown[next].key))?.scrollIntoView({ block: 'nearest' })
  }

  const optionId = (key: string) => `fabricator-option-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`
  const activeId = activeIndex >= 0 && shown[activeIndex] ? optionId(shown[activeIndex].key) : undefined
  const selectedFamily = selection ? familiesByKey.get(selection.familyKey) ?? null : null

  return (
    <section className="fabricator-workspace" aria-label="Fabricator">
      {crew.status !== 'success' && (
        <p className="fabricator-notice" role="status">{CREW_NOTICES[crew.status]}</p>
      )}

      <div className="fabricator-workspace__panes">
        <div className="fabricator-pane fabricator-pane--results">
          <div className="fabricator-filters" role="group" aria-label="Produkte suchen und filtern">
            <div className="inventory-filter-controls__field fabricator-filters__search">
              <label htmlFor="fabricator-search">Suche</label>
              <input id="fabricator-search" type="search" value={filters.query}
                placeholder="Produkt, Hersteller, Kategorie, Größe"
                role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="fabricator-results"
                aria-activedescendant={activeId}
                onKeyDown={onListKeyDown}
                onChange={event => updateFilters({ query: event.target.value })} />
            </div>
            <div className="inventory-filter-controls__field">
              <label htmlFor="fabricator-category">Kategorie</label>
              <select id="fabricator-category" value={filters.category} onChange={event => updateFilters({ category: event.target.value })}>
                <option value="">Alle Kategorien</option>
                {options.categories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="inventory-filter-controls__field">
              <label htmlFor="fabricator-size">Größe</label>
              <select id="fabricator-size" value={filters.size} onChange={event => updateFilters({ size: event.target.value })}>
                <option value="">Alle Größen</option>
                {options.sizes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="inventory-filter-controls__field">
              <label htmlFor="fabricator-craftability">Herstellbarkeit</label>
              <select id="fabricator-craftability" value={filters.craftability} disabled={!crewAvailable}
                onChange={event => updateFilters({ craftability: event.target.value })}>
                <option value="">Alle</option>
                {options.craftability.filter(value => value !== 'CREW_UNAVAILABLE').map(value =>
                  <option key={value} value={value}>{FABRICATOR_CRAFTABILITY_LABELS[value]}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => updateFilters(EMPTY_FABRICATOR_FILTERS)}>Filter zurücksetzen</button>
          </div>

          <p className="inventory-filter-result" role="status">
            {visible.length} von {rows.length} Produkten{visible.length > shown.length ? ` · ${shown.length} angezeigt` : ''}
            {crewAvailable ? ' · Status: beste Option je Produktlinie' : ''}
          </p>

          {visible.length === 0
            ? <p className="inventory-filter-empty">Keine Produkte entsprechen den aktuellen Filtern.</p>
            : <ul ref={listRef} id="fabricator-results" className="fabricator-results" role="listbox" tabIndex={0}
                aria-label="Produkte" aria-activedescendant={activeId} onKeyDown={onListKeyDown}>
                {shown.map((row, index) => {
                  const family = familiesByKey.get(row.key)!
                  const selected = selection?.familyKey === row.key
                  return (
                    <li key={row.key} id={optionId(row.key)} role="option" aria-selected={selected}
                      className={`fabricator-result${index === activeIndex ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
                      onClick={() => { setActiveIndex(index); selectFamily(row.key) }}>
                      <FabricatorVisual categoryKey={family.categoryKey} categoryLabel={row.categoryLabel} size="thumb" />
                      <span className="fabricator-result__body">
                        <span className="fabricator-result__name">{row.name}</span>
                        {family.titleDetail && <span className="fabricator-result__meta">{family.titleDetail}</span>}
                        <span className="fabricator-result__meta">
                          {row.categoryLabel}
                          {family.kind === 'ARMOR_SET' ? ' · Set' : ''}
                          {row.sizeLabel ? ` · ${row.sizeLabel}` : ''}
                          {family.variants.length > 1 ? ` · ${family.variants.length} Varianten` : ''}
                          {family.status === 'REVIEW_REQUIRED' ? ' · Prüfung nötig' : ''}
                        </span>
                      </span>
                      <StatusBadge status={rowByKey.get(row.key)!.craftability} />
                    </li>
                  )
                })}
              </ul>}

          {visible.length > shown.length && (
            <button type="button" className="fabricator-more" onClick={() => setLimit(current => current + FABRICATOR_DISPLAY_STEP)}>
              Weitere {Math.min(FABRICATOR_DISPLAY_STEP, visible.length - shown.length)} anzeigen
            </button>
          )}
        </div>

        <div className="fabricator-pane fabricator-pane--detail">
          {selectedFamily && selection
            ? <FabricatorDetail family={selectedFamily} selection={selection} onChange={setSelection}
                catalog={catalog} recipeResults={recipeResults} crewAvailable={crewAvailable} />
            : <div className="fabricator-empty">
                <FabricatorVisual categoryKey="default" categoryLabel="Fabricator" />
                <p>Wähle links ein Produkt, um Rezept und Crew-Bestand zu sehen.</p>
              </div>}
        </div>
      </div>
    </section>
  )
}

function FabricatorDetail({ family, selection, onChange, catalog, recipeResults, crewAvailable }: {
  family: FabricatorFamilyView
  selection: Selection
  onChange: (selection: Selection) => void
  catalog: FabricatorCatalog
  recipeResults: FabricatorRecipeCraftability[] | null
  crewAvailable: boolean
}) {
  const variant = family.variants.find(v => v.variantKey === selection.variantKey) ?? family.variants[0]
  const component = componentOf(variant, selection.slot)
  const choices = component?.blueprints ?? []
  const blueprintIndex = choices.length === 1 ? choices[0] : selection.blueprint
  const blueprint = blueprintIndex !== null && choices.includes(blueprintIndex) ? catalog.blueprints[blueprintIndex] : null
  const categoryLabel = fabricatorCategoryLabel(family.categoryKey)
  const variantLabel = (v: FabricatorVariantView) => {
    const first = v.components[0]
    return catalog.blueprints[first.blueprints[0]].productName ?? first.itemName ?? catalog.blueprints[first.blueprints[0]].tag
  }

  function chooseVariant(next: FabricatorVariantView) {
    const keepSlot = selection.slot !== null && next.components.some(c => c.slot === selection.slot)
    onChange({ ...selection, variantKey: next.variantKey, slot: keepSlot ? selection.slot : next.components[0].slot, blueprint: null })
  }

  return (
    <article className="fabricator-detail" aria-labelledby="fabricator-detail-title">
      <header className="fabricator-hero">
        <FabricatorVisual categoryKey={family.categoryKey} categoryLabel={categoryLabel} />
        <div className="fabricator-hero__body">
          <p className="eyebrow">{categoryLabel}{family.kind === 'ARMOR_SET' ? ' · Armor-Set' : ''}</p>
          <h2 id="fabricator-detail-title">{family.title}</h2>
          {family.titleDetail && <p className="fabricator-muted">Produktlinie von {family.titleDetail}</p>}
          <dl className="fabricator-hero__meta">
            {family.variants.length > 1 && <><dt>Variante</dt><dd>{variantLabel(variant)}</dd></>}
            {family.kind === 'ARMOR_SET' && <><dt>Komponente</dt><dd>{selection.slot ? FABRICATOR_SLOT_LABELS[selection.slot] : '—'}</dd></>}
            <dt>Hersteller</dt><dd>{component?.manufacturer ?? family.manufacturer ?? <span className="fabricator-muted">Nicht angegeben</span>}</dd>
            <dt>Kategorie</dt><dd>{categoryLabel}{component?.subcategory ? ` · ${component.subcategory}` : ''}</dd>
            {component?.sizeLabel && <><dt>Größe</dt><dd>{component.sizeLabel}</dd></>}
            <dt>Blueprint</dt><dd className="fabricator-tag">{blueprint ? blueprint.tag : choices.length > 1 ? 'Bitte auswählen' : '—'}</dd>
          </dl>
          {family.reviewReasons.length > 0 && (
            <ul className="fabricator-review" aria-label="Hinweise zur Datenprüfung">
              {family.reviewReasons.map(reason => <li key={reason}><span aria-hidden="true">⚠</span> {FABRICATOR_REVIEW_MESSAGES[reason] ?? reason}</li>)}
            </ul>
          )}
        </div>
      </header>

      {family.variants.length > 1 && (
        <fieldset className="fabricator-choice">
          <legend>Variante</legend>
          <div className="fabricator-choice__options">
            {family.variants.map(v => (
              <button key={v.variantKey} type="button" aria-pressed={v.variantKey === variant.variantKey} onClick={() => chooseVariant(v)}>
                {variantLabel(v)}{v.isBase ? ' · Basis' : ''}
                {family.kind === 'ARMOR_SET' && <span className="fabricator-choice__hint"> · {v.components.length} von {family.slots.length} Komponenten</span>}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {family.kind === 'ARMOR_SET' && (
        <fieldset className="fabricator-choice">
          <legend>Komponente</legend>
          <div className="fabricator-choice__options">
            {family.slots.map(slot => {
              const present = variant.components.some(c => c.slot === slot)
              return (
                <button key={slot} type="button" aria-pressed={selection.slot === slot} disabled={!present}
                  aria-label={present ? FABRICATOR_SLOT_LABELS[slot] : `${FABRICATOR_SLOT_LABELS[slot]} – nicht im Datensatz`}
                  onClick={() => onChange({ ...selection, slot, blueprint: null })}>
                  {FABRICATOR_SLOT_LABELS[slot]}{!present && <span className="fabricator-choice__hint"> · nicht im Datensatz</span>}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {choices.length > 1 && (
        <fieldset className="fabricator-choice">
          <legend>Blueprint wählen</legend>
          <p className="fabricator-muted">Für dieses Item gibt es {choices.length} Blueprints. Es wird keiner automatisch gewählt.</p>
          <div className="fabricator-choice__radios">
            {choices.map(index => (
              <label key={index}>
                <input type="radio" name="fabricator-blueprint" value={index} checked={selection.blueprint === index}
                  onChange={() => onChange({ ...selection, blueprint: index })} />
                {' '}{catalog.blueprints[index].tag}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {blueprint
        ? <RecipeSection recipeIndex={blueprint.recipe} catalog={catalog} result={recipeResults?.[blueprint.recipe] ?? null} crewAvailable={crewAvailable} />
        : <p className="fabricator-notice">{component ? 'Wähle einen Blueprint, um das Rezept zu sehen.' : 'Diese Komponente ist für die gewählte Variante nicht im Datensatz.'}</p>}
    </article>
  )
}

function RecipeSection({ recipeIndex, catalog, result, crewAvailable }: {
  recipeIndex: number
  catalog: FabricatorCatalog
  result: FabricatorRecipeCraftability | null
  crewAvailable: boolean
}) {
  const recipe = catalog.recipes[recipeIndex]
  return (
    <section className="fabricator-recipe" aria-labelledby="fabricator-recipe-title">
      <div className="fabricator-recipe__header">
        <h3 id="fabricator-recipe-title">Rezept &amp; Crew-Bestand</h3>
        {result ? <StatusBadge status={result.status} /> : <StatusBadge status="CREW_UNAVAILABLE" />}
      </div>
      {recipe.issues.length > 0 && (
        <ul className="fabricator-review">
          {recipe.issues.map(issue => <li key={issue}><span aria-hidden="true">⚠</span> {FABRICATOR_RECIPE_ISSUE_MESSAGES[issue] ?? issue}</li>)}
        </ul>
      )}
      {result?.multiLocation && (
        <p className="fabricator-notice">
          <span aria-hidden="true">⇄</span> Der nutzbare Bestand liegt an mehreren Locations. „In der Crew vorhanden“ heißt nicht, dass alles an einem Ort liegt.
        </p>
      )}
      {recipe.slots.length === 0
        ? <p className="fabricator-notice">Für diesen Blueprint ist kein lesbares Rezept vorhanden.</p>
        : <div className="vector-inventory-table fabricator-materials" role="region" aria-label="Materialbedarf" tabIndex={0}>
            <table>
              <thead><tr>
                <th scope="col">Slot / Material</th><th scope="col">Art</th><th scope="col">Bedarf</th>
                <th scope="col">Min-Q</th><th scope="col">Crew nutzbar</th><th scope="col">Fehlt</th><th scope="col">Status</th>
              </tr></thead>
              <tbody>{recipe.slots.map((slot, index) => {
                const craft = result?.slots[index] ?? null
                const unit = slot.material.unit
                return (
                  <Fragment key={slot.slotKey}>
                  <tr className={craft && craft.lots.length > 0 ? 'fabricator-material--with-lots' : undefined}>
                    <td>
                      <span className="fabricator-material__slot">{slot.name}</span>
                      <span className="fabricator-material__name">{slot.material.name}</span>
                    </td>
                    <td>{FABRICATOR_MATERIAL_KIND_LABELS[slot.material.kind]}</td>
                    <td>{formatFabricatorQuantity(BigInt(slot.material.required), unit)}</td>
                    <td>{slot.material.minQuality > 0 ? `Q${slot.material.minQuality}` : '—'}</td>
                    <td>{craft ? formatFabricatorQuantity(craft.available, unit) : <span className="fabricator-muted">nicht verfügbar</span>}</td>
                    <td>{craft ? (craft.missing > 0n ? formatFabricatorQuantity(craft.missing, unit) : '—') : '—'}</td>
                    <td>
                      {slot.material.vocabulary !== 'RESOLVED'
                        ? <span className="fabricator-slot-status"><span aria-hidden="true">⚠</span> {SLOT_STATUS.UNRESOLVED}</span>
                        : craft
                          ? <span className={`fabricator-slot-status fabricator-slot-status--${craft.status.toLowerCase()}`}>
                              <span aria-hidden="true">{craft.status === 'COVERED' ? '✓' : craft.status === 'INSUFFICIENT' ? '◐' : '✕'}</span> {SLOT_STATUS[craft.status]}
                              {craft.surplus > 0n && <span className="fabricator-muted"> · Überschuss {formatFabricatorQuantity(craft.surplus, unit)}</span>}
                              {craft.locationCount > 1 && <span className="fabricator-muted"> · {craft.locationCount} Locations</span>}
                            </span>
                          : <span className="fabricator-muted">{crewAvailable ? '—' : 'Crew-Bestand nicht verfügbar'}</span>}
                    </td>
                  </tr>
                  {craft && craft.lots.length > 0 && (
                    <tr className="fabricator-lots-row">
                      <td colSpan={7}><LotList craft={craft} unit={unit} /></td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}</tbody>
            </table>
          </div>}
      {recipe.craftTimeSeconds !== null && <p className="fabricator-muted">Herstellungszeit laut SCMDB: {recipe.craftTimeSeconds} s</p>}
    </section>
  )
}

function LotList({ craft, unit }: { craft: FabricatorSlotCraftability; unit: 'SCU' | 'COUNT' }) {
  return (
    <ul className="fabricator-lots" aria-label="Passende Crew-Lots">
      {craft.lots.map(use => (
        <li key={use.lot.id} className={use.usable ? 'fabricator-lot' : 'fabricator-lot fabricator-lot--excluded'}>
          <span aria-hidden="true">{use.usable ? '✓' : '✕'}</span>{' '}
          {use.lot.playerName} · {use.quantity !== null ? formatFabricatorQuantity(use.quantity, unit) : '—'} · Q{use.lot.quality} · {use.lot.locationName}
          {use.reason && <span className="fabricator-lot__reason"> · {LOT_REASON[use.reason]}</span>}
        </li>
      ))}
    </ul>
  )
}
