'use client'

import { useState, type FormEvent } from 'react'
import { submitInventoryLotUpdate } from '@/app/vector/inventory/actions'
import { INVENTORY_ERROR_MESSAGES, type InventoryErrorCode } from '@/lib/inventory/inventory-error-messages'
import type { InventoryLocationOption } from '@/lib/inventory/inventory-form-options'
import type { InventoryRow } from '@/lib/inventory/inventory-result'
import type { InventoryInputUnit } from '@/lib/inventory/inventory-quantity'
import type { UpdateInventoryLotResult } from '@/lib/inventory/inventory-update-write'

function errorField(code: InventoryErrorCode): string | null {
  if (code.startsWith('AMOUNT_')) return 'rawAmount'
  if (code.startsWith('UNIT_')) return 'inputUnit'
  if (code.startsWith('QUALITY_')) return 'quality'
  if (code.startsWith('LOCATION_')) return 'locationId'
  return null
}

export function EditInventoryLotForm({ row, initial, locations, pending, setPending, onCancel, onSuccess }: {
  row: InventoryRow
  initial: { rawAmount: string; inputUnit: InventoryInputUnit }
  locations: InventoryLocationOption[]
  pending: boolean
  setPending: (pending: boolean) => void
  onCancel: () => void
  onSuccess: (code: 'LOT_UPDATED' | 'LOT_MERGED') => void
}) {
  const [result, setResult] = useState<UpdateInventoryLotResult | null>(null)
  const field = result && !result.ok ? errorField(result.code) : null
  const message = result && !result.ok ? INVENTORY_ERROR_MESSAGES[result.code] : null
  const id = (name: string) => `edit-${row.inventory_id}-${name}`
  const errorProps = (name: string) => ({
    'aria-invalid': field === name || undefined,
    'aria-describedby': field === name ? id(`${name}-error`) : undefined,
  })
  const fieldError = (name: string) => field === name
    ? <span id={id(`${name}-error`)}>{message}</span> : null
  const currentLocationAvailable = locations.some((location) => location.id === row.location_id)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true)
    try {
      const next = await submitInventoryLotUpdate(data)
      if (next.ok) onSuccess(next.code)
      else setResult(next)
    } catch (error) {
      console.error('Inventory lot update failed', error)
      setResult({ ok: false, code: 'UPDATE_FAILED' })
    } finally {
      setPending(false)
    }
  }

  return <form onSubmit={submit} noValidate onKeyDown={(event) => {
    if (event.key === 'Escape' && !pending) { event.stopPropagation(); onCancel() }
  }}>
    <p>{row.material}</p>
    <input type="hidden" name="inventoryId" value={row.inventory_id} />
    <label htmlFor={id('amount')}>Menge</label>
    <input id={id('amount')} name="rawAmount" inputMode="decimal" defaultValue={initial.rawAmount} autoFocus {...errorProps('rawAmount')} />
    {fieldError('rawAmount')}
    <label htmlFor={id('unit')}>Einheit</label>
    <select id={id('unit')} name="inputUnit" defaultValue={initial.inputUnit} {...errorProps('inputUnit')}>
      {initial.inputUnit === 'COUNT'
        ? <option value="COUNT">Stück</option>
        : ['SCU', 'cSCU', 'mSCU', 'µSCU'].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
    </select>
    {fieldError('inputUnit')}
    <label htmlFor={id('quality')}>Qualität</label>
    <input id={id('quality')} name="quality" inputMode="numeric" defaultValue={row.quality} {...errorProps('quality')} />
    {fieldError('quality')}
    <label htmlFor={id('location')}>Location</label>
    <select id={id('location')} name="locationId" defaultValue={row.location_id} {...errorProps('locationId')}>
      <option value="">Location auswählen</option>
      {!currentLocationAvailable && <option value={row.location_id}>{row.location_name} (aktuelle Location, nicht verfügbar)</option>}
      {locations.map((location) => <option key={location.id} value={location.id}>{location.canonical_name}</option>)}
    </select>
    {fieldError('locationId')}
    <button type="submit" disabled={pending}>Speichern</button>
    <button type="button" disabled={pending} onClick={onCancel}>Abbrechen</button>
    {result && !result.ok && <div role="alert">{message}</div>}
    <div role="status">{pending ? 'Speichern …' : null}</div>
  </form>
}
