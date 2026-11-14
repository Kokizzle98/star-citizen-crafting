import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export type InventoryLocationOption = { id: string; canonical_name: string }

export async function getInventoryLocationOptions(): Promise<
  | { ok: true; locations: InventoryLocationOption[]; fallbackLocationId: string }
  | { ok: false }
> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('inventory_locations')
    .select('id, canonical_name, normalized_name, is_system')
    .eq('is_archived', false)
    .order('canonical_name')

  if (error || !Array.isArray(data)) {
    console.error('Inventory locations could not be loaded', error)
    return { ok: false }
  }

  if (!data.every((location) =>
    typeof location.id === 'string' && location.id.trim() &&
    typeof location.canonical_name === 'string' && location.canonical_name.trim() &&
    typeof location.normalized_name === 'string' && location.normalized_name.trim() &&
    typeof location.is_system === 'boolean'
  )) {
    console.error('Invalid inventory location data')
    return { ok: false }
  }

  const fallbacks = data.filter((location) =>
    location.is_system && location.normalized_name === 'unbekannt',
  )
  if (fallbacks.length !== 1) {
    console.error('Inventory fallback location is missing or ambiguous')
    return { ok: false }
  }

  return {
    ok: true,
    locations: data.map(({ id, canonical_name }) => ({ id, canonical_name })),
    fallbackLocationId: fallbacks[0].id,
  }
}
