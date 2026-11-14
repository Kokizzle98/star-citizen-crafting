import type { FabricatorItem } from './fabricator-types'

// Component size for the Fabricator (F1). Source: the SCMDB item `size`,
// which matches the blueprint subtype `sizeN` for every ship component in the
// verified LIVE dataset. Size is only shown where it is a component size;
// armor (always 1 except backpacks), personal weapons and the remaining item
// kinds stay NOT_APPLICABLE. No size is ever synthesized.

export const SIZE_RELEVANT_ATTACH_TYPES: ReadonlySet<string> = new Set([
  'PowerPlant', 'Cooler', 'Shield', 'QuantumDrive', 'Radar',
  'WeaponGun', 'WeaponMining', 'TractorBeam', 'SalvageHead',
])

export type FabricatorSize =
  | { status: 'RESOLVED'; value: number; label: string }
  | { status: 'NOT_APPLICABLE' }
  | { status: 'SOURCE_DATA_MISSING' }

export function normalizeFabricatorSize(item: Pick<FabricatorItem, 'attachType' | 'size'> | null): FabricatorSize {
  if (item === null || !SIZE_RELEVANT_ATTACH_TYPES.has(item.attachType)) return { status: 'NOT_APPLICABLE' }
  const size = item.size
  if (size === null || !Number.isInteger(size) || size < 0) return { status: 'SOURCE_DATA_MISSING' }
  return { status: 'RESOLVED', value: size, label: `S${size}` }
}
