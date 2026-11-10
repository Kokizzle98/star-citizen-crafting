import 'server-only'

import { getCrewContext } from '@/lib/groups/crew-context'
import type { InventoryErrorCode } from '@/lib/inventory/inventory-error-messages'
import {
  canonicalizeInventoryId,
  prepareInventoryLotUpdate,
  type UpdateInventoryLotInput,
} from '@/lib/inventory/inventory-update'
import { isAuthorizationError } from '@/lib/inventory/inventory-write'
import { getLiveMaterialUnits } from '@/lib/inventory/material-units'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type UpdateInventoryLotResult =
  | { ok: true; code: 'LOT_UPDATED' | 'LOT_MERGED' }
  | { ok: false; code: InventoryErrorCode }

function databaseError(error: { code?: string; message?: string }): UpdateInventoryLotResult {
  for (const code of ['AUTH_REQUIRED', 'LOT_ID_INVALID', 'LOT_NOT_FOUND', 'LOCATION_INVALID',
    'MATERIAL_UNIT_UNKNOWN', 'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND', 'QUALITY_OUT_OF_RANGE',
    'AMOUNT_MUST_BE_POSITIVE', 'AMOUNT_OUT_OF_RANGE'] as const) {
    if (error.message === code) return { ok: false, code }
  }
  return {
    ok: false,
    code: isAuthorizationError(error) ? 'UPDATE_NOT_ALLOWED' : 'UPDATE_FAILED',
  }
}

export async function updateInventoryLot(
  input: UpdateInventoryLotInput,
): Promise<UpdateInventoryLotResult> {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, code: 'AUTH_REQUIRED' }

  const crewContext = await getCrewContext(user.id)
  if (!crewContext.activeGroupId) return { ok: false, code: 'ACTIVE_GROUP_REQUIRED' }

  const inventoryId = canonicalizeInventoryId(input.inventoryId)
  if (!inventoryId) return { ok: false, code: 'LOT_ID_INVALID' }

  const { data: existingLot, error: readError } = await supabase
    .from('inventory')
    .select('id, material, location_id')
    .eq('id', inventoryId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (readError) return databaseError(readError)
  if (!existingLot) return { ok: false, code: 'LOT_NOT_FOUND' }

  const metadata = await getLiveMaterialUnits()
  const materialKind = metadata.available && Object.hasOwn(metadata.units, existingLot.material)
    ? metadata.units[existingLot.material]
    : undefined
  if (materialKind !== 'count' && materialKind !== 'volume') {
    return { ok: false, code: 'MATERIAL_UNIT_UNKNOWN' }
  }

  const prepared = prepareInventoryLotUpdate(input, materialKind)
  if (!prepared.ok) return prepared

  if (typeof existingLot.location_id !== 'string' || !existingLot.location_id.trim()) {
    console.error('Inventory lot has an invalid location')
    return { ok: false, code: 'UPDATE_FAILED' }
  }
  const unchangedLocation = prepared.value.locationId.toLowerCase() === existingLot.location_id.toLowerCase()
  if (!unchangedLocation) {
    const { data: location, error: locationError } = await supabase
      .from('inventory_locations')
      .select('id')
      .eq('id', prepared.value.locationId)
      .eq('is_archived', false)
      .maybeSingle()
    if (locationError) return databaseError(locationError)
    if (!location) return { ok: false, code: 'LOCATION_INVALID' }
  }

  const { data: updatedLot, error: updateError } = await supabase
    .rpc('update_or_merge_inventory_lot', {
      p_inventory_id: prepared.value.inventoryId,
      p_amount: prepared.value.amount,
      p_amount_micro_scu: prepared.value.amountMicroScu,
      p_input_unit: prepared.value.inputUnit,
      p_quantity_kind: materialKind === 'count' ? 'COUNT' : 'VOLUME',
      p_quality: prepared.value.quality,
      p_location_id: unchangedLocation ? existingLot.location_id : prepared.value.locationId,
    })
    .select('inventory_id::text,outcome,amount::text,amount_micro_scu::text')
    .maybeSingle()
  if (updateError) return databaseError(updateError)
  if (!updatedLot || typeof updatedLot.inventory_id !== 'string' ||
    !/^[1-9]\d*$/.test(updatedLot.inventory_id) ||
    typeof updatedLot.amount !== 'string' || !/^(?:0\.\d*[1-9]\d*|[1-9]\d*(?:\.\d+)?)$/.test(updatedLot.amount) ||
    typeof updatedLot.amount_micro_scu !== 'string' || !/^[1-9]\d*$/.test(updatedLot.amount_micro_scu) ||
    (updatedLot.outcome !== 'UPDATED' && updatedLot.outcome !== 'MERGED')) {
    console.error('Inventory edit returned an invalid result')
    return { ok: false, code: 'UPDATE_FAILED' }
  }

  return { ok: true, code: updatedLot.outcome === 'MERGED' ? 'LOT_MERGED' : 'LOT_UPDATED' }
}
