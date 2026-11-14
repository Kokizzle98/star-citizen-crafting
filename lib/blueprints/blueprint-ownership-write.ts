import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  canonicalizeBlueprintId,
  ownershipWriteErrorCode,
  type BlueprintOwnershipWriteResult,
} from './blueprint-catalog-result'

// Write boundary for personal manual ownership. The only write paths are the
// RPCs mark_blueprint_owned() and unmark_blueprint_owned(); both act for
// auth.uid() and always write provenance MANUAL. No user id is ever accepted
// from the client and no database error detail leaves this boundary.

export type BlueprintOwnershipIntent = 'MARK' | 'UNMARK'

export async function setBlueprintOwnership(
  rawBlueprintId: string,
  intent: BlueprintOwnershipIntent,
): Promise<BlueprintOwnershipWriteResult> {
  const blueprintId = canonicalizeBlueprintId(rawBlueprintId)
  if (!blueprintId) return { ok: false, code: 'BLUEPRINT_ID_INVALID' }

  try {
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { ok: false, code: 'AUTH_REQUIRED' }

    const { error } = await supabase.rpc(
      intent === 'MARK' ? 'mark_blueprint_owned' : 'unmark_blueprint_owned',
      { p_blueprint_id: blueprintId },
    )
    if (error) return { ok: false, code: ownershipWriteErrorCode(error) }

    return {
      ok: true,
      code: intent === 'MARK' ? 'OWNERSHIP_MARKED' : 'OWNERSHIP_UNMARKED',
      blueprintId,
      confirmedAt: Date.now(),
    }
  } catch {
    return { ok: false, code: 'OWNERSHIP_UPDATE_FAILED' }
  }
}
