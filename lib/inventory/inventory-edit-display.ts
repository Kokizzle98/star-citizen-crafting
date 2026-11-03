import type { InventoryRow } from './inventory-result'
import type { InventoryInputUnit, MaterialKind, VolumeUnit } from './inventory-quantity'

const divisors: Record<VolumeUnit, bigint> = {
  SCU: 1000000n,
  cSCU: 10000n,
  mSCU: 1000n,
  'µSCU': 1n,
}

export function inventoryEditInitialValue(
  row: InventoryRow,
  kind: MaterialKind | undefined,
): { rawAmount: string; inputUnit: InventoryInputUnit } | null {
  if (kind === 'count') {
    return row.input_unit === 'COUNT' && /^[1-9]\d*$/.test(row.amount)
      ? { rawAmount: row.amount, inputUnit: 'COUNT' } : null
  }
  const unit = row.input_unit
  if (kind !== 'volume' || (unit !== 'SCU' && unit !== 'cSCU' && unit !== 'mSCU' && unit !== 'µSCU') ||
      !/^[1-9]\d*$/.test(row.amount_micro_scu)) return null
  const divisor = divisors[unit]
  const value = BigInt(row.amount_micro_scu)
  const whole = value / divisor
  const remainder = value % divisor
  const fraction = remainder === 0n ? '' : `.${remainder.toString().padStart(divisor.toString().length - 1, '0').replace(/0+$/, '')}`
  return { rawAmount: `${whole}${fraction}`, inputUnit: unit }
}
