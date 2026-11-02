import type { InventoryRow } from './inventory-result'

export type UnitMode = 'AUTO' | 'SCU' | 'µSCU'
export type MaterialKind = 'count' | 'volume' | undefined

export function sumDecimals(values: string[]): string {
  const scale = Math.max(0, ...values.map((value) => (value.split('.')[1] ?? '').length))
  const sum = values.reduce((total, value) => {
    const [whole, fraction = ''] = value.split('.')
    return total + BigInt(whole + fraction.padEnd(scale, '0'))
  }, 0n)
  if (!scale) return sum.toString()
  const digits = sum.toString().padStart(scale + 1, '0')
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  return digits.slice(0, -scale) + (fraction ? `.${fraction}` : '')
}

export function formatQuantity(rows: InventoryRow[], kind: MaterialKind, mode: UnitMode): string {
  if (kind === 'count') return `${sumDecimals(rows.map((row) => row.amount))} Stück`
  if (kind === 'volume') {
    const micro = rows.reduce((total, row) => total + BigInt(row.amount_micro_scu), 0n)
    if (mode === 'µSCU') return `${micro} µSCU`
    const fraction = (micro % 1000000n).toString().padStart(6, '0').replace(/0+$/, '')
    return `${micro / 1000000n}${fraction ? `.${fraction}` : ''} SCU`
  }
  return 'Einheit unbekannt'
}
