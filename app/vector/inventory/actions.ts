'use server'

import { revalidatePath } from 'next/cache'
import { addInventoryLot, type AddInventoryLotResult } from '@/lib/inventory/inventory-write'
import type { InventoryInputUnit } from '@/lib/inventory/inventory-quantity'
import { updateInventoryLot, type UpdateInventoryLotResult } from '@/lib/inventory/inventory-update-write'

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function isInputUnit(value: string): value is InventoryInputUnit {
  return value === 'COUNT' || value === 'SCU' || value === 'cSCU' ||
    value === 'mSCU' || value === 'µSCU'
}

export async function submitInventoryLot(formData: FormData): Promise<AddInventoryLotResult> {
  const inputUnit = text(formData, 'inputUnit')
  if (!isInputUnit(inputUnit)) {
    return { ok: false, code: inputUnit ? 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND' : 'UNIT_REQUIRED' }
  }

  const result = await addInventoryLot({
    material: text(formData, 'material'),
    rawAmount: text(formData, 'rawAmount'),
    inputUnit,
    quality: text(formData, 'quality'),
    locationId: text(formData, 'locationId'),
  })

  if (result.ok) revalidatePath('/vector/inventory')
  return result
}

export async function submitInventoryLotUpdate(formData: FormData): Promise<UpdateInventoryLotResult> {
  const inputUnit = text(formData, 'inputUnit')
  if (!isInputUnit(inputUnit)) {
    return { ok: false, code: inputUnit ? 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND' : 'UNIT_REQUIRED' }
  }

  const result = await updateInventoryLot({
    inventoryId: text(formData, 'inventoryId'),
    rawAmount: text(formData, 'rawAmount'),
    inputUnit,
    quality: text(formData, 'quality'),
    locationId: text(formData, 'locationId'),
  })
  if (result.ok && result.code === 'LOT_UPDATED') revalidatePath('/vector/inventory')
  return result
}
