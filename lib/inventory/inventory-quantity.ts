import type { InventoryErrorCode } from './inventory-error-messages'

export type MaterialKind = 'count' | 'volume'

export type VolumeUnit = 'SCU' | 'cSCU' | 'mSCU' | 'µSCU'

export type InventoryInputUnit = VolumeUnit | 'COUNT'

export type QuantityNormalizationInput = {
  rawAmount: string
  materialKind: MaterialKind
  inputUnit: InventoryInputUnit
}

export type NormalizedInventoryQuantity = {
  amount: string
  amountMicroScu: string
  inputUnit: InventoryInputUnit
}

export type QuantityNormalizationResult =
  | {
      ok: true
      value: NormalizedInventoryQuantity
    }
  | {
      ok: false
      code: InventoryErrorCode
    }

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n
const MICRO_SCU_PER_SCU = 1_000_000n

const MICRO_SCU_PER_VOLUME_UNIT: Record<VolumeUnit, bigint> = {
  SCU: MICRO_SCU_PER_SCU,
  cSCU: 10_000n,
  mSCU: 1_000n,
  'µSCU': 1n,
}

function isVolumeUnit(unit: InventoryInputUnit): unit is VolumeUnit {
  return unit === 'SCU' ||
    unit === 'cSCU' ||
    unit === 'mSCU' ||
    unit === 'µSCU'
}

function normalizeDecimalSeparator(rawAmount: string): string {
  return rawAmount.trim().replace(',', '.')
}

function parseUnsignedDecimal(value: string):
  | {
      ok: true
      digits: bigint
      divisor: bigint
    }
  | {
      ok: false
      code: InventoryErrorCode
    } {
  if (value.length === 0) {
    return {
      ok: false,
      code: 'AMOUNT_REQUIRED',
    }
  }

  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    return {
      ok: false,
      code: 'AMOUNT_INVALID_FORMAT',
    }
  }

  const [wholePart, fractionPart = ''] = value.split('.')
  const combinedDigits = `${wholePart}${fractionPart}`
  const digits = BigInt(combinedDigits)
  const divisor = 10n ** BigInt(fractionPart.length)

  if (digits === 0n) {
    return {
      ok: false,
      code: 'AMOUNT_MUST_BE_POSITIVE',
    }
  }

  return {
    ok: true,
    digits,
    divisor,
  }
}

export function formatMicroScuAsScu(microScu: bigint): string {
  const whole = microScu / MICRO_SCU_PER_SCU
  const remainder = microScu % MICRO_SCU_PER_SCU

  if (remainder === 0n) {
    return whole.toString()
  }

  const fraction = remainder
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')

  return `${whole}.${fraction}`
}

function normalizeVolumeQuantity(
  rawAmount: string,
  inputUnit: InventoryInputUnit,
): QuantityNormalizationResult {
  if (!isVolumeUnit(inputUnit)) {
    return {
      ok: false,
      code: 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND',
    }
  }

  const parsed = parseUnsignedDecimal(
    normalizeDecimalSeparator(rawAmount),
  )

  if (!parsed.ok) {
    return parsed
  }

  const factor = MICRO_SCU_PER_VOLUME_UNIT[inputUnit]
  const scaled = parsed.digits * factor

  if (scaled % parsed.divisor !== 0n) {
    return {
      ok: false,
      code: 'AMOUNT_NOT_EXACT_MICRO_SCU',
    }
  }

  const microScu = scaled / parsed.divisor

  if (microScu <= 0n) {
    return {
      ok: false,
      code: 'AMOUNT_MUST_BE_POSITIVE',
    }
  }

  if (microScu > MAX_POSTGRES_BIGINT) {
    return {
      ok: false,
      code: 'AMOUNT_OUT_OF_RANGE',
    }
  }

  return {
    ok: true,
    value: {
      amount: formatMicroScuAsScu(microScu),
      amountMicroScu: microScu.toString(),
      inputUnit,
    },
  }
}

function normalizeCountQuantity(
  rawAmount: string,
  inputUnit: InventoryInputUnit,
): QuantityNormalizationResult {
  if (inputUnit !== 'COUNT') {
    return {
      ok: false,
      code: 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND',
    }
  }

  const normalized = rawAmount.trim()

  if (normalized.length === 0) {
    return {
      ok: false,
      code: 'AMOUNT_REQUIRED',
    }
  }

  if (/^\d+[.,]\d+$/.test(normalized)) {
    return {
      ok: false,
      code: 'AMOUNT_NOT_INTEGER',
    }
  }

  if (!/^\d+$/.test(normalized)) {
    return {
      ok: false,
      code: 'AMOUNT_INVALID_FORMAT',
    }
  }

  const count = BigInt(normalized)

  if (count <= 0n) {
    return {
      ok: false,
      code: 'AMOUNT_MUST_BE_POSITIVE',
    }
  }

  if (count > MAX_POSTGRES_BIGINT) {
    return {
      ok: false,
      code: 'AMOUNT_OUT_OF_RANGE',
    }
  }

  const canonicalCount = count.toString()

  return {
    ok: true,
    value: {
      amount: canonicalCount,

      // COUNT compatibility rule:
      // The current production schema requires amount_micro_scu to contain
      // a positive non-null bigint. For COUNT rows it mirrors the count and
      // must never be interpreted or displayed as a volume.
      amountMicroScu: canonicalCount,
      inputUnit: 'COUNT',
    },
  }
}

export function normalizeInventoryQuantity(
  input: QuantityNormalizationInput,
): QuantityNormalizationResult {
  if (input.materialKind === 'volume') {
    return normalizeVolumeQuantity(
      input.rawAmount,
      input.inputUnit,
    )
  }

  return normalizeCountQuantity(
    input.rawAmount,
    input.inputUnit,
  )
}
