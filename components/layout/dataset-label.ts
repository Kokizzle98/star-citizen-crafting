// Topbar dataset label (UX-6a). The caller passes the repository-pinned LIVE
// version that the Fabricator and the Blueprint sync already use, so there is
// no second hard-coded version here. LIVE only: no selection, no PTU.

const LIVE_VERSION = /^(\d+\.\d+\.\d+)-live\.\d+$/

export type DatasetLabel = { gameVersion: string | null; build: string }

export function liveDatasetLabel(pinVersion: string): DatasetLabel {
  const match = LIVE_VERSION.exec(pinVersion)
  return { gameVersion: match ? match[1] : null, build: pinVersion }
}
