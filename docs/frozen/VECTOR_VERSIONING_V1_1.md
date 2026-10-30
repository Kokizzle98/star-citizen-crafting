# VECTOR Versioning v1.1

- **Status:** FROZEN
- **Version:** 1.1
- **Authority Scope:** VERSIONING
- **Approved By:** project_owner
- **Predecessor:** `VECTOR_VERSIONING_V1.md` v1.0 (formerly FROZEN; superseded in full upon successful completion of the governed transition in §16)
- **Supersedes:** `VECTOR_VERSIONING_V1.md` v1.0 in full, effective only upon completion of §16
- **Supersession scope:** full document
- **Supersession state:** EFFECTIVE UPON SUCCESSFUL GOVERNED MERGE TO `main`
- **Frozen on:** 2026-10-30, effective upon successful governed merge to `main`
- **Approval evidence:** Repository-owner approval recorded on 2026-10-30; transition evidence is retained in the governed freeze-transition change set and pull-request history (see §16.2)
- **Affected dependent specifications:** see §16.5 and `docs/reviews/VERSIONING_V1_1_IMPACT_ASSESSMENT.md`
- **Freeze readiness:** APPROVED; governed freeze transition approved by the repository owner on 2026-10-30 and effective upon successful governed merge to `main`
- **Scope:** VECTOR application versioning, Star Citizen build and dataset provenance, typed dataset/user-state/result contexts, LIVE/PTU isolation, PTU Preview boundary and UI presentation

## 1. Purpose and authority

This specification is the **complete, full-document successor** to VECTOR Versioning v1.0. It carries forward every still-valid v1.0 rule (§§2-5 and §§8-14) and adds the typed context model and the PTU Preview boundary (§§6-7), so that after a governed promotion exactly one VERSIONING document is authoritative.

Once effective, this document defines the binding versioning model for VECTOR. It separates application evolution from Star Citizen dataset evolution while retaining a reproducible relationship between a VECTOR release and its approved LIVE data baseline.

This governed freeze-transition copy becomes authoritative only upon successful merge to `main`. Until that effectiveness condition is met, `VECTOR_VERSIONING_V1.md` v1.0 remains the binding VERSIONING authority. Upon successful completion of §16, this FROZEN document:

- becomes the sole binding VERSIONING authority;
- resolves R3 through the simultaneously applied Rule Index transition;
- supersedes Versioning v1.0 in full and atomically;
- shares no authority with v1.0 after effectiveness. There is no partial or sectional supersession and no state in which both versions are binding.

Do not treat this document as a Production-authoritative rule.

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

A dataset revision identifies a published reference-data state; it is not a VECTOR code version. Result-level provenance for PTU Preview results is defined in §7.5 and is additional to, not a replacement for, the required metadata above.

## 6. Terminology and Typed Context Model

Every calculation and every persisted or externally presented result must distinguish the typed concepts in §§6.2-6.6. They are not interchangeable, and a channel label alone does not identify a user-state context or a result context. No identifier below is used for more than one concept.

### 6.1 Qualified use of "Production"

To avoid ambiguity, this specification uses the following qualified terms and does not use "Production" unqualified:

| Term | Meaning |
|---|---|
| Production deployment | The deployed application built from `main` (Governance deployment mapping). Appears in the UI `Environment` field as `PRODUCTION`. |
| `main` deployment | The act or state of deploying `main`; a release boundary, not a data concept. |
| Production User State | The mutable, authoritative VECTOR user-state domain (`PRODUCTION_USER_STATE`, §6.3). It is not a deployment environment and not a dataset. |
| LIVE baseline | The canonical game-data baseline from the LIVE channel (§8.1). It is never called "Production data". |
| Asset recorded in Production User State | An inventory, fleet or loadout record held in `PRODUCTION_USER_STATE`. This replaces the informal term "Production asset". |

### 6.2 Dataset Context

The Dataset Context identifies the single active source of channel-dependent game/reference data used by an operation. In v1, the supported Dataset Contexts are:

```text
LIVE_DATASET_CONTEXT
PTU_DATASET_CONTEXT
```

The channel values `LIVE` and `PTU` identify the channel of a Dataset Context; the context identifiers above identify the context itself. In prose, the PTU Dataset Context is the context built from the PTU Reference Dataset.

LIVE and PTU reference records, statistics and derived reference values remain strictly isolated. One calculation must not combine records or derived reference values from both contexts.

### 6.3 User State Context

The User State Context identifies the user-owned state selected as input, independently of the Dataset Context. In v1, the only mutable game-state context is:

```text
PRODUCTION_USER_STATE
```

`PRODUCTION_USER_STATE` is the mutable authoritative v1 user-state domain. Switching the Dataset Context does not create, copy or replace it. `PTU_NATIVE_STATE` is not implemented in v1 (see §7.6).

### 6.4 User State Snapshot

```text
PRODUCTION_USER_STATE_SNAPSHOT
```

A `PRODUCTION_USER_STATE_SNAPSHOT` is an **immutable, read-only, bounded capture or evaluation view** of `PRODUCTION_USER_STATE` used by one calculation or preview. It is the only form in which Production User State enters a PTU Preview.

A snapshot must explicitly carry:

```text
user_state_snapshot_id
snapshot_captured_at          (or snapshot_revision)
source_user_state_context     (= PRODUCTION_USER_STATE)
consistency_boundary
```

- `user_state_snapshot_id` identifies exactly one snapshot.
- `snapshot_captured_at` or `snapshot_revision` marks the state revision the snapshot reflects; at least one must be present.
- `consistency_boundary` states which state domains and entities the snapshot covers and whether they were captured at one consistent revision.

A snapshot is not a dataset, does not acquire a dataset channel, and is neither `PTU_NATIVE_STATE` nor a copy of user state for PTU. A preview must never mutate the snapshot or its source `PRODUCTION_USER_STATE`.

### 6.5 Preview operation / evaluation

```text
PTU_PREVIEW_EVALUATION        (evaluation_type = PTU_PREVIEW)
```

A `PTU_PREVIEW_EVALUATION` is the calculation or operation that evaluates hypothetical or comparative results using exactly one PTU Dataset Context and, optionally, one `PRODUCTION_USER_STATE_SNAPSHOT`. The value `PTU_PREVIEW` of `evaluation_type` identifies the kind of evaluation.

### 6.6 Result Context and visible label

```text
RESULT_CONTEXT_PTU_PREVIEW
```

The Result Context identifies what an output means and what claims it is permitted to make. `RESULT_CONTEXT_PTU_PREVIEW` is not a user-state store, not a dataset and not `PTU_NATIVE_STATE`. It is a visibly labeled, provenance-bearing preview result context.

The **visible label** shown to users is the text `PTU_PREVIEW`. This is a user-visible label only. It is never used as a context identifier, a dataset identifier or a state identifier.

### 6.7 Intentional semantic clarification of isolation

v1.0 §6.3 states that LIVE and PTU "records, derived values and calculation inputs" must not be mixed in the same active dataset context. This successor intentionally clarifies that wording by distinguishing typed contexts. It is a clarification, not a relaxation:

1. One Dataset Context contains reference data, statistics and derived reference values from **exactly one channel**. LIVE and PTU reference data are never mixed.
2. No LIVE reference value, LIVE statistic or LIVE-derived value may enter a `PTU_PREVIEW_EVALUATION`, and no PTU value may enter a LIVE calculation.
3. A `PRODUCTION_USER_STATE_SNAPSHOT` used in a PTU Preview is **cross-context user-state provenance and selection input**. It is not LIVE reference calculation input, is not a second Dataset Context, and cannot supply or override any channel-dependent reference value.
4. Cross-channel fallback remains prohibited (§8.3).

## 7. PTU Preview Boundary

### 7.1 Permitted PTU Preview combination

The following typed combination is the only combination permitted for a PTU Preview that consumes Production User State:

```text
Dataset Context:
    PTU_DATASET_CONTEXT              (PTU Reference Dataset)

User State Context (source):
    PRODUCTION_USER_STATE            (never mutated by the preview)

User State Snapshot (separate read-only input derived from the source context, §6.4):
    PRODUCTION_USER_STATE_SNAPSHOT   (immutable)

Result Context:
    RESULT_CONTEXT_PTU_PREVIEW       (visible label: PTU_PREVIEW)
```

No other context is implied. The combination does not create a PTU user-state realm and does not permit the preview to claim PTU-native facts.

A reference-only PTU Preview does not consume Production User State. It uses `PTU_DATASET_CONTEXT` and `RESULT_CONTEXT_PTU_PREVIEW` with no User State Context and no snapshot. If Production User State is consumed, `PRODUCTION_USER_STATE` is the source User State Context, the preview neither mutates nor directly consumes that mutable state, and the evaluation input is the corresponding immutable `PRODUCTION_USER_STATE_SNAPSHOT` derived from it.

### 7.2 Input and result constraints

1. Every channel-dependent reference value, every channel-dependent statistic and every derived reference calculation comes exclusively from the selected PTU Dataset Context and its identified dataset revision. No LIVE reference value is used.
2. Production User State may only identify canonical entities, quantities and assets recorded in Production User State that are available for hypothetical evaluation. It is a read-only selection/input source and not a source of channel-dependent reference values.
3. Production User State and its snapshot are never mutated by the preview, including Inventory, Fleet, Actual Loadout and other state domains.
4. The result must not assert PTU ownership, PTU inventory, PTU wallet, PTU reputation or any other PTU-native mutable game state, and must not present Production ownership as PTU ownership.
5. The result must be visibly labeled `PTU_PREVIEW`; it must not be presented as verified Production User State or as native PTU state.
6. Missing, ambiguous, contradictory or incompatible required inputs follow the No-Guess and Completeness rules (§9) and §7.4. The result must be marked incomplete or non-valid, rejected, or routed to review. The system must not guess, silently substitute values or use LIVE as a fallback.

### 7.3 Cross-channel canonical entity mapping

Mapping an asset recorded in Production User State to a canonical entity represented in the PTU Dataset Context follows the identity and resolution rules of the canonical data model authority. `CANONICAL_DATA_MODEL_V1.md` is currently PROPOSED, so references to it in this specification are non-binding forward references until it is FROZEN. This specification does not define or redefine the canonical identity model.

Until a FROZEN canonical data model authority exists, the following interim contract applies to a `PTU_PREVIEW_EVALUATION`:

- internal VECTOR identifiers and deterministic mappings remain governed by the applicable FROZEN rules (`PERSISTENCE_PROVENANCE_V1.md` §3);
- uncertain external identity matches are never guessed;
- non-deterministic or ambiguous mappings remain unresolved and require review;
- `SOURCE_DATA_MISSING` and `REVIEW_REQUIRED` are used in this specification with the meanings given below, for its own PTU Preview resolution contract; a future FROZEN canonical data model authority may define them more broadly but must preserve this fail-closed behavior;
- no LIVE reference data is substituted for a PTU representation; and
- mapping and resolution provenance is required (§7.5).

Any later canonical authority used by this specification must preserve at least the fail-closed safety guarantees required here. Adopting weaker behavior requires a governed successor or amendment to this specification before that behavior may be used.

Fail-closed behavior for a `PTU_PREVIEW_EVALUATION`:

1. If the canonical entity has no representation in the PTU Dataset Context, or required source data is missing, no LIVE reference data is substituted. The mapping outcome is `SOURCE_DATA_MISSING`: for this specification it means that the required PTU representation or source data is absent, and the dependent result is not valid.
2. If identity is ambiguous, non-deterministic or evidence is contradictory, the mapping outcome is `REVIEW_REQUIRED`: for this specification it means that the mapping is unresolved and must be reviewed before it is used. The mapping is not guessed. A canonical authority may define a stricter unresolved or quarantine outcome, which then also satisfies this item.
3. Mapping provenance is preserved: every canonical entity mapping used is recorded with its outcome and evidence reference (§7.5).

### 7.4 No-Guess consequence for previews

A `PTU_PREVIEW_EVALUATION` with missing required inputs receives an explicit incomplete or non-valid `resolution_state` **and** is excluded from normal valid calculated output. It may be exposed only through a controlled diagnostic or review surface, labeled as non-valid, never as a valid preview result.

### 7.5 Mandatory result and snapshot provenance

Every persisted `PTU_PREVIEW_EVALUATION` result, and every such result presented externally (UI, API or export), must carry the following provenance. The field names below are required by this specification. The names `dataset_revision_id`, `channel`, `sc_build`, `resolver_version` and `taxonomy_version` are intended to match the proposed `CANONICAL_DATA_MODEL_V1.md`, which is currently PROPOSED, so that reference is a non-binding forward reference until that document is FROZEN; the names `vector_version`, `release_sc_build`, `*_dataset_revision` and `*_source_revision` come from §5. Any later alignment must preserve at least the provenance required here; weaker provenance requires a governed successor or amendment to this specification.

```text
result_context                 RESULT_CONTEXT_PTU_PREVIEW
evaluation_type                PTU_PREVIEW
dataset_context                PTU_DATASET_CONTEXT
channel                        PTU
sc_build                       PTU build (= ptu_build)
dataset_revision_id            selected PTU dataset revision (identifies ptu_dataset_revision)
upstream_revision              PTU source revision (= ptu_source_revision)
vector_version                 VECTOR application version
release_sc_build               approved LIVE build of the release
user_state_context             PRODUCTION_USER_STATE (only if Production User State was consumed)
user_state_snapshot_id         snapshot used, if any
snapshot_captured_at | snapshot_revision
canonical_entity_mappings[]    vector_entity_id, mapping outcome, evidence reference
resolver_version               where a resolver or rule set was applied
taxonomy_version               where taxonomy was applied
resolution_state               VALID | PARTIAL | INCOMPLETE | REJECTED | REVIEW_REQUIRED
created_at                     result creation time
reproducibility                REPRODUCIBLE | NON_REPRODUCIBLE (with reason)
```

Rules:

- `reproducibility` is `REPRODUCIBLE` only if the exact `dataset_revision_id` content and all evaluation inputs remain retrievable and, where Production User State was consumed, the exact snapshot (or an equivalent retained state revision) also remains retrievable. Otherwise it is `NON_REPRODUCIBLE`, with the missing input or retention reason stated. A reference-only PTU Preview, which has no snapshot, may therefore be `REPRODUCIBLE`. Immutability of a snapshot does not by itself require its retention, and this specification does not introduce a dataset-retention or snapshot-retention requirement.
- If no snapshot was used (reference-only PTU Preview), `user_state_context`, `user_state_snapshot_id` and the snapshot time/revision are explicitly absent, and the result must not imply that Production User State was consulted. If Production User State was consumed, `user_state_context`, `user_state_snapshot_id` and `snapshot_captured_at` or `snapshot_revision` are mandatory. The `user_state_context` field contains `PRODUCTION_USER_STATE` and never `PRODUCTION_USER_STATE_SNAPSHOT`; the snapshot is identified only by `user_state_snapshot_id`.
- Provenance must identify the exact PTU Dataset Context (including dataset revision) and, where Production User State was consumed, the Production User State Context and the snapshot used.

**Non-persisted results.** A PTU Preview result that is not persisted is not exempt from the provenance contract above. When presented externally (UI, API or export), it must carry, or provide an unambiguous association to, all applicable provenance fields listed above; provenance that is not unambiguously bound to the specific result does not satisfy this requirement. At minimum, the following fields must be attached directly to the visible or transported output: `result_context`, `evaluation_type`, `channel`, `sc_build`, `dataset_revision_id`, `resolution_state`, `created_at`, and the visible `PTU_PREVIEW` label, plus `user_state_snapshot_id` with `snapshot_captured_at` or `snapshot_revision` if Production User State was consumed. All other applicable fields listed above (for example `vector_version`, `release_sc_build`, `canonical_entity_mappings[]`, `resolver_version` where applied, and `reproducibility`) must be carried with the output or unambiguously associated with it. This minimum does not waive, replace or limit the full applicable provenance contract; if a reduced envelope would make any required provenance unavailable, the envelope is insufficient. This paragraph does not itself require persistence of the result, dataset retention or snapshot retention. A non-persisted result is `NON_REPRODUCIBLE` unless its inputs are separately retained.

### 7.6 PTU-native mutable state

PTU-native mutable state (`PTU_NATIVE_STATE`) is a future capability and is not active in v1. It requires explicit implementation and governance before any PTU-native ownership, inventory, wallet, reputation, other mutable state or PTU-native wipe operation is available. Nothing in this specification introduces it.

## 8. LIVE and PTU Rules

### 8.1 LIVE

- LIVE is the canonical Production dataset baseline (the LIVE baseline, §6.1).
- The canonical combined VECTOR identifier always references LIVE.
- LIVE data is not assumed to be complete merely because it is LIVE.
- LIVE must pass the Completeness Filter before activation or use in affected calculations.

### 8.2 PTU

- PTU is an additional early-data channel.
- PTU does not alter the canonical combined VECTOR identifier.
- PTU data may be incomplete, provisional or inconsistent.
- PTU must pass the same Completeness Filter principles as LIVE.
- A PTU Preview uses the PTU Dataset Context; it does not make Production User State into PTU state.

### 8.3 Strict dataset-channel isolation

LIVE and PTU are strictly isolated dataset contexts.

Binding rules:

1. LIVE records, derived values and channel-dependent calculation inputs must never be mixed with PTU records, derived values or channel-dependent calculation inputs in the same active Dataset Context.
2. The application must provide a global dataset-channel selector that allows the user to switch explicitly between `LIVE` and `PTU`.
3. Switching the global channel changes the active Dataset Context for all channel-dependent views, lookups, calculations and derived results.
4. The currently active channel and compact game-data version must remain clearly visible in the application, for example `LIVE 4.10.2` or `PTU 4.10.3`.
5. A calculation must use data from exactly one active channel, that is, exactly one active Dataset Context. Cross-channel fallback is prohibited. Missing PTU data must not be completed with LIVE data, and missing LIVE data must not be completed with PTU data.
6. If required data is missing in the active channel, the Completeness Filter applies and the affected result is marked incomplete or excluded according to the validation rules.
7. The canonical VECTOR release identifier continues to use the approved LIVE build even when a user is actively viewing the PTU dataset.
8. A read-only `PRODUCTION_USER_STATE_SNAPSHOT` used for a PTU Preview is a separately typed User State Snapshot (§6.4, §6.7), derived from the User State Context `PRODUCTION_USER_STATE` (§6.3). It is not LIVE reference data or a second Dataset Context. It cannot supply or override any channel-dependent reference value.

## 9. Completeness Filter

The Completeness Filter applies to both LIVE and PTU.

Binding rules:

1. Channel membership does not imply completeness.
2. Required input data must be explicitly present and valid.
3. Missing values must not be replaced by guessed values or implicit zeroes.
4. Orphaned, contradictory or structurally unusable records must not enter affected calculations.
5. A calculation with missing required inputs receives an incomplete state and is filtered from normal calculated output.
6. The system may expose a controlled diagnostic state for incomplete records, but must not present an unreliable calculation as valid.

No-Guess applies independently to source data, identity, resolver results and context selection.

Recommended status values:

```text
VALID
PARTIAL
INCOMPLETE
REJECTED
```

`REVIEW_REQUIRED` (§7.5) is an additional resolution state for ambiguous identity or context outcomes.

The detailed validation matrix belongs to the Dataset Pipeline specification.

## 10. UI Presentation

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

`Environment` denotes the deployment environment (§6.1).

Any result produced by a `PTU_PREVIEW_EVALUATION` must visibly carry the label `PTU_PREVIEW`.

## 11. Development and Production Labels

Development builds may use a prerelease marker for the VECTOR application version, for example:

```text
Vector_1.4.0-dev_SC_4.10.2-LIVE.12881860
```

Production deployments remove the prerelease marker:

```text
Vector_1.4.0_SC_4.10.2-LIVE.12881860
```

The LIVE build component remains the approved LIVE baseline in both cases.

## 12. Dataset Activation

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

## 13. Release and Data Update Relationship

A merge into `main` releases VECTOR code.

A validated dataset activation may update the data baseline independently, without requiring a new VECTOR application version, provided no code or schema change is necessary.

If a dataset requires application, schema, normalization or engine changes, those changes follow the normal `develop -> Preview -> main` release workflow and update the VECTOR application version as appropriate.

## 14. GitHub README Release Documentation

The repository-root `README.md` is part of the official VECTOR release documentation.

Binding rules:

1. Every MAJOR VECTOR release must update `README.md`.
2. The README update must describe the current major release baseline and must not remain on an obsolete scaffold or previous major-version description.
3. The README update is part of the applicable MAJOR release gate and must be merged through the normal `develop -> main` workflow.
4. The README should reference the released VECTOR version and the applicable LIVE dataset context where useful.
5. Automation through the GitHub release / GitHub Actions pipeline is the preferred future implementation, but is not required until the release automation is implemented and validated.
6. Until that automation exists, the README update is a mandatory manual MAJOR-release checklist item.

## 15. Successor Decision

Subject to the lifecycle in §16, VECTOR Versioning v1.1 carries forward the decisions of v1.0, including the GitHub README MAJOR-release documentation rule, and adds the typed context and PTU Preview boundary decisions.

Binding decisions:

- canonical format: `Vector_{VersionNumber}_SC_{LIVEBuild}`;
- the SC component always references LIVE;
- VECTOR version and dataset build are independent axes;
- same-build dataset enrichments use dataset revisions;
- PTU is displayed and processed separately but never becomes the canonical release-build component;
- LIVE and PTU are strictly isolated runtime Dataset Contexts; the application provides an explicit global channel selector and cross-channel fallback or mixing is prohibited;
- LIVE and PTU both pass the Completeness Filter;
- normal UI presentation uses compact dataset labels such as `LIVE 4.10.2` and `PTU 4.10.3`;
- full provenance remains available internally and in a detailed system/version view;
- Dataset Context, User State Context, User State Snapshot, preview evaluation and Result Context are separate typed concepts;
- a PTU Preview uses exactly one PTU Dataset Context and, if it consumes Production User State, only a read-only `PRODUCTION_USER_STATE_SNAPSHOT`; it never mutates Production User State and never asserts PTU-native state;
- every PTU Preview result carries the provenance in §7.5.

Any material amendment requires a successor version of this document and the normal VECTOR governance process.

## 16. Supersession Lifecycle and Freeze-Transition Requirements

This section defines the lifecycle only. It does not perform, authorize or pre-authorize any step of it.

### 16.1 Authority until completion

1. `VECTOR_VERSIONING_V1.md` v1.0 remains the sole binding VERSIONING authority until this governed change set is successfully merged to `main`; afterward v1.1 is the sole binding VERSIONING authority.
2. Before completion of the governed freeze transition, this document was non-binding wherever it existed. Its prior presence on `develop` or `main` as a PROPOSED document did not supersede v1.0 or resolve R3.
3. Supersession is full-document and atomic. At no point are v1.0 and v1.1 both authoritative.
4. References in this document to supersession becoming effective "upon completion of §16" mean successful completion of the governed freeze transition (§16.2 phase `GOVERNED_TRANSITION_ACTION`, ending with merge into `main`, and §16.4) under the then-binding Governance. Satisfying the `PRE_PROMOTION_READINESS` items does not by itself make the transition effective. This document records its proposed acceptance criteria; evidence shows whether they are met; the then-binding Governance and the authorized approval process decide promotion; and effectiveness follows only from the successful governed transition. If the transition is not approved, is incomplete or fails, v1.0 remains FROZEN and authoritative. This document cannot make itself authoritative by declaring its own criteria complete.

### 16.2 Freeze-transition acceptance criteria and evidence

Each item below has a process phase and an authority category. The process phase states when the item occurs; the authority category (defined in §16.3) states where the requirement comes from. They are independent.

Process phases:

- `PRE_PROMOTION_READINESS`: completed before the promotion decision is requested or approved. It contains reviews, the impact assessment, gate results, the prepared (not yet approved or merged) change set, and the recorded expected approver and requested decision.
- `GOVERNED_TRANSITION_ACTION`: performed in the approved freeze-transition change set and complete when that change set is merged into `main`. It contains approval, status and metadata changes, the Rule Index transition, reference dispositions and the merge.
- `POST_TRANSITION_EVIDENCE`: available only after the transition has completed. It contains retained merge and approval records and verification of the effective status.

Items categorized `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` are acceptance criteria for this proposal only; they are one-time transition criteria, not ongoing rules after freeze. Satisfying the readiness items does not by itself make the transition effective, and nothing in this section makes this document authoritative.

Phase `PRE_PROMOTION_READINESS`:

1. completed review on `develop` (`DERIVED_FROM_GOV_V1`: §3.2, §3.3; v1.0 §13);
2. completed cross-spec consistency review against applicable FROZEN specifications (`PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`);
3. a completed impact assessment with no open freeze blocker (`PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`);
4. the proposed freeze-transition change set prepared, but not yet approved or merged, containing the draft approval/frozen-date fields, linked review or pull-request evidence, the predecessor, the supersession scope (full document), the affected dependent specifications with their planned reference dispositions, and the draft Rule Index transition (§16.4) (`PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`; identifying the superseded version is `GOV-V1_BINDING`: §5.4);
5. required validation and release gates passed on the prepared change set before it is merged (`GOV-V1_BINDING`: §8);
6. the expected approver (`project_owner`) and the requested decision recorded (`PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`; the role name is a Rule Index convention, not a Governance v1 requirement).

Phase `GOVERNED_TRANSITION_ACTION`:

7. approval recorded, with `Approved By` (approval is `GOV-V1_BINDING`: §3.1, §5; the role name is `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`);
8. this document assigned FROZEN status and effective lifecycle metadata (`Frozen on`, `Approved By`, `Supersedes` naming v1.0 in full) and the predecessor/successor relationship recorded (identifying the superseded version is `GOV-V1_BINDING`: §5.4; FROZEN status is `DERIVED_FROM_GOV_V1`: §3.1, §5; the remaining metadata is `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`);
9. the Rule Index lifecycle transition applied simultaneously in the same change set (§16.4) (`PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`);
10. dependent-reference dispositions selected and applied where required, under the then-binding Governance (`PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`);
11. the change set merged through the authorized process into `main` (merge into `main` is `GOV-V1_BINDING`: §3.1, §3.3, §5.6; that the merged rule is FROZEN is `DERIVED_FROM_GOV_V1`: §3.1, §5).

Phase `POST_TRANSITION_EVIDENCE`:

12. merge and approval evidence retained (`GOV-V1_BINDING`: §6, traceability);
13. the effective status verified: v1.1 FROZEN and v1.0 `SUPERSEDED` in the Rule Index on `main` (`PROPOSAL_LOCAL_ACCEPTANCE_CRITERION`).

Items 7 to 11 are performed in one change set: items 7 to 10 are part of it when it is merged, and item 11 completes it. Supersession becomes effective only if the governed transition completes successfully. If the transition is not approved, is incomplete or fails, v1.0 remains FROZEN and authoritative. A PROPOSED document merely present on `main` fulfils none of these items.

### 16.3 Source and authority category of each requirement

Each requirement is labelled with an authority category and its exact source. Governance v1 is the only current authority; proposed documents are not binding. Authority categories are independent of the process phases defined in §16.2.

| Category | Meaning |
|---|---|
| `GOV-V1_BINDING` | Stated literally by FROZEN `VECTOR_GOVERNANCE_V1.md`, at the strength the text states (must, may or should). |
| `DERIVED_FROM_GOV_V1` | An interpretation or operational consequence supported by Governance v1 but not stated literally. |
| `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` | A criterion for evaluating and promoting this proposal. Not general authority; satisfied once and recorded as transition evidence; not an ongoing rule after freeze. |
| `V1_1_FUTURE_BINDING_RULE` | A substantive rule carried by this document (§§2-15) that becomes binding only if v1.1 is governedly approved, frozen and made effective. |

| Requirement | Category | Source |
|---|---|---|
| A FROZEN rule is not silently overwritten; a material change creates a new version; the successor identifies the superseded version | `GOV-V1_BINDING` | `VECTOR_GOVERNANCE_V1.md` §5.1, §5.2, §5.4 |
| The former rule remains in Git history and may be marked `SUPERSEDED` | `GOV-V1_BINDING` | §5.3 (permissive: "may") |
| A proposed rule becomes Production-authoritative only after merge into `main` | `GOV-V1_BINDING` | §5.6, §3.2 |
| The merged rule must be FROZEN and approved | `DERIVED_FROM_GOV_V1` | §3.1 ("FROZEN rules present in `main`"), §5 ("binding after approval"); §5.6 does not itself say "FROZEN" |
| Approval before a rule is binding; only reviewed and release-approved changes enter `main` | `GOV-V1_BINDING` | §3.1, §5; Governance v1 does not name the approver |
| Successor document, documented rationale, review on `develop`, merge through the normal release process into `main` | `DERIVED_FROM_GOV_V1` | §3.2, §3.3; §11 governs amendments to Governance itself and is applied here by analogy and through the "normal VECTOR governance process" in v1.0 §13 |
| Traceability through Git commits and, where appropriate, pull requests | `GOV-V1_BINDING` | §6, first paragraph ("must be traceable") |
| A change should include reason, consequences and the replacement relationship | `GOV-V1_BINDING` (recommendation only) | §6 list ("should include"); creates no MUST |
| Release gates before merging `develop` into `main` | `GOV-V1_BINDING` | §8 |
| ADR for significant architectural changes | `GOV-V1_BINDING` | §5.5 requires an ADR for significant architectural changes. Governance v1 does not define the significance threshold. Owner decision V11-PF-04 determines that this Versioning v1.1 promotion is a rule/specification successor and is not a significant architectural change under §5.5, so no ADR is required for this promotion. This does not establish a general ADR threshold |
| `Approved By` (expected `project_owner`), `Supersedes` and Authority Scope metadata | `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` | Rule Index metadata convention (`RULE_INDEX.md` §4, L45-57; itself PROPOSED, "should declare"); Governance v1 requires only that the successor identify the superseded version (§5.4) |
| Impact analysis for affected FROZEN rules; no open freeze blocker | `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` | Recommended by proposed `VECTOR_GOVERNANCE_V1_1.md` §9 item 3 (non-binding); not in Governance v1 |
| Cross-spec consistency review against applicable FROZEN specifications | `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` | This proposal; not in Governance v1 |
| Rule Index update in the same change set as the lifecycle change | `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` | Recommended by proposed `VECTOR_GOVERNANCE_V1_1.md` §9 item 6 (non-binding); Governance v1 does not mention `RULE_INDEX.md` |
| Disposition of direct references to v1.0 in dependent FROZEN specifications (`PERSISTENCE_PROVENANCE_V1.md` L137, `GAME_WIPE_MODEL_V1.md` L193, `FLEET_DATA_MODEL_V1.md` L207) | `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` | `docs/reviews/VERSIONING_V1_1_IMPACT_ASSESSMENT.md` §§2.1, 2.2, 2.5 |
| Marking v1.0 `SUPERSEDED` at freeze | `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` | Governance v1 §5.3 permits ("may") but does not require |
| Full-document atomic supersession; the substantive rules of §§2-15 | `V1_1_FUTURE_BINDING_RULE` | This document, binding only after governed freeze and effectiveness |

Items categorized `PROPOSAL_LOCAL_ACCEPTANCE_CRITERION` are recorded acceptance criteria for this proposal. They are not generally authoritative while this document is PROPOSED, do not amend FROZEN Governance, and impose no rules on other specifications. Each is evidenced in the process phase assigned in §16.2: readiness items before the promotion decision is requested or approved, transition actions within the approved change set, and verification evidence after the transition. They are one-time transition criteria and do not automatically become ongoing production rules after freeze. The authority to approve and promote remains with the then-binding Governance and the authorized approver; this document cannot make itself authoritative by declaring its own criteria complete, and satisfying readiness items does not by itself make the transition effective. Adopting a recommendation of the proposed `VECTOR_GOVERNANCE_V1_1.md` as a criterion here does not make that proposal authoritative. FROZEN Governance v1.0 does not mention `RULE_INDEX.md`, `Approved By` metadata or the role `project_owner`.

### 16.4 Required Rule Index transition

This governed freeze-transition change set updates `docs/RULE_INDEX.md` atomically: v1.1 is listed as `FROZEN`; v1.0 is listed as `SUPERSEDED` with v1.1 as its replacement; R3 is set to `RESOLVED`; and the dependent-specification references are updated (§16.5). These lifecycle changes become effective only upon successful governed merge to `main`. R2 remains `IN_PROGRESS` and is outside this transition scope.

### 16.5 Dependent specifications

The dependent-specification impact assessment is recorded in `docs/reviews/VERSIONING_V1_1_IMPACT_ASSESSMENT.md` (REVIEW_RECORD, non-normative). It assesses at least `PERSISTENCE_PROVENANCE_V1.md`, `GAME_WIPE_MODEL_V1.md`, `VECTOR_GOVERNANCE_V1.md` and `VECTOR_VERSIONING_V1.md`. This proposal does not silently amend any FROZEN specification. Any FROZEN specification found to require a successor is handled through its own governed successor path.

### 16.6 Predecessor-file treatment

The exact treatment of the predecessor file `VECTOR_VERSIONING_V1.md` (edit, move, annotate or leave in place) at the future freeze transition follows the then-binding Governance and the approved transition plan. This specification does not authorize editing or moving that file, marking v1.0 `SUPERSEDED`, marking v1.1 `FROZEN`, or changing R3 to resolved.
