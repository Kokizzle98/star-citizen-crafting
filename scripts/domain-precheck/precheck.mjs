// Fail-closed domain precheck (docs/proposed/DATASET_PIPELINE_V1.md sections 36 to 39).
//
// Pure: no file system, no network, no clock, no database. The caller hands in
// the file contents of a baseline and of a candidate (logical role -> content)
// and gets back one result per channel and domain:
//
//   UNCHANGED | CHANGED | HELD_FOR_REVIEW
//
// UNCHANGED is only ever reported when it is proven. Every condition of section
// 37.4 yields HELD_FOR_REVIEW. A hold that cannot be attributed to a single
// domain holds every domain it can affect (channel scope or global scope).

import { canonicalFingerprint, canonicalize, FingerprintError, sha256Hex } from './canonical.mjs'
import { DOMAIN_REGISTER } from './register.mjs'

export const RESULT = Object.freeze({
  UNCHANGED: 'UNCHANGED',
  CHANGED: 'CHANGED',
  HELD_FOR_REVIEW: 'HELD_FOR_REVIEW',
})

const GLOBAL = 'GLOBAL'
const HASH_PATTERN = /^[0-9a-f]{64}$/
const ABSENT = '(absent)'
const DISPLAY_LIMIT = 240
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)-(live|ptu)\.(\d+)$/
const FILE_NAME_PATTERN = /^.+-(\d+\.\d+\.\d+)-(live|ptu)\.(\d+)\.json$/
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/
const DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

const plainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

/**
 * Finding codes that record a decision instead of a problem. They never hold a domain (here) and are the only
 * codes the sync decision lets through (scripts/scmdb-sync/decide.mjs). Exactly one code: the reviewed
 * acknowledgement of a site-settings change (section 36.2, owner decision 19).
 */
export const INFORMATIONAL_FINDING_CODES = Object.freeze(['SITE_SETTINGS_CHANGE_ACCEPTED'])
const INFORMATIONAL = new Set(INFORMATIONAL_FINDING_CODES)

/** True for a well-formed change hash: 64 lowercase hex characters. */
export const isChangeHash = value => typeof value === 'string' && HASH_PATTERN.test(value)

/**
 * The change hash of a site-settings change: SHA-256 (hex) over the canonical serialization (section 37.2) of the
 * array of `{key, before, after}`, sorted by key. `before` / `after` are the values of the key on the baseline /
 * candidate side; a property that is missing on a side is omitted (an absent key is not the same as `null`).
 * Non-trigger keys never take part. The array is built by `changesOf` in checkSiteSettings.
 */
export const siteSettingsChangeHash = changes => sha256Hex(canonicalize(changes))

/** Key of a per-channel role in a file map, for example `live/crafting_blueprints`. */
export const channelRoleKey = (channel, role) => `${channel.toLowerCase()}/${role}`

class Hold extends Error {
  constructor(code, detail) {
    super(code)
    this.code = code
    this.detail = detail ?? null
  }
}

// --- one side (baseline or candidate) --------------------------------------

function makeSide(label, input) {
  const files = plainObject(input?.files) ? input.files : {}
  const hashes = new Map()
  const parsed = new Map()
  const bytesOf = role => {
    const content = files[role]
    return typeof content === 'string' ? Buffer.from(content, 'utf8') : content
  }
  return {
    label,
    files,
    has: role => has(files, role) && (typeof files[role] === 'string' || files[role] instanceof Uint8Array),
    hash(role) {
      if (!hashes.has(role)) hashes.set(role, sha256Hex(bytesOf(role)))
      return hashes.get(role)
    },
    json(role) {
      if (!parsed.has(role)) {
        try {
          parsed.set(role, { ok: true, value: JSON.parse(DECODER.decode(bytesOf(role))) })
        } catch (error) {
          parsed.set(role, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
      return parsed.get(role)
    },
  }
}

// --- identity (latest.json, section 33.4) -----------------------------------

function readLatest(side, register, add) {
  const result = { ok: false, channels: new Map() }
  if (!side.has('latest')) {
    add(GLOBAL, 'MISSING_FILE', { side: side.label, role: 'latest' })
    return result
  }
  const parsed = side.json('latest')
  if (!parsed.ok || !plainObject(parsed.value) || !plainObject(parsed.value.channels)) {
    add(GLOBAL, 'LATEST_INVALID', { side: side.label, error: parsed.ok ? 'STRUCTURE' : parsed.error })
    return result
  }
  result.ok = true
  const known = new Set(register.channels.map(channel => channel.toLowerCase()))
  for (const [key, entry] of Object.entries(parsed.value.channels)) {
    if (!known.has(key)) {
      add(GLOBAL, 'UNSUPPORTED_CHANNEL', { side: side.label, channel_key: key })
      continue
    }
    const channel = key.toUpperCase()
    const hold = (code, detail) => add(channel, code, { side: side.label, ...detail })
    if (!plainObject(entry) || typeof entry.version !== 'string' || !plainObject(entry.files)) {
      hold('LATEST_INVALID', { error: 'CHANNEL_ENTRY' })
      result.channels.set(channel, { invalid: true })
      continue
    }
    const match = VERSION_PATTERN.exec(entry.version)
    if (!match) {
      hold('VERSION_UNPARSABLE', { version: entry.version })
      result.channels.set(channel, { invalid: true })
      continue
    }
    if (match[4] !== key) {
      hold('CHANNEL_MISMATCH', { channel_key: key, version: entry.version })
      result.channels.set(channel, { invalid: true })
      continue
    }
    const files = new Map()
    let valid = true
    for (const [role, name] of Object.entries(entry.files)) {
      if (!has(register.channel_roles, role)) {
        hold('UNREGISTERED_FILE', { role, file: typeof name === 'string' ? name : null })
        valid = false
        continue
      }
      const nameMatch = typeof name === 'string' ? FILE_NAME_PATTERN.exec(name) : null
      if (!nameMatch) {
        hold('FILE_NAME_INVALID', { role, file: name })
        valid = false
      } else if (nameMatch[2] !== key) {
        hold('CHANNEL_MISMATCH', { role, file: name, channel_key: key })
        valid = false
      } else if (!name.endsWith(`-${entry.version}.json`)) {
        hold('FILE_NAME_VERSION_MISMATCH', { role, file: name, version: entry.version })
        valid = false
      }
      files.set(role, name)
    }
    result.channels.set(channel, {
      invalid: !valid,
      version: entry.version,
      semantic_version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
      cig_build: match[5],
      files,
    })
  }
  return result
}

// --- versions of the comparison key (section 37.5) --------------------------

function readVersions(label, input, add, { needRegister }) {
  const invalid = detail => {
    add(GLOBAL, 'VERSIONS_INVALID', { side: label, detail })
    return null
  }
  if (!plainObject(input)) return invalid('MISSING')
  if (typeof input.projector !== 'string' || input.projector === '') return invalid('PROJECTOR')
  if (needRegister && (typeof input.register !== 'string' || input.register === '')) return invalid('REGISTER')
  const resolvers = input.resolvers ?? {}
  if (!plainObject(resolvers)) return invalid('RESOLVERS')
  for (const value of Object.values(resolvers)) {
    const list = Array.isArray(value) ? value : [value]
    if (!list.every(item => typeof item === 'string' && item !== '')) return invalid('RESOLVERS')
  }
  return { projector: input.projector, register: input.register ?? null, resolvers }
}

const resolverVersionsFor = (resolvers, domainId) => {
  const value = resolvers[domainId]
  if (value === undefined) return []
  return [...(Array.isArray(value) ? value : [value])].sort()
}

// --- canonical domain input (section 37.2) -----------------------------------

function selectSections(doc, input, register) {
  const selected = {}
  if (input.whole_document) {
    for (const key of Object.keys(doc)) {
      if (!register.excluded_top_level_fields.includes(key)) selected[key] = doc[key]
    }
    if (Object.keys(selected).length === 0) throw new Hold('SECTION_ABSENT', { role: input.role, section: '*' })
    return selected
  }
  for (const section of input.sections ?? []) {
    if (!has(doc, section)) throw new Hold('SECTION_ABSENT', { role: input.role, section })
    selected[section] = doc[section]
  }
  for (const { pattern, min_matches: min } of input.section_patterns ?? []) {
    const expression = new RegExp(pattern)
    const matches = Object.keys(doc).filter(key => expression.test(key))
    if (matches.length < min) throw new Hold('SECTION_ABSENT', { role: input.role, pattern, matches: matches.length })
    for (const key of matches) selected[key] = doc[key]
  }
  return selected
}

function buildDomainInput(side, domain, channel, latestVersion, register) {
  const canonicalInput = {}
  for (const input of domain.inputs) {
    const key = channelRoleKey(channel, input.role)
    if (!side.has(key)) throw new Hold('MISSING_FILE', { side: side.label, role: key })
    const parsed = side.json(key)
    if (!parsed.ok) throw new Hold('FILE_UNPARSABLE', { side: side.label, role: key, error: parsed.error })
    if (!plainObject(parsed.value)) throw new Hold('FILE_UNPARSABLE', { side: side.label, role: key, error: 'NOT_AN_OBJECT' })
    if (parsed.value.version !== latestVersion) {
      throw new Hold('DOCUMENT_VERSION_MISMATCH', { side: side.label, role: key, document_version: parsed.value.version ?? null })
    }
    canonicalInput[input.role] = selectSections(parsed.value, input, register)
  }
  return canonicalInput
}

function fingerprintOf(canonicalInput, label) {
  try {
    return canonicalFingerprint(canonicalInput)
  } catch (error) {
    if (error instanceof FingerprintError) throw new Hold('FINGERPRINT_NOT_COMPUTABLE', { side: label, error: error.message })
    throw error
  }
}

// --- site-settings guard (owner decision 19) ---------------------------------

const display = (doc, key) => {
  if (!has(doc, key)) return ABSENT
  const text = canonicalize(doc[key])
  return text.length > DISPLAY_LIMIT ? `${text.slice(0, DISPLAY_LIMIT)}...[truncated, ${text.length} characters]` : text
}

function checkSiteSettings(base, cand, register, add, accept) {
  const spec = register.static_roles.site_settings
  const docs = []
  for (const side of [base, cand]) {
    if (!side.has('site_settings')) {
      add(GLOBAL, 'MISSING_FILE', { side: side.label, role: 'site_settings' })
      return
    }
    const parsed = side.json('site_settings')
    if (!parsed.ok || !plainObject(parsed.value)) {
      add(GLOBAL, 'FILE_UNPARSABLE', { side: side.label, role: 'site_settings', error: parsed.ok ? 'NOT_AN_OBJECT' : parsed.error })
      return
    }
    docs.push(parsed.value)
  }
  const [before, after] = docs
  const ignored = new Set(spec.non_trigger_keys)
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed = []
  const changes = []
  const shown = []
  try {
    for (const key of [...keys].sort()) {
      if (ignored.has(key)) continue
      if (!has(before, key) || !has(after, key) || canonicalize(before[key]) !== canonicalize(after[key])) {
        changed.push(key)
        changes.push({ key, ...(has(before, key) ? { before: before[key] } : {}), ...(has(after, key) ? { after: after[key] } : {}) })
        shown.push({ key, before: display(before, key), after: display(after, key) })
      }
    }
  } catch (error) {
    if (!(error instanceof FingerprintError)) throw error
    add(GLOBAL, 'FINGERPRINT_NOT_COMPUTABLE', { role: 'site_settings', error: error.message })
    return
  }
  const changeHash = changes.length > 0 ? siteSettingsChangeHash(changes) : null
  if (accept !== undefined && accept !== null && accept !== '') {
    // Hash binding: valid only for exactly this change. Anything else keeps the hold and says what was expected.
    if (changeHash !== null && accept === changeHash) {
      add(GLOBAL, 'SITE_SETTINGS_CHANGE_ACCEPTED', { keys: changed, change_hash: changeHash })
      return
    }
    add(GLOBAL, 'SITE_SETTINGS_ACK_MISMATCH', { expected: changeHash, provided: typeof accept === 'string' ? accept : null })
  }
  if (changed.length > 0) add(GLOBAL, 'SITE_SETTINGS_CHANGED', { keys: changed, changes: shown, change_hash: changeHash })
}

// --- main -------------------------------------------------------------------

/**
 * @param {object} args
 * @param {object} [args.register]  Domain register (default: the versioned register).
 * @param {{files: Record<string, string|Uint8Array>, versions: object, unreadable?: Array<{name: string, reason?: string}>}} args.baseline
 * @param {{files: Record<string, string|Uint8Array>, versions: object, fileNames?: Record<string,string>,
 *          sourceExport?: {upstreamCommitSha?: string, retrievedAt?: string, rawFileHashes?: Record<string,string>}}} args.candidate
 *   Files are keyed by logical role: static roles by name (`latest`, `site_settings`, ...), per-channel roles as
 *   `live/crafting_blueprints`. `fileNames` (role -> relative file name) only labels the recorded hash map.
 */
export function runDomainPrecheck({ register = DOMAIN_REGISTER, baseline, candidate, acceptSiteSettingsChange }) {
  const findings = []
  const add = (scope, code, detail = {}, domain = null) => {
    findings.push({ scope, code, ...(domain ? { domain } : {}), ...detail })
  }
  const base = makeSide('baseline', baseline)
  const cand = makeSide('candidate', candidate)

  // An entry that could not be read never disappears silently (loaders report it as `unreadable`).
  for (const [label, input] of [['baseline', baseline], ['candidate', candidate]]) {
    const list = input?.unreadable
    if (list === undefined) continue
    if (!Array.isArray(list)) {
      add(GLOBAL, 'UNREADABLE_FILE', { side: label, file: null, reason: 'INVALID_UNREADABLE_LIST' })
      continue
    }
    for (const item of list) {
      add(GLOBAL, 'UNREADABLE_FILE', { side: label, file: typeof item === 'string' ? item : item?.name ?? null, reason: item?.reason ?? 'UNREADABLE' })
    }
  }

  // Source Export Revision (33.2). No commit SHA, no revision, no UNCHANGED.
  const sha = candidate?.sourceExport?.upstreamCommitSha
  if (typeof sha !== 'string' || !COMMIT_SHA_PATTERN.test(sha)) {
    add(GLOBAL, 'SOURCE_EXPORT_REVISION_MISSING', { detail: sha === undefined || sha === null ? 'ABSENT' : 'NOT_A_FULL_COMMIT_SHA' })
  }

  const baseVersions = readVersions('baseline', baseline?.versions, add, { needRegister: true })
  const candVersions = readVersions('candidate', candidate?.versions, add, { needRegister: false })
  if (candVersions && candVersions.register !== null && candVersions.register !== register.register_version) {
    add(GLOBAL, 'VERSIONS_INVALID', { side: 'candidate', detail: 'REGISTER_VERSION_DIFFERS_FROM_REGISTER_IN_USE' })
  }

  // Every file must have a register entry (37.3 rule 1, 37.4).
  const knownRoles = new Set(Object.keys(register.static_roles))
  for (const channel of register.channels) {
    for (const role of Object.keys(register.channel_roles)) knownRoles.add(channelRoleKey(channel, role))
  }
  for (const side of [base, cand]) {
    for (const key of Object.keys(side.files)) {
      if (!knownRoles.has(key)) add(GLOBAL, 'UNREGISTERED_FILE', { side: side.label, file: key })
    }
    for (const role of Object.keys(register.static_roles)) {
      if (role !== 'latest' && role !== 'site_settings' && !side.has(role)) {
        add(GLOBAL, 'MISSING_FILE', { side: side.label, role })
      }
    }
  }

  // Raw hash map of the retrieved export, over every file (33.2).
  const rawFileHashes = {}
  for (const key of Object.keys(cand.files).sort()) {
    if (!cand.has(key)) continue
    const label = candidate.fileNames?.[key] ?? key
    rawFileHashes[label] = cand.hash(key)
    const claimed = candidate?.sourceExport?.rawFileHashes?.[key] ?? candidate?.sourceExport?.rawFileHashes?.[label]
    if (claimed !== undefined && claimed !== rawFileHashes[label]) add(GLOBAL, 'RAW_HASH_MISMATCH', { file: label })
  }
  const sourceExportRevision = {
    upstream_commit_sha: typeof sha === 'string' && COMMIT_SHA_PATTERN.test(sha) ? sha : null,
    raw_file_hashes: rawFileHashes,
    retrieved_at: candidate?.sourceExport?.retrievedAt ?? null,
  }

  const baseLatest = readLatest(base, register, add)
  const candLatest = readLatest(cand, register, add)
  checkSiteSettings(base, cand, register, add, acceptSiteSettingsChange)

  // Channels: compared when present on at least one side.
  const channelResults = {}
  const channelStates = new Map()
  for (const channel of register.channels) {
    const before = baseLatest.channels.get(channel)
    const after = candLatest.channels.get(channel)
    if (!before && !after) continue
    if (baseLatest.ok && candLatest.ok && (!before || !after)) {
      add(channel, 'CHANNEL_MISSING_ON_ONE_SIDE', { side: before ? 'candidate' : 'baseline' })
    }
    channelStates.set(channel, { before, after })
  }
  // Required per-channel files: everything latest.json lists, on both sides.
  for (const [channel, { before, after }] of channelStates) {
    if (!before || !after || before.invalid || after.invalid) continue
    const listed = new Set([...before.files.keys(), ...after.files.keys()])
    for (const role of listed) {
      for (const [side, state] of [[base, before], [cand, after]]) {
        if (!state.files.has(role)) add(channel, 'ROLE_NOT_LISTED', { side: side.label, role })
        else if (!side.has(channelRoleKey(channel, role))) add(channel, 'MISSING_FILE', { side: side.label, role: channelRoleKey(channel, role) })
      }
    }
  }

  const scopeFindings = (channel, domainId) => findings.filter(
    finding => !INFORMATIONAL.has(finding.code) && (finding.scope === GLOBAL || finding.scope === channel || finding.scope === `${channel}/${domainId}`),
  )

  for (const [channel, { before, after }] of channelStates) {
    const domains = []
    const byId = new Map()
    for (const domain of register.domains) {
      if (!domain.channels.includes(channel)) continue
      const entry = {
        channel,
        domain: domain.id,
        activation_paths: [...new Set(domain.consumers.map(consumer => consumer.activation_path))].sort(),
        result: RESULT.HELD_FOR_REVIEW,
        stage: null,
        reasons: [],
        comparison_key: null,
        baseline_comparison_key: null,
      }
      domains.push(entry)
      byId.set(domain.id, entry)

      // Holds that already apply before any content is read.
      const inherited = scopeFindings(channel, domain.id)
      if (inherited.length > 0 || !baseVersions || !candVersions) {
        entry.reasons = inherited.map(({ scope, ...rest }) => ({ scope, ...rest }))
        continue
      }
      try {
        const keys = domain.inputs.map(input => channelRoleKey(channel, input.role))
        for (const key of keys) {
          if (!base.has(key) || !cand.has(key)) throw new Hold('MISSING_FILE', { role: key })
        }
        const stage1Equal = keys.every(key => base.hash(key) === cand.hash(key))
        const candInput = buildDomainInput(cand, domain, channel, after.version, register)
        const candFingerprint = fingerprintOf(candInput, 'candidate')
        let baseFingerprint = candFingerprint
        if (stage1Equal) {
          // Byte-equal files: the baseline fingerprint is the same by construction. The baseline
          // identity must still agree with the bytes, otherwise the baseline is inconsistent.
          for (const key of keys) {
            if (cand.json(key).value.version !== before.version) {
              throw new Hold('DOCUMENT_VERSION_MISMATCH', { side: 'baseline', role: key, document_version: cand.json(key).value.version ?? null })
            }
          }
        } else {
          baseFingerprint = fingerprintOf(buildDomainInput(base, domain, channel, before.version, register), 'baseline')
        }
        entry.stage = stage1Equal ? 1 : 2
        entry.comparison_key = {
          stage2_fingerprint: candFingerprint,
          projector_version: candVersions.projector,
          resolver_versions: resolverVersionsFor(candVersions.resolvers, domain.id),
          register_version: register.register_version,
        }
        entry.baseline_comparison_key = {
          stage2_fingerprint: baseFingerprint,
          projector_version: baseVersions.projector,
          resolver_versions: resolverVersionsFor(baseVersions.resolvers, domain.id),
          register_version: baseVersions.register,
        }
        const differing = []
        if (entry.comparison_key.stage2_fingerprint !== entry.baseline_comparison_key.stage2_fingerprint) differing.push('FINGERPRINT_DIFFERS')
        if (entry.comparison_key.projector_version !== entry.baseline_comparison_key.projector_version) differing.push('PROJECTOR_VERSION_DIFFERS')
        if (entry.comparison_key.resolver_versions.join('\n') !== entry.baseline_comparison_key.resolver_versions.join('\n')) differing.push('RESOLVER_VERSION_DIFFERS')
        if (entry.comparison_key.register_version !== entry.baseline_comparison_key.register_version) differing.push('REGISTER_VERSION_DIFFERS')
        entry.result = differing.length === 0 ? RESULT.UNCHANGED : RESULT.CHANGED
        entry.reasons = differing.map(code => ({ code }))
      } catch (error) {
        if (!(error instanceof Hold)) throw error
        entry.result = RESULT.HELD_FOR_REVIEW
        entry.stage = null
        entry.comparison_key = null
        entry.baseline_comparison_key = null
        entry.reasons = [{ scope: `${channel}/${domain.id}`, code: error.code, ...(error.detail ?? {}) }]
      }
    }

    // A dependent domain is never UNCHANGED unless every dependency is (REWARD_SOURCES joins the catalog).
    for (const domain of register.domains) {
      const entry = byId.get(domain.id)
      if (!entry) continue
      for (const dependency of domain.depends_on) {
        const other = byId.get(dependency)
        if (!other) continue
        if (other.result === RESULT.HELD_FOR_REVIEW && entry.result !== RESULT.HELD_FOR_REVIEW) {
          entry.result = RESULT.HELD_FOR_REVIEW
          entry.reasons = [{ code: 'DEPENDENCY_HELD', dependency }]
        } else if (other.result === RESULT.CHANGED && entry.result === RESULT.UNCHANGED) {
          entry.result = RESULT.CHANGED
          entry.reasons = [{ code: 'DEPENDENCY_CHANGED', dependency }]
        }
      }
    }

    channelResults[channel] = {
      channel,
      build: after?.version ?? null,
      semantic_version: after?.semantic_version ?? null,
      cig_build: after?.cig_build ?? null,
      baseline_build: before?.version ?? null,
      result: aggregate(domains.map(domain => domain.result)),
      domains,
    }
  }

  const results = Object.values(channelResults).flatMap(channel => channel.domains)
  return {
    register_version: register.register_version,
    result: aggregate(results.map(entry => entry.result)),
    source_export_revision: sourceExportRevision,
    source_export_revision_digest: sourceExportRevision.upstream_commit_sha === null
      ? null
      : sha256Hex(canonicalize({
        upstream_commit_sha: sourceExportRevision.upstream_commit_sha,
        raw_file_hashes: sourceExportRevision.raw_file_hashes,
      })),
    findings,
    acknowledgements: findings
      .filter(finding => finding.code === 'SITE_SETTINGS_CHANGE_ACCEPTED')
      .map(({ code, keys, change_hash }) => ({ code, change_hash, keys })),
    channels: channelResults,
  }
}

/** HELD_FOR_REVIEW beats CHANGED beats UNCHANGED. Nothing at all is HELD_FOR_REVIEW. */
export function aggregate(results) {
  if (results.length === 0 || results.includes(RESULT.HELD_FOR_REVIEW)) return RESULT.HELD_FOR_REVIEW
  return results.includes(RESULT.CHANGED) ? RESULT.CHANGED : RESULT.UNCHANGED
}
