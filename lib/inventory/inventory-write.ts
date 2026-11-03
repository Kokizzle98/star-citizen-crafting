import 'server-only'

import { getCrewContext } from '@/lib/groups/crew-context'
import type { InventoryErrorCode } from '@/lib/inventory/inventory-error-messages'
import { prepareInventoryLotFields } from '@/lib/inventory/inventory-lot-validation'
import {
  type InventoryInputUnit,
  type MaterialKind,
} from '@/lib/inventory/inventory-quantity'
import { getLiveMaterialUnits } from '@/lib/inventory/material-units'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type AddInventoryLotInput = {
  material: string
  rawAmount: string
  inputUnit: InventoryInputUnit
  quality: string
  locationId: string
}

export type AddInventoryLotResult =
  | {
      ok: true
      code: 'LOT_CREATED'
    }
  | {
      ok: false
      code: InventoryErrorCode
    }

type PreparedInventoryLot = {
  material: string
  amount: string
  amountMicroScu: string
  inputUnit: InventoryInputUnit
  quality: number
  locationId: string
}

type PrepareInventoryLotResult =
  | {
      ok: true
      value: PreparedInventoryLot
    }
  | {
      ok: false
      code: InventoryErrorCode
    }

function normalizeRequiredText(value: string): string {
  return value.trim()
}

export function prepareInventoryLot(
  input: AddInventoryLotInput,
  materialKind: MaterialKind,
): PrepareInventoryLotResult {
  const material = normalizeRequiredText(input.material)

  if (!material) {
    return {
      ok: false,
      code: 'MATERIAL_REQUIRED',
    }
  }

  const fields = prepareInventoryLotFields(input, materialKind)

  if (!fields.ok) {
    return fields
  }

  return {
    ok: true,
    value: {
      material,
      ...fields.value,
    },
  }
}

export function isAuthorizationError(error: {
  code?: string
  message?: string
}): boolean {
  const message = error.message?.toLowerCase() ?? ''

  return error.code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied')
}

export async function addInventoryLot(
  input: AddInventoryLotInput,
): Promise<AddInventoryLotResult> {
  const supabase = createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      code: 'AUTH_REQUIRED',
    }
  }

  const crewContext = await getCrewContext(user.id)

  if (!crewContext.activeGroupId) {
    return {
      ok: false,
      code: 'ACTIVE_GROUP_REQUIRED',
    }
  }

  const material = normalizeRequiredText(input.material)

  if (!material) {
    return {
      ok: false,
      code: 'MATERIAL_REQUIRED',
    }
  }

  const metadata = await getLiveMaterialUnits()
  const materialKind = Object.hasOwn(metadata.units, material)
    ? metadata.units[material]
    : undefined

  if (!metadata.available || !materialKind) {
    return {
      ok: false,
      code: 'MATERIAL_UNIT_UNKNOWN',
    }
  }

  const prepared = prepareInventoryLot(input, materialKind)

  if (!prepared.ok) {
    return prepared
  }

  const [
    { data: gameAccount, error: gameAccountError },
    { data: location, error: locationError },
  ] = await Promise.all([
    supabase
      .from('game_accounts')
      .select('handle')
      .eq('user_id', user.id)
      .eq('game_code', 'STAR_CITIZEN')
      .eq('is_primary', true)
      .eq('verification_status', 'VERIFIED')
      .is('revoked_at', null)
      .maybeSingle(),
    supabase
      .from('inventory_locations')
      .select('id')
      .eq('id', prepared.value.locationId)
      .eq('is_archived', false)
      .maybeSingle(),
  ])

  const playerName =
    typeof gameAccount?.handle === 'string'
      ? gameAccount.handle.trim()
      : ''

  if (gameAccountError || !playerName) {
    return {
      ok: false,
      code: 'PLAYER_CONTEXT_REQUIRED',
    }
  }

  if (locationError || !location) {
    return {
      ok: false,
      code: 'LOCATION_INVALID',
    }
  }

  const { error: insertError } = await supabase
    .from('inventory')
    .insert({
      player_name: playerName,
      material: prepared.value.material,
      amount: prepared.value.amount,
      amount_micro_scu: prepared.value.amountMicroScu,
      input_unit: prepared.value.inputUnit,
      quality: prepared.value.quality,
      location_id: prepared.value.locationId,
    })

  if (insertError) {
    console.error('Inventory lot insert failed', {
      code: insertError.code,
    })

    return {
      ok: false,
      code: isAuthorizationError(insertError)
        ? 'INSERT_NOT_ALLOWED'
        : 'INSERT_FAILED',
    }
  }

  return {
    ok: true,
    code: 'LOT_CREATED',
  }
}
