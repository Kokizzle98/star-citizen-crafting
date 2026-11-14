import 'server-only'

import { getCrewContext } from '@/lib/groups/crew-context'
import type { InventoryErrorCode } from '@/lib/inventory/inventory-error-messages'
import { canonicalizeInventoryId } from '@/lib/inventory/inventory-update'
import { isAuthorizationError } from '@/lib/inventory/inventory-write'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type DeleteInventoryLotResult =
  | { ok: true; code: 'LOT_DELETED' }
  | { ok: false; code: InventoryErrorCode }

export async function deleteInventoryLot(inventoryId: string): Promise<DeleteInventoryLotResult> {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, code: 'AUTH_REQUIRED' }

  const crewContext = await getCrewContext(user.id)
  if (!crewContext.activeGroupId) return { ok: false, code: 'ACTIVE_GROUP_REQUIRED' }

  const canonicalId = canonicalizeInventoryId(inventoryId)
  if (!canonicalId) return { ok: false, code: 'LOT_ID_INVALID' }

  const { data, error } = await supabase
    .from('inventory')
    .delete()
    .eq('id', canonicalId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, code: isAuthorizationError(error) ? 'DELETE_NOT_ALLOWED' : 'DELETE_FAILED' }
  if (!data) return { ok: false, code: 'LOT_NOT_FOUND' }
  return { ok: true, code: 'LOT_DELETED' }
}
