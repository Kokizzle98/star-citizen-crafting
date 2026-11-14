'use server'

import { setBlueprintOwnership } from '@/lib/blueprints/blueprint-ownership-write'
import type { BlueprintOwnershipWriteResult } from '@/lib/blueprints/blueprint-catalog-result'

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

// Owner decision PR4-OD-01 = B: the client updates its ownership state only
// after this confirmed result. No revalidatePath here, so a toggle does not
// re-render and resend the whole catalog. The page itself is dynamic (it reads
// the session cookies), so every new request renders fresh server data.
export async function submitBlueprintOwnership(formData: FormData): Promise<BlueprintOwnershipWriteResult> {
  const intent = text(formData, 'intent')
  if (intent !== 'MARK' && intent !== 'UNMARK') return { ok: false, code: 'OWNERSHIP_ACTION_INVALID' }
  return setBlueprintOwnership(text(formData, 'blueprintId'), intent)
}
