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
      code: 'LOT_CREATED' | 'LOT_MERGED'
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

const ADD_OR_MERGE_ERROR_CODES = [
  'AUTH_REQUIRED',
  'PLAYER_CONTEXT_REQUIRED',
  'MATERIAL_REQUIRED',
  'MATERIAL_UNIT_UNKNOWN',
  'UNIT_NOT_ALLOWED_FOR_MATERIAL_KIND',
  'QUALITY_OUT_OF_RANGE',
  'LOCATION_INVALID',
  'AMOUNT_MUST_BE_POSITIVE',
  'AMOUNT_OUT_OF_RANGE',
] as const

function positiveIntegerText(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return false

  try {
    return BigInt(value) > 0n
  } catch {
    return false
  }
}

function positiveDecimalText(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d+(?:\.\d+)?$/.test(value)
  ) {
    return false
  }

  const digits = value.replace('.', '')

  try {
    return BigInt(digits) > 0n
  } catch {
    return false
  }
}

export function inventoryAddRpcOutcome(
  value: unknown,
): 'LOT_CREATED' | 'LOT_MERGED' | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null
  }

  const row = value as Record<string, unknown>

  if (
    !positiveIntegerText(row.inventory_id) ||
    !positiveDecimalText(row.amount) ||
    !positiveIntegerText(row.amount_micro_scu)
  ) {
    return null
  }

  if (row.outcome === 'CREATED') return 'LOT_CREATED'
  if (row.outcome === 'MERGED') return 'LOT_MERGED'

  return null
}

function inventoryAddRpcErrorCode(error: {
  code?: string
  message?: string
}): InventoryErrorCode {
  const message = error.message ?? ''

  for (const code of ADD_OR_MERGE_ERROR_CODES) {
    if (message.includes(code)) return code
  }

  return isAuthorizationError(error)
    ? 'INSERT_NOT_ALLOWED'
    : 'INSERT_FAILED'
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


  const { data: writeResult, error: writeError } = await supabase
    .rpc('add_or_merge_inventory_lot', {
      p_material: prepared.value.material,
      p_amount: prepared.value.amount,
      p_amount_micro_scu: prepared.value.amountMicroScu,
      p_input_unit: prepared.value.inputUnit,
      p_quantity_kind:
        materialKind === 'count' ? 'COUNT' : 'VOLUME',
      p_quality: prepared.value.quality,
      p_location_id: prepared.value.locationId,
    })
    .select(
      'inventory_id::text,outcome,amount::text,amount_micro_scu::text',
    )
    .maybeSingle()

  if (writeError) {
    console.error('Inventory lot add-or-merge failed', {
      code: writeError.code,
    })

    return {
      ok: false,
      code: inventoryAddRpcErrorCode(writeError),
    }
  }

  const successCode = inventoryAddRpcOutcome(writeResult)

  if (!successCode) {
    console.error(
      'Inventory lot add-or-merge returned an invalid result',
    )

    return {
      ok: false,
      code: 'INSERT_FAILED',
    }
  }

  return {
    ok: true,
    code: successCode,
  }
}
