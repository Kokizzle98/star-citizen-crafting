import type { InventoryErrorCode } from './inventory-error-messages'
import { prepareInventoryLotFields } from './inventory-lot-validation'
import type { InventoryInputUnit, MaterialKind } from './inventory-quantity'

export type UpdateInventoryLotInput = {
  inventoryId: string
  rawAmount: string
  inputUnit: InventoryInputUnit
  quality: string
  locationId: string
}

export type PreparedInventoryLotUpdate = {
  inventoryId: string
  amount: string
  amountMicroScu: string
  inputUnit: InventoryInputUnit
  quality: number
  locationId: string
}

export type PrepareInventoryLotUpdateResult =
  | { ok: true; value: PreparedInventoryLotUpdate }
  | { ok: false; code: InventoryErrorCode }

const MAX_INVENTORY_ID = 9_223_372_036_854_775_807n

export function prepareInventoryLotUpdate(
  input: UpdateInventoryLotInput,
  materialKind: MaterialKind,
): PrepareInventoryLotUpdateResult {
  if (!/^\d+$/.test(input.inventoryId)) {
    return { ok: false, code: 'LOT_ID_INVALID' }
  }

  const inventoryId = BigInt(input.inventoryId)

  if (inventoryId <= 0n || inventoryId > MAX_INVENTORY_ID) {
    return { ok: false, code: 'LOT_ID_INVALID' }
  }

  if (materialKind !== 'count' && materialKind !== 'volume') {
    return {
      ok: false,
      code: 'MATERIAL_UNIT_UNKNOWN',
    }
  }

  const fields = prepareInventoryLotFields(input, materialKind)

  if (!fields.ok) {
    return fields
  }

  return {
    ok: true,
    value: { inventoryId: inventoryId.toString(), ...fields.value },
  }
}
