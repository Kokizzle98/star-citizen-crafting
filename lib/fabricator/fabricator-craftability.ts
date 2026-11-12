import { isQuality, selectBestQuality, type QualityPart } from '../quality/quality-weighting'
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
// - F3: when the same material occurs in several slots of one recipe, the
//   stock is shared: it is allocated once over the total requirement of those
//   slots (in slot order) and never counted fully for every slot (owner-
//   approved fix of the F2 duplicate-material defect).
// - F3 (OQ-F3-1, D-F3-1): every covered slot carries its best reachable
//   quantity-weighted input quality (only the used part of a lot counts,
//   highest qualities first, rounded down). Shared slots get the quality of the
//   joint selection, which is the best common value for all of them.

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
  reason: null | 'BELOW_MIN_QUALITY' | 'DIMENSION_MISMATCH' | 'QUANTITY_INVALID' | 'QUALITY_INVALID'
}

export type FabricatorSlotStatus = 'COVERED' | 'INSUFFICIENT' | 'NONE' | 'UNRESOLVED'

export type FabricatorSlotCraftability = {
  slotKey: string
  status: FabricatorSlotStatus
  required: bigint
  /**
   * Usable quantity available for this slot. For a material shared by several
   * slots this is the part left after the earlier slots of that material.
   */
  available: bigint
  missing: bigint
  surplus: bigint
  lots: FabricatorLotUse[]
  locationCount: number
  playerCount: number
  /** Other slot keys of this recipe that need the same material (shared stock). */
  sharedWith: string[]
  /**
   * Best reachable input quality (integer, rounded down) for the requirement;
   * only set when the slot, and for shared stock its whole material group, is covered.
   */
  quality: number | null
  /** The lot parts that reach `quality` (for shared stock: the whole material group). */
  selection: QualityPart[]
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

function lotUses(material: FabricatorMaterialView, lotsByMaterial: ReadonlyMap<string, readonly FabricatorCrewLot[]>): FabricatorLotUse[] {
  return (lotsByMaterial.get(material.name) ?? []).map(lot => {
    const { quantity, reason } = lotQuantity(material, lot)
    if (reason) return { lot, quantity, usable: false, reason }
    if (!isQuality(lot.quality)) return { lot, quantity, usable: false, reason: 'QUALITY_INVALID' }
    if (lot.quality < material.minQuality) return { lot, quantity, usable: false, reason: 'BELOW_MIN_QUALITY' }
    return { lot, quantity, usable: true, reason: null }
  })
}

// Exact material identity inside one recipe (dimension + exact name). Should a
// group ever carry different minQualities, the strictest one applies to the
// whole group, so shared stock is never over-counted (not seen in LIVE data).
const materialGroupKey = (material: FabricatorMaterialView) => `${material.unit}\u0000${material.name}`

function slotsCraftability(
  recipe: FabricatorRecipeView,
  lotsByMaterial: ReadonlyMap<string, readonly FabricatorCrewLot[]>,
): FabricatorSlotCraftability[] {
  const groups = new Map<string, number[]>()
  recipe.slots.forEach((slot, index) => {
    const key = materialGroupKey(slot.material)
    groups.set(key, [...(groups.get(key) ?? []), index])
  })
  const result: FabricatorSlotCraftability[] = new Array(recipe.slots.length)
  for (const indexes of groups.values()) {
    const first = recipe.slots[indexes[0]].material
    const minQuality = Math.max(...indexes.map(i => recipe.slots[i].material.minQuality))
    const lots = lotUses({ ...first, minQuality }, lotsByMaterial)
    const usable = lots.filter(use => use.usable && use.quantity !== null)
    const parts: QualityPart[] = usable.map(use => ({ ref: use.lot.id, quantity: use.quantity as bigint, quality: use.lot.quality }))
    const totalRequired = indexes.reduce((sum, i) => sum + BigInt(recipe.slots[i].material.required), 0n)
    const joint = totalRequired > 0n && parts.length > 0 ? selectBestQuality(totalRequired, parts) : null
    const covered = joint?.status === 'COVERED'
    const locationCount = new Set(usable.map(use => use.lot.locationId)).size
    const playerCount = new Set(usable.map(use => use.lot.playerName)).size
    let remaining = parts.reduce((sum, part) => sum + part.quantity, 0n)
    indexes.forEach((index, position) => {
      const slot = recipe.slots[index]
      const required = BigInt(slot.material.required)
      const last = position === indexes.length - 1
      const available = last ? remaining : remaining < required ? remaining : required
      remaining -= available
      const unresolved = slot.material.vocabulary !== 'RESOLVED'
      const status: FabricatorSlotStatus = unresolved
        ? 'UNRESOLVED'
        : available >= required ? 'COVERED' : available > 0n ? 'INSUFFICIENT' : 'NONE'
      result[index] = {
        slotKey: slot.slotKey,
        status,
        required,
        available,
        missing: available >= required ? 0n : required - available,
        surplus: available > required ? available - required : 0n,
        lots,
        locationCount,
        playerCount,
        sharedWith: indexes.filter(other => other !== index).map(other => recipe.slots[other].slotKey),
        quality: !unresolved && covered ? joint.quality : null,
        selection: !unresolved && covered ? joint.used : [],
      }
    })
  }
  return result
}

export function recipeCraftability(
  recipe: FabricatorRecipeView,
  lotsByMaterial: ReadonlyMap<string, readonly FabricatorCrewLot[]>,
): FabricatorRecipeCraftability {
  const slots = slotsCraftability(recipe, lotsByMaterial)
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
