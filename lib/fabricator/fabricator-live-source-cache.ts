import { functionalFingerprint } from './fabricator-fingerprint'
import { liveFilesFromManifest, prepareFabricatorLiveSource } from './fabricator-live-source'
import { buildFabricatorProductHierarchy, type FabricatorProductHierarchy } from './fabricator-product-family'
import type { FabricatorLiveSource } from './fabricator-types'

// Module-level cache for the prepared LIVE mirror (Fabricator F1).
//
// The mirror is pinned in the repository and therefore immutable for the
// lifetime of one server process (one deployment). The large JSON documents
// are read and parsed once per process; only the prepared domain model is
// kept, never the raw documents. A failed load is not cached, so the next
// request retries instead of serving a permanent error.

export type FabricatorPreparedSource = {
  source: FabricatorLiveSource
  hierarchy: FabricatorProductHierarchy
}

/** Reads one file from `data/scmdb/` as text. Injected so the cache stays testable. */
export type ScmdbTextReader = (fileName: string) => Promise<string>

const SAFE_FILE = /^[A-Za-z0-9_.-]+\.json$/

export function createFabricatorLiveSourceLoader(readText: ScmdbTextReader): () => Promise<FabricatorPreparedSource> {
  let pending: Promise<FabricatorPreparedSource> | null = null

  const read = async (fileName: string): Promise<unknown> => {
    if (!SAFE_FILE.test(fileName)) throw new Error('FABRICATOR_SOURCE_FILE_NAME_INVALID')
    return JSON.parse(await readText(fileName))
  }

  const load = async (): Promise<FabricatorPreparedSource> => {
    const manifest = await read('latest.json')
    const files = liveFilesFromManifest(manifest)
    const [blueprintDocument, itemDocument] = await Promise.all([read(files.blueprintFile), read(files.itemFile)])
    const source = prepareFabricatorLiveSource(manifest, blueprintDocument, itemDocument)
    const hierarchy = buildFabricatorProductHierarchy(source.blueprints, source.items, {
      fingerprint: (blueprint, item) => functionalFingerprint(source, blueprint, item),
    })
    return { source, hierarchy }
  }

  return () => {
    if (!pending) {
      pending = load().catch(error => {
        pending = null
        throw error
      })
    }
    return pending
  }
}
