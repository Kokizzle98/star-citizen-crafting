# VECTOR Versioning v1

**Status:** FROZEN  
**Version:** 1.0  
**Frozen on:** 2026-10-28  
**Scope:** VECTOR application versioning, Star Citizen LIVE-build provenance, dataset revisions and UI presentation

## 1. Purpose

This document defines the binding versioning model for VECTOR. It separates application evolution from Star Citizen dataset evolution while retaining a reproducible relationship between a VECTOR release and its approved LIVE data baseline.

## 2. Canonical Internal Identifier

The canonical combined identifier is:

```text
Vector_{VersionNumber}_SC_{LIVEBuild}
```

Example:

```text
Vector_1.3.1_SC_4.10.2-LIVE.12881860
```

The Star Citizen component of the canonical identifier always uses the approved **LIVE** build.

PTU, EPTU, Tech Preview or other non-LIVE channels must never replace the LIVE build in the canonical VECTOR identifier.

## 3. VECTOR Application Version

The VECTOR application version follows:

```text
MAJOR.FEATURE.PATCH
```

### 3.1 MAJOR

Increment for fundamental or incompatible platform, contract, architecture or data-model changes.

Example:

```text
1.9.4 -> 2.0.0
```

### 3.2 FEATURE

Increment for a backward-compatible functional expansion.

Examples include a new module, a major workflow, a new authentication capability or a new engine feature.

Example:

```text
1.3.2 -> 1.4.0
```

### 3.3 PATCH / FIX

Increment for a backward-compatible bugfix or correction that does not introduce a new feature set.

Example:

```text
1.3.0 -> 1.3.1
```

## 4. Independent Version Axes

VECTOR code and Star Citizen datasets evolve independently.

### 4.1 Application-only change

```text
Vector_1.3.0_SC_4.10.2-LIVE.12881860
->
Vector_1.3.1_SC_4.10.2-LIVE.12881860
```

The LIVE dataset remains unchanged.

### 4.2 LIVE dataset update without application change

```text
Vector_1.3.1_SC_4.10.2-LIVE.12881860
->
Vector_1.3.1_SC_4.10.3-LIVE.xxxxxxxx
```

The VECTOR application version remains unchanged.

### 4.3 Dataset enrichment within the same LIVE build

If SCMDB or the extraction pipeline publishes additional or corrected records for the same LIVE build:

```text
VECTOR version: unchanged
SC LIVE build:  unchanged
dataset revision: incremented
```

A dataset enrichment alone does not create a new VECTOR application release.

## 5. Dataset Revision and Provenance

The combined public/internal identifier is not sufficient to distinguish repeated extractions of the same LIVE build. VECTOR therefore maintains additional internal provenance fields.

Required metadata:

```text
vector_version
release_sc_build
live_dataset_revision
live_source_revision
live_extracted_at
live_validated_at
live_completeness_status
live_activated_at
ptu_build
ptu_dataset_revision
ptu_source_revision
ptu_extracted_at
ptu_validated_at
ptu_completeness_status
```

Exact storage names may be adapted during implementation, but the provenance information must remain available.

## 6. LIVE and PTU Rules

### 6.1 LIVE

- LIVE is the canonical Production dataset baseline.
- The canonical combined VECTOR identifier always references LIVE.
- LIVE data is not assumed to be complete merely because it is LIVE.
- LIVE must pass the Completeness Filter before activation or use in affected calculations.

### 6.2 PTU

- PTU is an additional early-data channel.
- PTU does not alter the canonical combined VECTOR identifier.
- PTU data may be incomplete, provisional or inconsistent.
- PTU must pass the same Completeness Filter principles as LIVE.
- PTU may be shown in the UI as a separate dataset channel.

## 7. Completeness Filter

The Completeness Filter applies to both LIVE and PTU.

Binding rules:

1. Channel membership does not imply completeness.
2. Required input data must be explicitly present and valid.
3. Missing values must not be replaced by guessed values or implicit zeroes.
4. Orphaned, contradictory or structurally unusable records must not enter affected calculations.
5. A calculation with missing required inputs receives an incomplete state and is filtered from normal calculated output.
6. The system may expose a controlled diagnostic state for incomplete records, but must not present an unreliable calculation as valid.

Recommended status values:

```text
VALID
PARTIAL
INCOMPLETE
REJECTED
```

The detailed validation matrix belongs to the future Dataset Pipeline specification.

## 8. UI Presentation

The normal application UI focuses on the dataset build relevant to the user.

Compact examples:

```text
LIVE 4.10.2
PTU 4.10.3
```

The full VECTOR application version does not need to be repeated in every dataset context.

The application version may be displayed separately in a system/about/version area.

Recommended detailed version view:

```text
VECTOR version       1.3.1
Release baseline     LIVE 4.10.2
Full LIVE build      4.10.2-LIVE.12881860
LIVE dataset rev.    <revision>
PTU dataset          4.10.3
Environment          PRODUCTION or DEVELOP
Validation status    <status>
```

## 9. Development and Production Labels

Development builds may use a prerelease marker for the VECTOR application version, for example:

```text
Vector_1.4.0-dev_SC_4.10.2-LIVE.12881860
```

Production removes the prerelease marker:

```text
Vector_1.4.0_SC_4.10.2-LIVE.12881860
```

The LIVE build component remains the approved LIVE baseline in both cases.

## 10. Dataset Activation

External SCMDB data must not become active merely because new source data exists.

The expected lifecycle is:

```text
change detection
-> mirror/source retrieval
-> extraction
-> LIVE/PTU build detection
-> normalization
-> completeness validation
-> dataset revision
-> activation
```

Only activated datasets may serve as the normal basis for VECTOR calculations.

## 11. Release and Data Update Relationship

A merge into `main` releases VECTOR code.

A validated dataset activation may update the data baseline independently, without requiring a new VECTOR application version, provided no code or schema change is necessary.

If a dataset requires application, schema, normalization or engine changes, those changes follow the normal `develop -> Preview -> main` release workflow and update the VECTOR application version as appropriate.

## 12. GitHub README Release Documentation

The repository-root `README.md` is part of the official VECTOR release documentation.

Binding rules:

1. Every MAJOR VECTOR release must update `README.md`.
2. The README update must describe the current major release baseline and must not remain on an obsolete scaffold or previous major-version description.
3. The README update is part of the applicable MAJOR release gate and must be merged through the normal `develop -> main` workflow.
4. The README should reference the released VECTOR version and the applicable LIVE dataset context where useful.
5. Automation through the GitHub release / GitHub Actions pipeline is the preferred future implementation, but is not required until the release automation is implemented and validated.
6. Until that automation exists, the README update is a mandatory manual MAJOR-release checklist item.

## 13. Frozen Decision

VECTOR Versioning v1 is FROZEN, including the GitHub README MAJOR-release documentation rule.

Binding decisions:

- canonical format: `Vector_{VersionNumber}_SC_{LIVEBuild}`;
- the SC component always references LIVE;
- VECTOR version and dataset build are independent axes;
- same-build dataset enrichments use dataset revisions;
- PTU is displayed and processed separately but never becomes the canonical release-build component;
- LIVE and PTU both pass the Completeness Filter;
- normal UI presentation uses compact dataset labels such as `LIVE 4.10.2` and `PTU 4.10.3`;
- full provenance remains available internally and in a detailed system/version view.

Any material amendment requires a successor version of this document and the normal VECTOR governance process.
