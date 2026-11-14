export type InventoryRow = {
  inventory_id: string
  owner_user_id: string
  player_name: string
  material: string
  amount: string
  amount_micro_scu: string
  input_unit: string | null
  quality: number
  location_id: string
  location_name: string
  created_at: string
  updated_at: string
}

export type InventoryReadResult =
  | { status: 'success'; rows: InventoryRow[] }
  | { status: 'no_active_crew' }
  | { status: 'unauthorized' }
  | { status: 'read_error' }

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function positiveIntegerText(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value)
}

function positiveDecimalText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(?:0\.\d*[1-9]\d*|[1-9]\d*(?:\.\d+)?)$/.test(value)
  )
}

function timestamp(value: unknown): value is string {
  return nonempty(value) && Number.isFinite(Date.parse(value))
}

function inventoryRow(value: unknown): InventoryRow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (
    !positiveIntegerText(row.inventory_id) ||
    !nonempty(row.owner_user_id) || !nonempty(row.player_name) || !nonempty(row.material) ||
    !positiveDecimalText(row.amount) ||
    !positiveIntegerText(row.amount_micro_scu) ||
    (row.input_unit !== null && !nonempty(row.input_unit)) ||
    typeof row.quality !== 'number' || !Number.isInteger(row.quality) ||
    row.quality < 0 || row.quality > 1000 ||
    !nonempty(row.location_id) || !nonempty(row.location_name) ||
    !timestamp(row.created_at) || !timestamp(row.updated_at)
  ) return null

  return {
    inventory_id: row.inventory_id,
    owner_user_id: row.owner_user_id,
    player_name: row.player_name,
    material: row.material,
    amount: row.amount,
    amount_micro_scu: row.amount_micro_scu,
    input_unit: row.input_unit,
    quality: row.quality,
    location_id: row.location_id,
    location_name: row.location_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function inventoryReadResult(data: unknown, error: { message: string } | null): InventoryReadResult {
  if (error) {
    switch (error.message) {
      case 'ACTIVE_GROUP_REQUIRED': return { status: 'no_active_crew' }
      case 'ACTIVE_GROUP_NOT_ALLOWED':
      case 'AUTH_REQUIRED': return { status: 'unauthorized' }
      default: return { status: 'read_error' }
    }
  }
  if (!Array.isArray(data)) return { status: 'read_error' }

  const rows: InventoryRow[] = []
  for (const value of data) {
    const row = inventoryRow(value)
    if (!row) return { status: 'read_error' }
    rows.push(row)
  }
  return { status: 'success', rows }
}