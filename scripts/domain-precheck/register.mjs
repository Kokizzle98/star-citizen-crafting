// Domain register for the fail-closed domain precheck
// (docs/proposed/DATASET_PIPELINE_V1.md section 37.3).
//
// Versioned data, no logic. Initial content follows section 37.3, adjusted to
// the repository state that was verified when this file was written (see the
// "verified" notes per entry). Any change to this file is a rule change: bump
// REGISTER_VERSION. A new register version forces reprocessing of the affected
// domains (section 37.5).
//
// Owner decision 20: every consumer is assigned to exactly one activation path,
// FILE_GIT or DATABASE. A consumer that reads data/scmdb/ directly at runtime is
// FILE_GIT. Database-backed consumers (blueprint catalog, crew status) are
// DATABASE. The two paths are never aligned silently (section 35.3).

export const REGISTER_VERSION = '1'

export const ACTIVATION_PATHS = Object.freeze(['FILE_GIT', 'DATABASE'])

/** Channels the register knows. Any other channel token is HELD_FOR_REVIEW (33.4). */
export const CHANNELS = Object.freeze(['LIVE', 'PTU'])

/** Top-level fields left out of every canonical domain input (section 37.2, item 2). */
export const EXCLUDED_TOP_LEVEL_FIELDS = Object.freeze(['version', 'generated_at', 'meta'])

/**
 * Per-channel file roles. A role is the key under `channels.<channel>.files`
 * in latest.json. `domains` is informational: the domains below name the roles
 * they read.
 */
export const CHANNEL_ROLES = Object.freeze({
  crafting_blueprints: { class: 'GAME_DATA' },
  crafting_items: { class: 'GAME_DATA' },
  merged: { class: 'GAME_DATA' },
  mining_data: { class: 'GAME_DATA' }, // retained, no registered domain yet (37.3 rule 4)
  mining_equipment: { class: 'GAME_DATA' }, // retained, no registered domain yet
  mission_history: { class: 'SOURCE_EVIDENCE' },
  cig_data_issues: { class: 'SOURCE_EVIDENCE' },
})

/**
 * Channel-independent files. `non_trigger` files are hashed and recorded but a
 * change in them alone never triggers anything (36.3). `site_settings` is the
 * one guarded file: only the listed keys are non-trigger, any other change is
 * HELD_FOR_REVIEW (owner decision 19).
 */
export const STATIC_ROLES = Object.freeze({
  latest: { file: 'latest.json', class: 'IDENTITY_INDEX' },
  game_versions: { file: 'game-versions.json', class: 'IDENTITY_INDEX' },
  versions: { file: 'versions.json', class: 'IDENTITY_INDEX' },
  changelog: { file: 'changelog.json', class: 'SOURCE_EVIDENCE' },
  deltas_live: { file: 'deltas-live.json', class: 'BUILD_DIFF_EVIDENCE' },
  deltas_ptu: { file: 'deltas-ptu.json', class: 'BUILD_DIFF_EVIDENCE' },
  local_mirror_manifest: { file: 'local-mirror-manifest.json', class: 'VECTOR_OWN', non_trigger: true },
  mema_cache: { file: 'mema-cache.json', class: 'VOLATILE_DERIVED_STATISTIC', non_trigger: true },
  workflow_state: { file: 'workflow-state.json', class: 'TECHNICAL_ARTIFACT', non_trigger: true },
  site_settings: {
    file: 'site-settings.json',
    class: 'REVIEW',
    guarded: true,
    non_trigger_keys: Object.freeze(['mema_cache_last_refreshed', 'updated_at']),
  },
})

const sections = (role, names) => ({ role, sections: names })

export const DOMAINS = Object.freeze([
  {
    id: 'BLUEPRINT_CATALOG',
    channels: ['LIVE', 'PTU'],
    depends_on: [],
    inputs: [sections('crafting_blueprints', ['blueprints'])],
    consumers: [
      // Pure transform; its only caller is the sync script, whose product is
      // activated through the database.
      { path: 'lib/blueprints/blueprint-extractor.ts', kind: 'MIRROR_TRANSFORM', activation_path: 'DATABASE' },
      { path: 'scripts/sync-scmdb-blueprint-catalog.mjs', kind: 'MIRROR_INGESTION', activation_path: 'DATABASE' },
      // Runtime readers of the database catalog and of the crew status RPC.
      { path: 'lib/blueprints/blueprint-catalog-read.ts', kind: 'DATABASE_READER', activation_path: 'DATABASE' },
    ],
  },
  {
    id: 'REWARD_SOURCES',
    channels: ['LIVE', 'PTU'],
    depends_on: ['BLUEPRINT_CATALOG'],
    inputs: [sections('merged', ['contracts', 'blueprintPools'])],
    consumers: [
      { path: 'lib/blueprints/blueprint-reward-extractor.ts', kind: 'MIRROR_TRANSFORM', activation_path: 'DATABASE' },
      { path: 'scripts/sync-scmdb-blueprint-catalog.mjs', kind: 'MIRROR_INGESTION', activation_path: 'DATABASE' },
    ],
  },
  {
    id: 'LOCATIONS',
    channels: ['LIVE', 'PTU'],
    depends_on: [],
    inputs: [sections('merged', ['locationPools'])],
    consumers: [
      // No runtime or script caller reads the mirror for locations; only tests do.
      { path: 'lib/scmdb/location-extractor.ts', kind: 'MIRROR_TRANSFORM', activation_path: 'DATABASE' },
    ],
  },
  {
    id: 'FABRICATOR',
    channels: ['LIVE'],
    depends_on: [],
    inputs: [
      sections('crafting_blueprints', ['blueprints', 'properties', 'resources', 'items']),
      // `items` plus every `*Pools` section (fabricator-live-source.ts readPools).
      { role: 'crafting_items', sections: ['items'], section_patterns: [{ pattern: '^.+Pools$', min_matches: 1 }] },
    ],
    consumers: [
      { path: 'lib/fabricator/fabricator-live-source-read.ts', kind: 'MIRROR_READER', activation_path: 'FILE_GIT' },
      { path: 'lib/fabricator/fabricator-live-source-cache.ts', kind: 'MIRROR_READER', activation_path: 'FILE_GIT' },
      { path: 'lib/fabricator/fabricator-live-source.ts', kind: 'MIRROR_TRANSFORM', activation_path: 'FILE_GIT' },
    ],
  },
  {
    id: 'MATERIAL_UNITS',
    channels: ['LIVE'],
    depends_on: [],
    inputs: [sections('crafting_blueprints', ['items', 'resources'])],
    consumers: [
      { path: 'lib/inventory/material-units.ts', kind: 'MIRROR_READER', activation_path: 'FILE_GIT' },
    ],
  },
  {
    id: 'LEGACY_FRONTEND',
    channels: ['LIVE', 'PTU'],
    depends_on: [],
    // Whole documents minus the top-level fields of EXCLUDED_TOP_LEVEL_FIELDS.
    inputs: [
      { role: 'crafting_blueprints', whole_document: true },
      { role: 'crafting_items', whole_document: true },
    ],
    consumers: [
      { path: 'src/data.js', kind: 'MIRROR_READER', activation_path: 'FILE_GIT' },
    ],
  },
])

/**
 * Code that reads data/scmdb/ for identity or evidence only. It is not a
 * publication domain and never triggers (37.3 rules 2 and 3). Listed so that
 * the repository scan can tell registered readers from unknown ones.
 */
export const IDENTITY_CONSUMERS = Object.freeze([
  { path: 'lib/loadout-source/loadout-source-read.ts', reads: ['latest'], activation_path: 'FILE_GIT' },
])

export const EVIDENCE_CONSUMERS = Object.freeze([
  { path: 'scripts/audit/vector_item_data_audit_v6_multisource.py' },
  // Two more audit scripts that take data/scmdb as their root. Section 37.3 names only v6.
  { path: 'scripts/audit/vector_item_data_audit_v5_profiler.py' },
  { path: 'scripts/audit/vector_item_data_audit_v4_universal.py' },
])

/**
 * Workflows (and the tooling that serves them) that write the mirror or check its
 * files. They are neither domain consumers nor triggers of the domain precheck;
 * today their path filters fire on any change under data/scmdb/
 * (SCMDB_SOURCE_INVENTORY.md section 5).
 */
export const WORKFLOW_REFERENCES = Object.freeze([
  { path: '.github/workflows/sync-scmdb-data.yml', kind: 'MIRROR_WRITER' },
  { path: 'scripts/scmdb-sync/decide.mjs', kind: 'MIRROR_TOOLING' },
  { path: '.github/workflows/vector-scmdb-preflight.yml', kind: 'PREFLIGHT' },
  { path: '.github/workflows/vector-release-preflight.yml', kind: 'PREFLIGHT' },
  { path: '.github/workflows/vector-item-data-audit.yml', kind: 'EVIDENCE_AUDIT' },
])

export const DOMAIN_REGISTER = Object.freeze({
  register_version: REGISTER_VERSION,
  channels: CHANNELS,
  excluded_top_level_fields: EXCLUDED_TOP_LEVEL_FIELDS,
  channel_roles: CHANNEL_ROLES,
  static_roles: STATIC_ROLES,
  domains: DOMAINS,
  identity_consumers: IDENTITY_CONSUMERS,
  evidence_consumers: EVIDENCE_CONSUMERS,
  workflow_references: WORKFLOW_REFERENCES,
  default_versions: Object.freeze({ projector: '1', resolvers: Object.freeze({}) }),
})
