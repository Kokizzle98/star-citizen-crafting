import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guardFabricatorDataset, type FabricatorDatasetGuardResult } from './fabricator-dataset-guard'
import { createFabricatorLiveSourceLoader, type FabricatorPreparedSource } from './fabricator-live-source-cache'

// Server read boundary of the Fabricator foundation (F1, owner decision D3 = A).
//
// Reads the repository-pinned LIVE mirror from data/scmdb (the same path
// lib/inventory/material-units.ts already uses at runtime) and accepts it only
// when its version equals the ACTIVE LIVE blueprint dataset in the database.
// The database read uses the signed-in user's session; RLS decides. No admin
// client, no service_role, no write of any kind. Not used by any UI in F1.

const SCMDB_DIRECTORY = path.join(process.cwd(), 'data', 'scmdb')

const loadPreparedSource = createFabricatorLiveSourceLoader(
  fileName => readFile(path.join(SCMDB_DIRECTORY, fileName), 'utf8'),
)

export type FabricatorSourceResult =
  | ({ status: 'ready'; datasetId: string } & FabricatorPreparedSource)
  | { status: 'guard_failed'; guard: Exclude<FabricatorDatasetGuardResult, { status: 'MATCH' }> }
  | { status: 'read_error' }

export async function getFabricatorLiveSource(): Promise<FabricatorSourceResult> {
  let prepared: FabricatorPreparedSource
  try {
    prepared = await loadPreparedSource()
  } catch (error) {
    console.error('Fabricator LIVE mirror unavailable', error)
    return { status: 'read_error' }
  }

  try {
    const { data, error } = await createSupabaseServerClient()
      .from('scmdb_blueprint_datasets')
      .select('id,source,channel,version,status,blueprint_total')
      .eq('source', 'SCMDB')
      .eq('channel', 'LIVE')
      .eq('status', 'ACTIVE')
    if (error) return { status: 'read_error' }

    const guard = guardFabricatorDataset(
      { channel: prepared.source.channel, version: prepared.source.version, blueprintTotal: prepared.source.blueprints.length },
      data,
    )
    if (guard.status !== 'MATCH') return { status: 'guard_failed', guard }
    return { status: 'ready', datasetId: guard.datasetId, ...prepared }
  } catch {
    return { status: 'read_error' }
  }
}
