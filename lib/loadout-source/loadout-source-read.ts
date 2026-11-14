import 'server-only'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { liveFilesFromManifest } from '@/lib/fabricator/fabricator-live-source'
import { evaluateLoadoutSource, type LoadoutSourceState } from './loadout-source-reader'

// Server read boundary of the vehicle loadout source (F4-S). Not used by any
// UI. Reads the locally generated, git-ignored index and the repository-pinned
// SCMDB manifest. No database, no network, no write. A missing index (the
// normal case on Vercel) is UNAVAILABLE, never an error and never a fallback.

export const LOADOUT_INDEX_RELATIVE_PATH = path.join('data', 'derived', 'loadout-source', 'scunpacked-live-loadout-index.json')

let cached: { mtimeMs: number; size: number; text: string } | null = null

async function readIndexText(): Promise<{ text: string | null; failed: boolean }> {
  const file = path.join(process.cwd(), LOADOUT_INDEX_RELATIVE_PATH)
  try {
    const info = await stat(file)
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return { text: cached.text, failed: false }
    const text = await readFile(file, 'utf8')
    cached = { mtimeMs: info.mtimeMs, size: info.size, text }
    return { text, failed: false }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { text: null, failed: false }
    return { text: null, failed: true }
  }
}

export async function getLoadoutSource(): Promise<LoadoutSourceState> {
  const { text, failed } = await readIndexText()
  let expected: string | null = null
  try {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), 'data', 'scmdb', 'latest.json'), 'utf8'))
    expected = liveFilesFromManifest(manifest).version
  } catch {
    expected = null
  }
  return evaluateLoadoutSource(text, expected, { readFailed: failed })
}
