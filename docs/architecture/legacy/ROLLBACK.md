
# Legacy Notice

**Archive Status:** LEGACY REFERENCE  
**Authority:** NON-BINDING  
**Superseded by:** `docs/frozen/ROLLBACK_POLICY_V1.md`

## Historical context

This document is the original VECTOR 1.2.0 rollback runbook.

It established several rollback safety principles that remain part of
the current VECTOR architecture, including:

- restore an exact previously verified application revision;
- never reconstruct a previous release manually from individual files;
- do not automatically reverse database migrations during an application rollback;
- preserve Production user data, audit data and migration history;
- use a reviewed forward-fix or separately reviewed rollback migration for database recovery;
- keep SCMDB manifest and dataset revisions consistent;
- verify the restored state before declaring recovery complete;
- never replace missing SCMDB values with guessed or zero fallback values.

These principles have been modernized and incorporated into
`docs/frozen/ROLLBACK_POLICY_V1.md`.

## Superseded concepts

The following parts of this document are historical and no longer authoritative:

- VECTOR 1.2.0-specific release scope;
- the former PreFlight / RC release process;
- the Citizen-ID-specific `CITIZEN_ID_ENABLED=false` rollback rule;
- the former SCMDB PreFlight terminology where replaced by the current
  dataset validation, Completeness and activation gates.

The current VECTOR rollback model additionally separates:

- Application rollback;
- Database recovery;
- Dataset rollback;
- LIVE and PTU dataset contexts;
- Game Wipe / Game Epoch handling;
- authentication-provider compatibility;
- rollback evidence and audit;
- dynamic verification gates.

## Authority rule

In case of conflict:

`ROLLBACK_POLICY_V1.md` and other current FROZEN rules take precedence
over this legacy document.

The original content below is preserved unchanged for historical
traceability.

---

# VECTOR 1.2.0 Rollback Runbook

## Purpose

This runbook defines the rollback boundary for the VECTOR 1.2.0 PreFlight/RC process. A rollback restores the application to the last explicitly verified release state without guessing or silently reversing persistent data changes.

## Rollback triggers

Start rollback when a release or RC introduces a blocking regression in one or more of these areas:

- authentication or authorization
- SYSTEM_ADMIN access isolation
- application startup or Next.js build/runtime
- SCMDB dataset integrity or release-data mismatch
- destructive or incorrect database behavior
- exposure of secrets or privileged credentials

## Application rollback

1. Stop promotion of the affected release candidate.
2. Identify the last explicitly verified Git commit or release tag.
3. Redeploy that exact application revision. Do not reconstruct a previous state manually from individual files.
4. Keep `CITIZEN_ID_ENABLED=false` unless that provider has passed its separate release gate.
5. Run the required smoke tests after redeployment before declaring service restored.

## Database rollback boundary

Database migrations are not automatically reversed.

- Do not execute a destructive down migration merely to match the rolled-back application revision.
- Preserve user data, audit data and migration history.
- If an application rollback is incompatible with the current database schema, stop and classify the rollback as BLOCKED.
- Any corrective database change requires an explicit reviewed forward-fix or a separately reviewed rollback migration.
- Before a corrective database operation, capture the current schema/migration state and ensure a database backup or platform recovery point exists.

## SCMDB rollback

SCMDB content is release input, not user-owned state.

1. Restore the manifest and its referenced datasets from one previously verified Git revision.
2. Do not mix manifest files and datasets from different revisions.
3. Run `VECTOR SCMDB PreFlight` again.
4. Accept the restored SCMDB state only when dataset uniqueness, JSON validity and SHA-256 checks pass.

## Verification after rollback

The rollback is complete only after all applicable checks pass:

- application starts successfully
- authentication succeeds for a normal USER
- SYSTEM_ADMIN protection remains enforced
- critical navigation and account/security routes load
- SCMDB PreFlight passes
- no new high-confidence secret finding is reported

Record the restored revision and the reason for rollback in the release record.

## Non-goals

This runbook does not authorize:

- deletion of production user data
- automatic reversal of Supabase migrations
- bypassing RLS or authorization checks
- replacing missing SCMDB values with guessed or zero fallback values
