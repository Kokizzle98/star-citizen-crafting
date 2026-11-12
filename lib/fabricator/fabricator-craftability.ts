import type { FabricatorMaterialView, FabricatorRecipeView } from './fabricator-catalog'

// Crew craftability for one recipe (Fabricator F2).
//
// Read-only comparison of the recipe requirement with the personal lots of the
// active crew as returned by get_active_group_inventory(). Nothing is reserved,
// consumed, moved or changed. Quantities are exact integers (BigInt): micro-SCU
// for resources, pieces for items; the two dimensions are never mixed.
//
// - A lot matches a material by exact name inside the same LIVE dataset
//   version (F1 contract) and by dimension: resources need a volume lot,
//   items need a COUNT lot.
// - A lot counts only when quality >= minQuality. Lots below stay visible.
// - "Available in the crew" never means "available at one place": the result
//   reports how many locations and players the usable lots are spread over.

export type FabricatorCrewLot = {
  id: string
  playerName: string
  material: string
  inputUnit: string | null
  amount: string
  amountMicroScu: string
  quality: number
  locationId: string
  locationName: string
}

export type FabricatorLotUse = {
  lot: FabricatorCrewLot
  /** Quantity in the material's dimension; null when it cannot be read exactly. */
  quantity: bigint | null
  usable: boolean
  reason: null | 'BELOW_MIN_QUALITY' | 'DIMENSION_MISMATCH' | 'QUANTITY_INVALID'
}

export type FabricatorSlotStatus = 'COVERED' | 'INSUFFICIENT' | 'NONE' | 'UNRESOLVED'

export type FabricatorSlotCraftability = {
  slotKey: string
  status: FabricatorSlotStatus
  required: bigint
  available: bigint
  missing: bigint
  surplus: bigint
  lots: FabricatorLotUse[]
  locationCount: number
  playerCount: number
}

export type FabricatorCraftabilityStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'UNRESOLVED'

export type FabricatorRecipeCraftability = {
  status: FabricatorCraftabilityStatus
  slots: FabricatorSlotCraftability[]
  /** True when the usable lots of the recipe are spread over more than one location. */
  multiLocation: boolean
}

const VOLUME_UNITS = new Set(['SCU', 'cSCU', 'mSCU', 'µSCU'])
const INTEGER = /^[1-9]\d*$/
const COUNT_AMOUNT = /^([1-9]\d*)(?:\.0+)?$/

/** Exact lot quantity in the dimension the material needs, or null. */
export function lotQuantity(material: Pick<FabricatorMaterialView, 'unit'>, lot: FabricatorCrewLot):
  { quantity: bigint | null; reason: FabricatorLotUse['reason'] } {
  if (material.unit === 'SCU') {
    if (lot.inputUnit === null || !VOLUME_UNITS.has(lot.inputUnit)) return { quantity: null, reason: 'DIMENSION_MISMATCH' }
    return INTEGER.test(lot.amountMicroScu)
      ? { quantity: BigInt(lot.amountMicroScu), reason: null }
      : { quantity: null, reason: 'QUANTITY_INVALID' }
  }
  if (lot.inputUnit !== 'COUNT') return { quantity: null, reason: 'DIMENSION_MISMATCH' }
  // COUNT rows mirror the count in amount_micro_scu (inventory COUNT compatibility rule); both must agree.
  const count = COUNT_AMOUNT.exec(lot.amount)
  if (!count || !INTEGER.test(lot.amountMicroScu) || count[1] !== lot.amountMicroScu) {
    return { quantity: null, reason: 'QUANTITY_INVALID' }
  }
  return { quantity: BigInt(lot.amountMicroScu), reason: null }
}

/** Groups crew lots by exact material name once per inventory snapshot. */
export function indexCrewLots(lots: readonly FabricatorCrewLot[]): Map<string, FabricatorCrewLot[]> {
  const index = new Map<string, FabricatorCrewLot[]>()
  for (const lot of lots) {
    const list = index.get(lot.material) ?? []
    list.push(lot)
    index.set(lot.material, list)
  }
  return index
}

function slotCraftability(
  slotKey: string,
  material: FabricatorMaterialView,
  lotsByMaterial: ReadonlyMap<string, readonly FabricatorCrewLot[]>,
): FabricatorSlotCraftability {
  const required = BigInt(material.required)
  const lots: FabricatorLotUse[] = (lotsByMaterial.get(material.name) ?? []).map(lot => {
    const { quantity, reason } = lotQuantity(material, lot)
    if (reason) return { lot, quantity, usable: false, reason }
    if (lot.quality < material.minQuality) return { lot, quantity, usable: false, reason: 'BELOW_MIN_QUALITY' }
    return { lot, quantity, usable: true, reason: null }
  })
  const usable = lots.filter(use => use.usable)
  const available = usable.reduce((sum, use) => sum + (use.quantity ?? 0n), 0n)
  const unresolved = material.vocabulary !== 'RESOLVED'
  const status: FabricatorSlotStatus = unresolved
    ? 'UNRESOLVED'
    : available >= required ? 'COVERED' : available > 0n ? 'INSUFFICIENT' : 'NONE'
  return {
    slotKey,
    status,
    required,
    available,
    missing: available >= required ? 0n : required - available,
    surplus: available > required ? available - required : 0n,
    lots,
    locationCount: new Set(usable.map(use => use.lot.locationId)).size,
    playerCount: new Set(usable.map(use => use.lot.playerName)).size,
  }
}

export function recipeCraftability(
  recipe: FabricatorRecipeView,
  lotsByMaterial: ReadonlyMap<string, readonly FabricatorCrewLot[]>,
): FabricatorRecipeCraftability {
  const slots = recipe.slots.map(slot => slotCraftability(slot.slotKey, slot.material, lotsByMaterial))
  const usableLocations = new Set(slots.flatMap(slot => slot.lots.filter(use => use.usable).map(use => use.lot.locationId)))
  const multiLocation = usableLocations.size > 1
  if (recipe.status !== 'RESOLVED' || slots.length === 0 || slots.some(slot => slot.status === 'UNRESOLVED')) {
    return { status: 'UNRESOLVED', slots, multiLocation }
  }
  const covered = slots.filter(slot => slot.status === 'COVERED').length
  const status: FabricatorCraftabilityStatus = covered === slots.length ? 'AVAILABLE' : covered > 0 ? 'PARTIAL' : 'UNAVAILABLE'
  return { status, slots, multiLocation }
}

const RANK: Record<FabricatorCraftabilityStatus, number> = { AVAILABLE: 0, PARTIAL: 1, UNAVAILABLE: 2, UNRESOLVED: 3 }

/** Family list status: the best status among its concrete blueprints ("beste Option"). */
export function bestCraftability(statuses: readonly FabricatorCraftabilityStatus[]): FabricatorCraftabilityStatus {
  return statuses.reduce<FabricatorCraftabilityStatus>((best, status) => (RANK[status] < RANK[best] ? status : best), 'UNRESOLVED')
}

/** Exact display of an integer quantity: micro-SCU as SCU (German decimal comma) or pieces. */
export function formatFabricatorQuantity(value: bigint, unit: 'SCU' | 'COUNT'): string {
  if (unit === 'COUNT') return `${value} Stk.`
  const whole = value / 1_000_000n
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${whole}${fraction ? `,${fraction}` : ''} SCU`
}
