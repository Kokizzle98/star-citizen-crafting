import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { inventoryReadResult, type InventoryReadResult } from './inventory-result'

export type { InventoryReadResult, InventoryRow } from './inventory-result'

export async function getActiveGroupInventory(): Promise<InventoryReadResult> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.rpc('get_active_group_inventory').select(
      'inventory_id::text,owner_user_id,player_name,material,amount::text,amount_micro_scu::text,input_unit,quality,location_id,location_name,created_at,updated_at',
    )
    return inventoryReadResult(data, error)
  } catch {
    return { status: 'read_error' }
  }
}
