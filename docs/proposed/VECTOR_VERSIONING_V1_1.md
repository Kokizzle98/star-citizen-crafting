# VECTOR Versioning v1.1

**Status:** PROPOSED  
**Version:** 1.1  
**Authority Scope:** VERSIONING  
**Approved By:** pending project_owner approval  
**Supersedes:** `VECTOR_VERSIONING_V1.md` v1.0 after approval and merge to `main`  
**Scope:** VECTOR application versioning, Star Citizen build and dataset provenance, typed dataset/user-state/result contexts, LIVE/PTU isolation and UI presentation

## 1. Purpose and authority

This specification proposes a successor to the FROZEN VECTOR Versioning v1.0. It preserves the existing application-version, dataset-version, provenance, completeness, activation, release and presentation rules while defining the relationship between dataset, user-state and result contexts for PTU Preview.

Until this proposal is approved and merged to `main` as FROZEN, `VECTOR_VERSIONING_V1.md` v1.0 remains the binding Production authority. This PROPOSED document does not itself resolve R3 or authorize behavior that conflicts with a FROZEN rule.

## 2. Canonical Internal Identifier

The canonical combined identifier is:

```text
Vector_{VersionNumber}_SC_{LIVEBuild}
```

Example:

```text
Vector_1.3.1_SC_4.10.2-LIVE.12881860
```

The Star Citizen component always uses the approved LIVE build. PTU, EPTU, Tech Preview or other non-LIVE channels must never replace it.

## 3. VECTOR Application Version

The VECTOR application version follows:

```text
MAJOR.FEATURE.PATCH
```

- **MAJOR:** fundamental or incompatible platform, contract, architecture or data-model changes.
- **FEATURE:** backward-compatible functional expansion.
- **PATCH / FIX:** backward-compatible bugfix or correction without a new feature set.

## 4. Independent Version Axes

VECTOR code and Star Citizen datasets evolve independently.

- An application-only change may increment the VECTOR version while leaving the LIVE dataset unchanged.
- A dataset update may change the build or dataset revision without changing the VECTOR application version.
- Enrichment or correction within the same game build increments the dataset revision; it does not by itself create a VECTOR application release.

## 5. Dataset Revision and Provenance

The canonical combined identifier is not sufficient to distinguish repeated extractions of the same build. VECTOR therefore retains internal provenance for each dataset context, including:

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

Exact storage names may be adapted during implementation, but the provenance information must remain available. A dataset revision identifies a published reference-data state; it is not a VECTOR code version.

## 6. Typed Context Model

Every calculation and persisted result must distinguish these three typed concepts. They are not interchangeable, and a channel label alone does not identify a user-state or result context.

### 6.1 Dataset Context

The Dataset Context identifies the single active source of channel-dependent game/reference data used by an operation. In v1, the supported reference-data contexts are:

```text
LIVE_REFERENCE_DATASET
PTU_REFERENCE_DATASET
```

LIVE and PTU reference records, statistics and derived reference values remain strictly isolated. One calculation must not combine records or derived reference values from both contexts.

### 6.2 User State Context

The User State Context identifies the user-owned state selected as input, independently of the Dataset Context. In v1, the mutable game-state context is:

```text
PRODUCTION_USER_STATE
```

A calculation may consume a read-only `PRODUCTION_USER_STATE_SNAPSHOT`. That snapshot does not become a dataset, does not acquire the dataset's channel, and must not be mutated by a preview. `PTU_NATIVE_STATE` is not implemented in v1.

### 6.3 Result Context

The Result Context identifies what the output means and what claims it is permitted to make. For the bounded PTU preview defined here, the result context is:

```text
PTU_PREVIEW
```

`PTU_PREVIEW` is not a user-state store and is not `PTU_NATIVE_STATE`. It is a visibly labeled, provenance-bearing preview result.

### 6.4 Permitted PTU Preview combination

The following typed combination is explicitly permitted by this proposed successor:

```text
Dataset Context:
    PTU_REFERENCE_DATASET

User State Context:
    PRODUCTION_USER_STATE_SNAPSHOT (read-only)

Result Context:
    PTU_PREVIEW
```

No other context is implied by this combination. In particular, it does not create a PTU user-state realm or permit the preview to claim PTU-native facts.

### 6.5 PTU Preview input and result constraints

For this combination:

1. All channel-dependent reference values, statistics and derived reference calculations come exclusively from the selected PTU dataset and its identified revision.
2. Production User State may only select canonical entities, quantities and existing Production assets as preview inputs. It is not a source of channel-dependent reference values.
3. The snapshot is read-only. The preview must not mutate Production User State, including its Inventory, Fleet, Actual Loadout or other state domains.
4. The result must not assert PTU ownership, PTU inventory, PTU wallet, PTU reputation or any other PTU-native mutable game state.
5. The result must be visibly labeled `PTU_PREVIEW`; it must not be presented as verified Production state or native PTU state.
6. Provenance must identify both the exact PTU Dataset Context (including dataset revision) and the Production User State Context/snapshot used.
7. Missing, ambiguous, contradictory or incompatible required inputs must follow No-Guess and completeness rules. The system must mark the result incomplete, reject it or require review; it must not guess, silently substitute values or use LIVE as fallback.

PTU-native mutable state remains a future capability. It requires explicit implementation and governance before any PTU-native ownership, inventory, wallet, reputation, other mutable state or PTU-native wipe operation is available.

## 7. LIVE and PTU Rules

### 7.1 LIVE

- LIVE is the canonical Production dataset baseline.
- The canonical combined VECTOR identifier always references LIVE.
- LIVE is not assumed complete merely because it is LIVE; it must pass the Completeness Filter before activation or use in affected calculations.

### 7.2 PTU

- PTU is an additional early-data channel and does not alter the canonical combined VECTOR identifier.
- PTU data may be incomplete, provisional or inconsistent and must pass the same Completeness Filter principles as LIVE.
- `PTU_PREVIEW` uses a PTU Reference Dataset; it does not make Production User State into PTU state.

### 7.3 Strict dataset-channel isolation

LIVE and PTU are strictly isolated Dataset Contexts.

1. LIVE records, derived reference values and channel-dependent calculation inputs must never be mixed with PTU records, derived reference values or channel-dependent calculation inputs in one active Dataset Context.
2. The application must provide an explicit global dataset-channel selector for `LIVE` and `PTU`.
3. Switching the selector changes the active Dataset Context for channel-dependent views, lookups, calculations and derived reference results.
4. The active Dataset Context and compact game-data version must remain clearly visible, for example `LIVE 4.10.2` or `PTU 4.10.3`.
5. A calculation uses exactly one Dataset Context. Cross-channel fallback is prohibited. Missing PTU data must not be completed with LIVE data, and missing LIVE data must not be completed with PTU data.
6. The Completeness Filter applies when required data is missing; the affected result is marked incomplete or excluded according to validation rules.
7. The canonical VECTOR release identifier continues to use the approved LIVE build, including while a user views PTU data.
8. A read-only Production User State snapshot used for PTU Preview is a separately typed User State Context, not LIVE reference data or a second Dataset Context. It cannot supply or override any channel-dependent reference value.

### 7.4 No-Guess and Completeness Filter

Channel membership does not imply completeness. Required inputs must be explicitly present and valid. Missing values must not be replaced by guesses or implicit zeroes; orphaned, contradictory or structurally unusable records must not enter affected calculations. An unreliable calculation must be marked incomplete, rejected or excluded from normal output.

Recommended status values:

```text
VALID
PARTIAL
INCOMPLETE
REJECTED
```

The detailed validation matrix belongs to the Dataset Pipeline specification. No-Guess applies independently to source data, identity, resolver results and context selection.

## 8. UI Presentation

The normal application UI focuses on the dataset build relevant to the user:

```text
LIVE 4.10.2
PTU 4.10.3
```

The full VECTOR application version does not need to be repeated in every dataset context and may be displayed separately in a system/about/version area.

A detailed version view should expose:

```text
VECTOR version       1.3.1
Release baseline     LIVE 4.10.2
Full LIVE build      4.10.2-LIVE.12881860
LIVE dataset rev.    <revision>
PTU dataset          4.10.3
Environment          PRODUCTION or DEVELOP
Validation status    <status>
```

Any result using the PTU Dataset Context and Production User State snapshot must visibly identify its Result Context as `PTU_PREVIEW`.

## 9. Development and Production Labels

Development builds may use a prerelease marker, for example:

```text
Vector_1.4.0-dev_SC_4.10.2-LIVE.12881860
```

Production removes the prerelease marker:

```text
Vector_1.4.0_SC_4.10.2-LIVE.12881860
```

The LIVE build component remains the approved LIVE baseline in both cases.

## 10. Dataset Activation

External SCMDB data must not become active merely because new source data exists. The expected lifecycle is:

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

A merge into `main` releases VECTOR code. A validated dataset activation may update the data baseline independently, without a new VECTOR application version, provided no code or schema change is necessary.

If a dataset requires application, schema, normalization or engine changes, those changes follow the normal `develop -> Preview -> main` release workflow and update the VECTOR application version as appropriate.

## 12. GitHub README Release Documentation

The repository-root `README.md` is part of the official VECTOR release documentation.

1. Every MAJOR VECTOR release must update `README.md`.
2. The README must describe the current major release baseline and must not remain on an obsolete scaffold or previous major-version description.
3. The README update is part of the applicable MAJOR release gate and must be merged through the normal `develop -> main` workflow.
4. The README should reference the released VECTOR version and applicable LIVE dataset context where useful.
5. GitHub release / GitHub Actions automation is preferred but is not required until implemented and validated.
6. Until that automation exists, the README update is a mandatory manual MAJOR-release checklist item.

## 13. Supersession and Proposed Decision

VECTOR Versioning v1.1 is **PROPOSED**. It preserves the v1.0 rules except where it explicitly clarifies typed contexts and the PTU Preview boundary.

After approval and merge to `main` as FROZEN, v1.1 supersedes `VECTOR_VERSIONING_V1.md` v1.0 specifically for:

- §6.3, strict dataset-channel isolation, clarified to distinguish Dataset Context from a read-only User State Context;
- §13, Frozen Decision, insofar as it summarizes the isolation and calculation-input boundary.

All other v1.0 rules remain in force as carried forward by this successor, except where explicitly amended by an approved rule. No supersession takes effect from this proposal alone. Until then, v1.0 remains the binding Production rule, and R3 remains open.

Approval requires project-owner review, cross-spec consistency review against applicable FROZEN rules, reconciliation of `RULE_INDEX.md`, review on `develop`, and merge through the normal release process into `main`. Relevant dependent FROZEN specifications must be assessed and reconciled through their own governed successor paths; this proposal does not silently amend them.
