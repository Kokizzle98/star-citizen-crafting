import type { InventoryRow } from './inventory-result'

export type UnitMode = 'AUTO' | 'SCU' | 'cSCU' | 'mSCU' | 'µSCU'
export type MaterialKind = 'count' | 'volume' | undefined

const MICRO_SCU_PER_UNIT = {
  SCU: 1_000_000n,
  cSCU: 10_000n,
  mSCU: 1_000n,
  'µSCU': 1n,
} as const

export function sumDecimals(values: string[]): string {
  const scale = Math.max(
    0,
    ...values.map((value) => (value.split('.')[1] ?? '').length),
  )

  const sum = values.reduce((total, value) => {
    const [whole, fraction = ''] = value.split('.')
    return total + BigInt(whole + fraction.padEnd(scale, '0'))
  }, 0n)

  if (!scale) return sum.toString()

  const digits = sum.toString().padStart(scale + 1, '0')
  const fraction = digits.slice(-scale).replace(/0+$/, '')

  return digits.slice(0, -scale) + (fraction ? `.${fraction}` : '')
}

function formatMicroScu(
  microScu: bigint,
  unit: Exclude<UnitMode, 'AUTO'>,
): string {
  const factor = MICRO_SCU_PER_UNIT[unit]

  if (factor === 1n) {
    return `${microScu} µSCU`
  }

  const whole = microScu / factor
  const remainder = microScu % factor

  if (remainder === 0n) {
    return `${whole} ${unit}`
  }

  const decimalPlaces = factor.toString().length - 1
  const fraction = remainder
    .toString()
    .padStart(decimalPlaces, '0')
    .replace(/0+$/, '')

  return `${whole}.${fraction} ${unit}`
}

function autoVolumeUnit(
  microScu: bigint,
): Exclude<UnitMode, 'AUTO'> {
  if (microScu >= MICRO_SCU_PER_UNIT.SCU) {
    return 'SCU'
  }

  if (microScu >= MICRO_SCU_PER_UNIT.cSCU) {
    return 'cSCU'
  }

  if (microScu >= MICRO_SCU_PER_UNIT.mSCU) {
    return 'mSCU'
  }

  return 'µSCU'
}

export function formatQuantity(
  rows: InventoryRow[],
  kind: MaterialKind,
  mode: UnitMode,
): string {
  if (kind === 'count') {
    return `${sumDecimals(rows.map((row) => row.amount))} Stück`
  }

  if (kind === 'volume') {
    const microScu = rows.reduce(
      (total, row) => total + BigInt(row.amount_micro_scu),
      0n,
    )

    const displayUnit =
      mode === 'AUTO'
        ? autoVolumeUnit(microScu)
        : mode

    return formatMicroScu(microScu, displayUnit)
  }

  return 'Einheit unbekannt'
}
