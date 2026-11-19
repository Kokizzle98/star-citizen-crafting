// Synthetic fixtures for the domain precheck tests. Not a test file itself.
import { DOMAIN_REGISTER, REGISTER_VERSION } from '../scripts/domain-precheck/register.mjs'

export const SHA = 'a'.repeat(40)
export const OTHER_SHA = 'b'.repeat(40)
export const VERSIONS = { projector: 'p1', register: REGISTER_VERSION, resolvers: {} }
export const clone = value => structuredClone(value)

const guid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PER_BUILD = {
  cig_data_issues: 'cig_data_issues', crafting_blueprints: 'crafting_blueprints', crafting_items: 'crafting_items',
  merged: 'merged', mining_data: 'mining_data', mining_equipment: 'mining_equipment', mission_history: 'mission-history',
}

/** A complete, consistent synthetic mirror as role -> parsed document. */
export function makeMirror({ live = '4.10.2-live.1000', ptu = '4.10.3-ptu.2000' } = {}) {
  const docs = { static: {}, channels: {} }
  const latest = { schema: 2, generated_at: '2026-01-01T00:00:00Z', channels: {} }
  for (const version of [live, ptu]) {
    const channel = version.includes('-live.') ? 'live' : 'ptu'
    const files = {}
    for (const [role, prefix] of Object.entries(PER_BUILD)) files[role] = `${prefix}-${version}.json`
    latest.channels[channel] = { version, generated_at: '2026-01-01T00:00:00Z', files }
    docs.channels[channel] = {
      crafting_blueprints: {
        version, meta: { blueprints: 2 }, dismantle: { x: 1 }, properties: { p1: { name: 'P1', category: 'c' } },
        resources: ['r1', 'r2'], items: ['i1'],
        blueprints: [{ guid: guid(1), tag: 't1', productEntityClass: guid(11), gear: 'g' }, { guid: guid(2), tag: 't2', productEntityClass: guid(12), gear: 'g' }],
      },
      crafting_items: {
        version, meta: { items: 1 }, ammoPools: [{ a: 1 }, { a: 2 }], fireModesPools: [{ f: 1 }], manufacturers: { m: { name: 'M' } },
        items: [{ entityClass: guid(11), itemType: 'weapon', attachType: 'x', size: 1 }],
      },
      merged: {
        version, scopes: { s: 1 }, locationPools: { l1: { name: 'L1', type: 'planet' }, l2: { name: 'L2', type: 'moon' } },
        blueprintPools: { bp1: { name: 'B', source: 's', blueprints: [guid(1)] } }, contracts: [{ id: 'c1' }, { id: 'c2' }],
        factions: { f: { name: 'F' } }, ships: { s: 1 },
      },
      mining_data: { version, meta: {}, presets: [1] },
      mining_equipment: { version, meta: {}, lasers: [1] },
      mission_history: { schema: 1, channel, current_version: version, generated_at: '2026-01-01T00:00:00Z', missions: {} },
      cig_data_issues: { notes: [] },
    }
  }
  docs.static = {
    latest,
    game_versions: [{ version: live, file: 'x' }],
    versions: [{ version: live, file: 'x' }],
    changelog: [{ version: '1.0.0', date: '2026-01-01', changes: [] }],
    deltas_live: { environment: 'live', pairs: [] },
    deltas_ptu: { environment: 'ptu', pairs: [] },
    local_mirror_manifest: { source: 'x', generatedAt: '2026-01-01T00:00:00Z' },
    mema_cache: [{ contract_id: 'c1', updated_at: '2026-01-01T00:00:00Z' }],
    workflow_state: { mema_cache_interval_hours: 12, mema_cache_last_refreshed: '2026-01-01T00:00:00Z' },
    site_settings: {
      id: 1, blueprints_enabled: true, ptu_enabled: true, updated_at: '2026-01-01T00:00:00Z',
      scenario_overrides: { live: { A: true }, ptu: { A: false } }, mema_enabled: true,
      mema_cache_interval_hours: 12, mema_cache_last_refreshed: '2026-01-01T00:00:00Z',
    },
  }
  return docs
}

/** Serializes parsed documents into the role -> text map the precheck takes. */
export function toFiles(docs) {
  const files = {}
  for (const [role, doc] of Object.entries(docs.static)) files[role] = JSON.stringify(doc, null, 1)
  for (const [channel, roles] of Object.entries(docs.channels)) {
    for (const [role, doc] of Object.entries(roles)) files[`${channel}/${role}`] = JSON.stringify(doc, null, 1)
  }
  return files
}

export function side(docs, extra = {}) {
  return { files: toFiles(docs), versions: clone(VERSIONS), ...extra }
}

export const candidateOf = (docs, extra = {}) => ({ ...side(docs), sourceExport: { upstreamCommitSha: SHA }, ...extra })

/** Moves one channel to a new build: latest.json, file names and the `version` of every document. */
export function rebuild(docs, channel, newBuild) {
  const out = clone(docs)
  const entry = out.static.latest.channels[channel]
  const oldVersion = entry.version
  const newVersion = oldVersion.replace(/\.\d+$/, `.${newBuild}`)
  entry.version = newVersion
  entry.generated_at = '2026-02-02T00:00:00Z'
  for (const [role, name] of Object.entries(entry.files)) entry.files[role] = name.replace(oldVersion, newVersion)
  for (const doc of Object.values(out.channels[channel])) {
    if (doc.version === oldVersion) doc.version = newVersion
    if (doc.current_version === oldVersion) doc.current_version = newVersion
  }
  return out
}

export const domainResult = (output, channel, domain) => output.channels[channel]?.domains.find(entry => entry.domain === domain)
export const results = (output, channel) => Object.fromEntries(output.channels[channel].domains.map(entry => [entry.domain, entry.result]))
export const codes = (output, channel, domain) => domainResult(output, channel, domain).reasons.map(reason => reason.code)
export const allDomains = DOMAIN_REGISTER.domains
