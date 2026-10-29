# VECTOR Dataset Pipeline v1

**Status:** PROPOSED  
**Version:** 1.0  
**Authority Scope:** DATASET_PIPELINE  
**Approved By:** pending project_owner approval  
**Supersedes:** none; consolidates the planned VECTOR SCMDB dataset ingestion and publication pipeline  
**Scope:** SCMDB upstream change detection, channel isolation, validation, completeness filtering, build/channel verification, extraction, standardization, database update and dataset revision metadata

## 1. Purpose

This specification defines how VECTOR detects, validates, transforms and publishes Star Citizen reference data supplied through the approved SCMDB upstream source.

The pipeline has one canonical processing sequence:

```text
Update Detection
-> Download
-> Validation
-> Completeness Filter
-> Build / Channel Check
-> Data Extraction
-> Data Standardization
-> Database Update
```

Dataset Revision metadata is produced by this pipeline. Dataset Revision is not a second transformation or build pipeline.

## 2. Source and channel model

The approved upstream is the SCMDB data source used by VECTOR in read-only mode.

The canonical channels are:

```text
LIVE
PTU
```

Each channel has an independent upstream revision, build identity, candidate dataset, active dataset, database state and publication result.

The channels share the same logical schema and index contract but never share channel-specific reference rows or mutable game-state rows.

## 3. Core invariants

### 3.1 Strict LIVE/PTU isolation

```text
LIVE source -> LIVE pipeline execution -> LIVE database
PTU source  -> PTU pipeline execution  -> PTU database
```

A PTU-only publication must not rebuild or mutate LIVE.
A LIVE-only publication must not rebuild or mutate PTU.

### 3.2 One canonical pipeline

VECTOR maintains one processing contract for both channels. Channel-specific adapters are allowed only when upstream structure requires them, and they must still produce the same canonical VECTOR schema.

### 3.3 No-Guess

If build, channel, revision identity, required relationships or source completeness cannot be determined with sufficient confidence:

```text
DATASET_PUBLICATION_BLOCKED
```

Ambiguous data is never assigned to LIVE or PTU by guesswork.

### 3.4 Last-known-good preservation

A rejected candidate must never replace or damage the currently active dataset.

```text
candidate fails mandatory gate -> REJECTED / BLOCKED
current active dataset          -> remains ACTIVE
```

## 4. Update Detection

Update Detection determines independently:

```text
live_changed = true | false
ptu_changed  = true | false
```

Execution matrix:

```text
LIVE unchanged + PTU unchanged -> NO_CHANGE
LIVE changed   + PTU unchanged -> LIVE only
LIVE unchanged + PTU changed   -> PTU only
LIVE changed   + PTU changed   -> both, independently
```

A repository-level upstream change is not sufficient reason to rebuild both channels.

The preferred long-term trigger is a trustworthy upstream event/webhook. Until one is verified, scheduled polling performs lightweight Update Detection first. `workflow_dispatch` remains available for controlled manual operation.

## 5. Download

Download starts only for a channel selected by Update Detection or by an explicitly authorized manual run.

Downloaded data is a candidate source and must not modify the active database.

Failure affects only the selected channel unless a shared infrastructure failure makes safe processing impossible.

## 6. Validation

Validation verifies that the candidate source is structurally usable.

Checks may include:

- required metadata exists;
- mandatory JSON parses successfully;
- expected top-level structures exist;
- required collections and relationships are inspectable;
- obvious corruption is rejected;
- existing useful crafting, blueprint, fire-mode and recoil sanity checks are preserved where applicable.

Validation success does not by itself prove completeness.

## 7. Completeness Filter

The Completeness Filter is mandatory for both LIVE and PTU.

It determines whether records can safely enter the standardized dataset when mandatory relationships or values are incomplete, orphaned or unusable.

Allowed deterministic outcomes include:

```text
ACCEPT
FILTER_OUT
QUARANTINE
BLOCK_DATASET
```

The filter never invents values merely to make incomplete data appear valid.

Filtering should retain provenance including source identity, revision, channel and exclusion/quarantine reason where practical.

## 8. Build / Channel Check

Before extraction/publication, VECTOR verifies:

```text
channel = LIVE | PTU
build   = verified Star Citizen build identity
```

Examples:

```text
4.10.2-LIVE.12881860
4.10.3-PTU.<build>
```

A channel mismatch blocks publication.

```text
EXPECTED LIVE / ACTUAL PTU -> BLOCK
EXPECTED PTU  / ACTUAL LIVE -> BLOCK
```

No automatic cross-channel reassignment is permitted.

## 9. Data Extraction

Data Extraction transforms validated source structures into VECTOR domain records.

Potential domains include:

- items;
- item properties;
- weapons and fire modes;
- ships;
- components;
- crafting blueprints and materials;
- mining data and equipment;
- manufacturers;
- locations;
- other approved SCMDB-backed reference domains.

Extraction preserves required source provenance and never mixes channels.

## 10. Data Standardization

Data Standardization maps extracted records to the canonical VECTOR data model.

The required contract is:

```text
LIVE logical schema/index
==
PTU logical schema/index
```

Values and records can differ by channel. Field semantics, relationship model and indexes remain equivalent.

Standardization may include canonical IDs, normalized field names/types/units, relationship mapping, source-ID mapping, resolver-compatible values, provenance, build/channel metadata and dataset revision metadata.

## 11. Database architecture

VECTOR maintains logically separate LIVE and PTU stores with the same schema and index structure.

```text
VECTOR LIVE
├── Reference / Master Data
├── LIVE Game State
└── Dataset Metadata

VECTOR PTU
├── Reference / Master Data
├── PTU Game State
└── Dataset Metadata
```

The physical implementation may evolve, but a write to one channel must be possible without mutating the other.

Shared schema migrations must be applied consistently through the approved migration process.

## 12. Database Update and publication

A candidate-first approach is mandatory:

```text
Download
-> Validate
-> Completeness
-> Build/Channel Verify
-> Extract
-> Standardize
-> Stage Candidate
-> Verify Candidate
-> Promote Candidate
```

Promotion must be atomic from the application perspective. Half-updated datasets must not become visible.

If promotion fails, the previous active revision remains active.

Each channel has an independent publication result.

Example:

```text
LIVE -> SUCCESS -> new ACTIVE revision
PTU  -> FAILED  -> previous ACTIVE revision remains
```

## 13. Dataset Revision

Dataset Revision is metadata generated once by the successful pipeline. It is not a second dataset-build stage.

A revision records at least:

- VECTOR dataset version/schema context;
- Star Citizen build;
- channel;
- upstream revision/provenance;
- relevant pipeline/filter/resolver versions;
- publication state.

Internal combined identifier:

```text
Vector_{VersionNumber}_SC_{Build}
```

Example:

```text
Vector_1.3.1_SC_4.10.2-LIVE.12881860
```

Normal UI presentation remains compact:

```text
LIVE 4.10.2
PTU 4.10.3
```

VECTOR code version and dataset revision are independent. A data update does not require an application release solely because the SCMDB source changed.

## 14. Dataset states and idempotency

Candidate/publication states may include:

```text
DETECTED
DOWNLOADED
VALIDATED
FILTERED
CHANNEL_VERIFIED
EXTRACTED
STANDARDIZED
STAGED
VERIFIED
ACTIVE
REJECTED
```

Only `ACTIVE` is application-authoritative for the selected channel.

Reprocessing the same upstream revision with unchanged pipeline rules must not create a duplicate logical active revision.

If upstream revision, rules and active result are unchanged:

```text
NO_CHANGE
```

## 15. Reference Data, Game State and Persistent State

### 15.1 Reference / Master Data

Reference data originates from or is derived through the Dataset Pipeline.

Examples:

- item definitions and item stats;
- weapon/component/ship stats;
- crafting blueprints;
- material definitions;
- manufacturers;
- canonical locations;
- SCMDB IDs;
- resolver properties.

Reference data changes through dataset publication and is not ordinary wipe state.

### 15.2 Channel-specific Game State

Mutable game-derived state includes, as applicable:

- inventory positions and lots;
- quantities;
- storage locations;
- in-game-owned ship instances;
- Actual Loadouts;
- game-derived ownership;
- movable item instances;
- other mutable channel relationships.

```text
LIVE Game State != PTU Game State
```

### 15.3 VECTOR Persistent State

Ordinary Star Citizen wipes do not remove platform-persistent state such as authentication identity, user profile, Game Identity history, Crew membership, roles, saved Fleet Plans, saved Loadout Templates, settings, audit/provenance history or ownership explicitly sourced from an authority that survives the applicable wipe.

## 16. Wipe boundary

```text
Dataset Update != Game Wipe
```

Dataset publication does not automatically wipe Game State. A Game Wipe does not automatically rebuild Reference Data.

### 16.1 PTU wipe

A PTU wipe may clear approved mutable PTU Game State while leaving LIVE Game State, both reference datasets and VECTOR Persistent State untouched.

### 16.2 LIVE wipe

A LIVE wipe may clear approved mutable LIVE Game State while leaving PTU Game State, both reference datasets and VECTOR Persistent State untouched.

### 16.3 Future fine-grained scopes

Potential wipe scopes include:

```text
FULL_GAME_STATE
INVENTORY_ONLY
OWNERSHIP_ONLY
LOADOUT_ONLY
```

The approved Game Wipe specification remains authoritative for actual wipe scopes.

### 16.4 Item stats are Reference Data

Item stats and other SCMDB-derived statistics are Reference Data, not mutable movement/game-state data. Ordinary game wipes must not clear them.

## 17. Failure isolation and concurrency

A channel failure must not invalidate the other channel.

Conceptual channel locks:

```text
dataset-pipeline-live
dataset-pipeline-ptu
```

LIVE and PTU may execute independently where safe.

Conflicting revisions of the same channel must not be promoted concurrently.

## 18. Provenance

Every active dataset must be traceable to its upstream source/revision, Star Citizen build, channel, pipeline execution, validation/completeness outcome, standardization context and publication event.

VECTOR must distinguish:

```text
source truth
normalized VECTOR representation
derived/resolved value
user/game mutable state
```

## 19. Migration of current SCMDB workflow

The current workflow:

```text
.github/workflows/sync-scmdb-data.yml
```

contains useful retrieval, JSON validation, crafting/blueprint checks, sanity checks, change-aware commits and manual execution that should be preserved where still valid.

The current daily full-mirror schedule must not remain the dataset-publication decision model.

Target behavior:

```text
frequent lightweight Update Detection
-> channel-specific heavy processing only when required
```

Git repository differences may support mirror/provenance tracking but are not the authoritative channel-update detector.

## 20. Trigger and polling policy

Until a trusted upstream event trigger is verified, scheduled polling plus manual execution is used.

Every scheduled invocation begins with Update Detection.

```text
no channel changed -> NO_CHANGE -> successful stop
```

The exact polling interval is operational and may change without altering this specification, provided platform limits and concurrency safety are respected.

If a verified upstream event/webhook becomes available later:

```text
upstream event -> primary trigger
scheduled polling -> fallback/reconciliation trigger
```

## 21. Security

Pipeline secrets remain in approved secret storage and must not be committed or printed in logs.

Database credentials should have only the privileges needed for approved dataset operations.

Generated/mirrored SCMDB artifacts must never include Production user/game-state exports or other unrelated sensitive data.

## 22. Acceptance Criteria

DATASET_PIPELINE_V1 is ready to freeze only when VECTOR demonstrates that:

- LIVE and PTU changes are detected independently;
- unchanged channels do not run the full pipeline;
- PTU-only changes do not rebuild/write LIVE;
- LIVE-only changes do not rebuild/write PTU;
- both channels can publish independently when both changed;
- downloads cannot mutate the active database;
- malformed required source data is rejected;
- Completeness Filter applies to LIVE and PTU;
- incomplete records are never guessed into completeness;
- Build/Channel Check occurs before publication;
- channel mismatch blocks publication;
- extraction preserves provenance;
- standardization produces the same logical schema/index contract for both channels;
- databases remain logically isolated;
- publication is candidate-first and atomic;
- failure preserves the last-known-good dataset;
- Dataset Revision is created once as metadata, not by a duplicate build stage;
- identical unchanged processing does not create duplicate active revisions;
- VECTOR app version and dataset revision remain independent;
- dataset update does not trigger a wipe;
- wipes can target LIVE/PTU independently;
- mutable Game State is separated from Reference Data;
- item stats/reference statistics are not ordinary wipe targets;
- VECTOR Persistent State survives ordinary game wipes;
- active datasets retain sufficient provenance for audit/reconciliation.

## 23. Open implementation decisions before FROZEN

1. Authoritative upstream field(s) for latest LIVE revision.
2. Authoritative upstream field(s) for latest PTU revision.
3. Handling of multiple PTU-like/pre-release channels if SCMDB exposes them.
4. Exact Completeness Filter rules per source domain.
5. Canonical standardized schema and index definitions.
6. Physical implementation of logically separate LIVE/PTU databases.
7. Staging strategy for atomic promotion.
8. Rollback mechanics after failed promotion.
9. Provenance/audit table structure.
10. Polling interval and fallback details.
11. Availability of a trustworthy upstream webhook/event trigger.
12. Database roles/credentials for automation.
13. Safe reprocessing when pipeline rules change without an upstream revision change.

These decisions must be closed or safely deferred before FROZEN approval.

## 24. R2 remediation classification

```text
DATASET_PIPELINE_V1.md
Classification: CONSOLIDATE + REQUIRED
Authority Scope: DATASET_PIPELINE
Status: PROPOSED
```

This document establishes the intended normative home for SCMDB update detection, channel-isolated processing, completeness, extraction, standardization and publication.

R2 remains open until all other missing/referenced normative specifications are classified and reconciled.

## 25. Proposed Decision

VECTOR Dataset Pipeline v1 is **PROPOSED**.

It becomes eligible for FROZEN only after:

- LIVE/PTU upstream revision detection is verified;
- Completeness Filter rules are defined;
- standardized schema/index contracts are defined;
- publication and rollback mechanics are validated;
- the current SCMDB workflow is migrated to this contract;
- interactions with Versioning, Data Context and Game Wipe rules are verified;
- `RULE_INDEX.md` is updated from PLANNED to PROPOSED and later FROZEN;
- channel-isolation and last-known-good tests pass;
- review on `develop` is complete;
- approval by `project_owner`;
- merge through the normal VECTOR governance process to `main`.
