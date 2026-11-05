'use client'

import { useRef, useState, type FormEvent } from 'react'
import { submitInventoryLot } from '@/app/vector/inventory/actions'
import { INVENTORY_ERROR_MESSAGES, INVENTORY_SUCCESS_MESSAGES, type InventoryErrorCode } from '@/lib/inventory/inventory-error-messages'
import type { InventoryLocationOption } from '@/lib/inventory/inventory-form-options'
import type { AddInventoryLotResult } from '@/lib/inventory/inventory-write'
import type { MaterialUnits } from '@/lib/inventory/material-units'

function errorField(code: InventoryErrorCode): string | null {
  if (code.startsWith('MATERIAL_')) return 'material'
  if (code.startsWith('AMOUNT_')) return 'rawAmount'
  if (code.startsWith('UNIT_')) return 'inputUnit'
  if (code.startsWith('QUALITY_')) return 'quality'
  if (code.startsWith('LOCATION_')) return 'locationId'
  return null
}

export function AddInventoryLotForm({ units, locations }: {
  units: MaterialUnits
  locations: InventoryLocationOption[]
}) {
  const [open, setOpen] = useState(false)
  const [material, setMaterial] = useState('')
  const [result, setResult] = useState<AddInventoryLotResult | null>(null)
  const [pending, setPending] = useState(false)
  const addTriggerRef = useRef<HTMLButtonElement>(null)
  const materialRef = useRef<HTMLSelectElement>(null)
  const kind = Object.hasOwn(units, material) ? units[material] : undefined
  const field = result && !result.ok ? errorField(result.code) : null
  const message = result ? (result.ok ? INVENTORY_SUCCESS_MESSAGES[result.code] : INVENTORY_ERROR_MESSAGES[result.code]) : null
  const errorProps = (name: string) => ({
    'aria-invalid': field === name || undefined,
    'aria-describedby': field === name ? `lot-${name}-error` : undefined,
  })
  const fieldError = (name: string) => field === name
    ? <span id={`lot-${name}-error`}>{message}</span>
    : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    setPending(true)
    try {
      const next = await submitInventoryLot(new FormData(form))
      setResult(next)
      if (next.ok) {
        form.reset()
        setMaterial('')
        setOpen(false)
      }
    } catch (error) {
      console.error('Inventory lot submission failed', error)
      setResult({ ok: false, code: 'INSERT_FAILED' })
    } finally {
      setPending(false)
    }
  }

  return <section aria-label="Inventory Lot hinzufügen">
    {!open && <button type="button" ref={addTriggerRef} onClick={() => {
      setResult(null)
      setOpen(true)
      requestAnimationFrame(() => materialRef.current?.focus())
    }}>Lot hinzufügen</button>}
    {open && <form onSubmit={submit} noValidate>
      <div>
        <label htmlFor="lot-material">Material</label>
        <select ref={materialRef} id="lot-material" name="material" value={material} {...errorProps('material')}
          onChange={(event) => setMaterial(event.target.value)}>
          <option value="">Material auswählen</option>
          {Object.keys(units).sort((a, b) => a.localeCompare(b, 'de')).map((name) =>
            <option key={name} value={name}>{name}</option>)}
        </select>
        {fieldError('material')}
      </div>
      <div>
        <label htmlFor="lot-amount">Menge</label>
        <input id="lot-amount" name="rawAmount" inputMode="decimal" {...errorProps('rawAmount')} />
        {fieldError('rawAmount')}
      </div>
      <div>
        <label htmlFor="lot-unit">Einheit</label>
        <select id="lot-unit" name="inputUnit" key={kind ?? 'unknown'} {...errorProps('inputUnit')}>
          {!kind && <option value="">Einheit auswählen</option>}
          {kind === 'count' && <option value="COUNT">Stück</option>}
          {kind === 'volume' && ['SCU', 'cSCU', 'mSCU', 'µSCU'].map((unit) =>
            <option key={unit} value={unit}>{unit}</option>)}
        </select>
        {fieldError('inputUnit')}
      </div>
      <div>
        <label htmlFor="lot-quality">Qualität</label>
        <input id="lot-quality" name="quality" inputMode="numeric" {...errorProps('quality')} />
        {fieldError('quality')}
      </div>
      <div>
        <label htmlFor="lot-location">Location</label>
        <select id="lot-location" name="locationId" {...errorProps('locationId')}>
          <option value="">Location auswählen</option>
          {locations.map((location) =>
            <option key={location.id} value={location.id}>{location.canonical_name}</option>)}
        </select>
        {fieldError('locationId')}
      </div>
      <button type="submit" disabled={pending}>Speichern</button>
      <button type="button" disabled={pending} onClick={() => {
        setOpen(false)
        setMaterial('')
        setResult(null)
        requestAnimationFrame(() => addTriggerRef.current?.focus())
      }}>Abbrechen</button>
      <div role="status">{pending ? 'Speichern …' : null}</div>
    </form>}
    <div role={result && !result.ok ? 'alert' : 'status'} aria-live="polite">
      {field ? null : message}
    </div>
    {field && <div role="alert">{message}</div>}
  </section>
}
