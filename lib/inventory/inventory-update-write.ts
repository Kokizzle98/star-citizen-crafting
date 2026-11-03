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
  | { ok: true; code: 'LOT_UPDATED' }
  | { ok: false; code: InventoryErrorCode }

function databaseError(error: { code?: string; message?: string }): UpdateInventoryLotResult {
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
    .select('id, material')
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

  const { data: location, error: locationError } = await supabase
    .from('inventory_locations')
    .select('id')
    .eq('id', prepared.value.locationId)
    .eq('is_archived', false)
    .maybeSingle()
  if (locationError) return databaseError(locationError)
  if (!location) return { ok: false, code: 'LOCATION_INVALID' }

  const { data: updatedLot, error: updateError } = await supabase
    .from('inventory')
    .update({
      amount: prepared.value.amount,
      amount_micro_scu: prepared.value.amountMicroScu,
      input_unit: prepared.value.inputUnit,
      quality: prepared.value.quality,
      location_id: prepared.value.locationId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prepared.value.inventoryId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()
  if (updateError) return databaseError(updateError)
  if (!updatedLot) return { ok: false, code: 'LOT_NOT_FOUND' }

  return { ok: true, code: 'LOT_UPDATED' }
}
