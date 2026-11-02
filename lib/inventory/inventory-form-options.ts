import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export type InventoryLocationOption = { id: string; canonical_name: string }

export async function getInventoryLocationOptions(): Promise<
  | { ok: true; locations: InventoryLocationOption[] }
  | { ok: false }
> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('inventory_locations')
    .select('id, canonical_name')
    .eq('is_archived', false)
    .order('canonical_name')

  if (error || !Array.isArray(data)) {
    console.error('Inventory locations could not be loaded', error)
    return { ok: false }
  }

  if (!data.every((location) =>
    typeof location.id === 'string' && location.id.trim() &&
    typeof location.canonical_name === 'string' && location.canonical_name.trim()
  )) {
    console.error('Invalid inventory location data')
    return { ok: false }
  }

  return { ok: true, locations: data }
}
