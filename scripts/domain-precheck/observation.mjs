// Observation record entries (docs/proposed/DATASET_PIPELINE_V1.md section 39).
//
// Pure data structures and serialization. Nothing here writes anywhere. The
// record is meant to be append-only: one JSON object per line, entries are
// never changed or deleted. Where the record is stored belongs to the later
// mirror workflow package (owner decision 21).
//
// The full raw hash map of a Source Export Revision is large, so it is emitted
// once per run as its own record line. Each domain observation references it
// through `source_export_revision.revision_digest` next to the commit SHA.

import { canonicalize } from './canonical.mjs'

export const OBSERVATION_SCHEMA = 1

/**
 * @param {object} precheck           Output of runDomainPrecheck.
 * @param {object} options
 * @param {string} options.observedAt ISO 8601 timestamp supplied by the caller (this module has no clock).
 * @param {Record<string, string>} [options.domainRevisionIds]  `<CHANNEL>/<DOMAIN>` -> domain_revision_id compared against.
 */
export function buildObservation(precheck, { observedAt, domainRevisionIds = {} }) {
  if (typeof observedAt !== 'string' || observedAt === '') throw new TypeError('observedAt is required')
  const revision = precheck.source_export_revision
  const reference = revision.upstream_commit_sha === null
    ? null
    : { upstream_commit_sha: revision.upstream_commit_sha, revision_digest: precheck.source_export_revision_digest }
  const revisionRecord = reference === null
    ? null
    : {
      record_type: 'source_export_revision',
      schema: OBSERVATION_SCHEMA,
      revision_digest: precheck.source_export_revision_digest,
      upstream_commit_sha: revision.upstream_commit_sha,
      raw_file_hashes: revision.raw_file_hashes,
      retrieved_at: revision.retrieved_at,
    }
  const entries = []
  for (const channel of Object.values(precheck.channels)) {
    for (const domain of channel.domains) {
      entries.push({
        record_type: 'domain_observation',
        schema: OBSERVATION_SCHEMA,
        channel: channel.channel,
        domain: domain.domain,
        domain_revision_id: domainRevisionIds[`${channel.channel}/${domain.domain}`] ?? null,
        comparison_key: domain.comparison_key,
        result: domain.result,
        reason_codes: domain.reasons.map(reason => reason.code),
        build: channel.build,
        source_export_revision: reference,
        observed_at: observedAt,
      })
    }
  }
  return { source_export_revision_record: revisionRecord, entries }
}

/** One canonical JSON line, terminated by a newline so that records can be concatenated. */
export function serializeObservationLine(record) {
  return `${canonicalize(record)}\n`
}

/** The lines to append for one run: the revision record first, then the domain entries. */
export function serializeObservation(observation) {
  const records = observation.source_export_revision_record === null ? [] : [observation.source_export_revision_record]
  return [...records, ...observation.entries].map(serializeObservationLine).join('')
}
