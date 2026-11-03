import type { InventoryErrorCode } from './inventory-error-messages'
import {
  normalizeInventoryQuantity,
  type InventoryInputUnit,
  type MaterialKind,
  type NormalizedInventoryQuantity,
} from './inventory-quantity'

type LotFieldsInput = {
  rawAmount: string
  inputUnit: InventoryInputUnit
  quality: string
  locationId: string
}

type PreparedLotFields = NormalizedInventoryQuantity & {
  quality: number
  locationId: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseQuality(rawQuality: string):
  | { ok: true; value: number }
  | { ok: false; code: InventoryErrorCode } {
  const value = rawQuality.trim()

  if (!value) {
    return { ok: false, code: 'QUALITY_REQUIRED' }
  }

  if (!/^\d+$/.test(value)) {
    return { ok: false, code: 'QUALITY_INVALID' }
  }

  const quality = Number(value)

  if (!Number.isSafeInteger(quality)) {
    return { ok: false, code: 'QUALITY_INVALID' }
  }

  if (quality < 0 || quality > 1000) {
    return { ok: false, code: 'QUALITY_OUT_OF_RANGE' }
  }

  return { ok: true, value: quality }
}

export function prepareInventoryLotFields(
  input: LotFieldsInput,
  materialKind: MaterialKind,
): { ok: true; value: PreparedLotFields } | { ok: false; code: InventoryErrorCode } {
  const locationId = input.locationId.trim()

  if (!locationId) {
    return { ok: false, code: 'LOCATION_REQUIRED' }
  }

  if (!UUID_PATTERN.test(locationId)) {
    return { ok: false, code: 'LOCATION_INVALID' }
  }

  const quality = parseQuality(input.quality)

  if (!quality.ok) {
    return quality
  }

  const quantity = normalizeInventoryQuantity({
    rawAmount: input.rawAmount,
    materialKind,
    inputUnit: input.inputUnit,
  })

  if (!quantity.ok) {
    return quantity
  }

  return {
    ok: true,
    value: { ...quantity.value, quality: quality.value, locationId },
  }
}
