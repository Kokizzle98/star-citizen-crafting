# VECTOR Versioning v1.1 - Impact Assessment and Finding Closure

- **Status:** REVIEW RECORD
- **Authority Scope:** none (non-normative evidence only)
- **Subject:** `docs/proposed/VECTOR_VERSIONING_V1_1.md` (PROPOSED), successor to `docs/frozen/VECTOR_VERSIONING_V1.md` v1.0 (FROZEN)
- **Baseline reviewed:** `develop` at `c768aa6` (merge of PR #8) plus the remediation change set that adds this record
- **Mutation of FROZEN files:** none
- **Effect on R2 / R3:** none. R2 stays `IN_PROGRESS`; R3 stays `OPEN`

This record is evidence only. It does not supersede, approve or freeze anything. `VECTOR_VERSIONING_V1.md` v1.0 remains the sole binding VERSIONING authority.

## 1. Classification method

Each dependent FROZEN specification receives exactly one classification:

| Value | Applied when |
|---|---|
| `NO_SUCCESSOR_CHANGE_REQUIRED` | No binding rule is contradicted and no Rule Index/reference change is needed because of v1.1 |
| `SUCCESSOR_PROPOSAL_REQUIRED_BEFORE_FREEZE` | A binding MUST / must-not in the FROZEN text is contradicted or made unsatisfiable by v1.1 |
| `RULE_INDEX_OR_REFERENCE_UPDATE_REQUIRED_AT_FREEZE` | The text is compatible, but the Rule Index or cross-references must change at the freeze transition |

If `SUCCESSOR_PROPOSAL_REQUIRED_BEFORE_FREEZE` were returned for any specification, it would be a freeze blocker, v1.1 would stay `PROPOSED` and `FREEZE_BLOCKED`, and the successor would be a separate governed task. No FROZEN file is edited by this task.

## 2. Dependent-specification classification

| Specification | Classification |
|---|---|
| `PERSISTENCE_PROVENANCE_V1.md` | `RULE_INDEX_OR_REFERENCE_UPDATE_REQUIRED_AT_FREEZE` |
| `GAME_WIPE_MODEL_V1.md` | `RULE_INDEX_OR_REFERENCE_UPDATE_REQUIRED_AT_FREEZE` |
| `FLEET_DATA_MODEL_V1.md` | `RULE_INDEX_OR_REFERENCE_UPDATE_REQUIRED_AT_FREEZE` |
| `VECTOR_GOVERNANCE_V1.md` | `NO_SUCCESSOR_CHANGE_REQUIRED` |
| `VECTOR_VERSIONING_V1.md` | `RULE_INDEX_OR_REFERENCE_UPDATE_REQUIRED_AT_FREEZE` |

No specification is classified `SUCCESSOR_PROPOSAL_REQUIRED_BEFORE_FREEZE`; no successor-driven freeze blocker arises from this assessment.

### 2.1 `PERSISTENCE_PROVENANCE_V1.md` - reference update at freeze

Evidence:

- §7 (L150-159) requires dataset-dependent interpretation to use exactly one active channel and forbids cross-channel fallback. v1.1 §6.7 and §8.3 preserve this; the snapshot is a separately typed user-state input, not dataset interpretation.
- §8 (L161+) lists source provenance "where applicable" and states that "equivalent provenance must remain available". v1.1 §5 and §7.5 add result-level provenance without removing any item.
- §15 (L287-297) requires derived results to be associable with the active dataset/channel, build/dataset revision, engine version and source entities/input state. v1.1 §7.5 satisfies and extends this (`dataset_revision_id`, `sc_build`, `resolver_version`, `user_state_snapshot_id`, `canonical_entity_mappings[]`).
- §6.2 (L139-148) describes an epoch as "a persistent state period for a channel" and says records "may reference" it. This does not require PTU-native epochs, so it is not contradicted by a Production-only v1 mutable state (`PRODUCTION_USER_STATE`).
- §21.6 (L364) "LIVE and PTU provenance never cross-fallback" is preserved.

Why not "no change": the Rule Index row for this specification already notes that it "requires alignment with proposed Data Context Model". At freeze the Rule Index/reference notes must record how its "channel" epoch wording and provenance expectations relate to the typed contexts. In addition, §6.1 (L137) names `VECTOR_VERSIONING_V1.md` directly ("The canonical VECTOR release identifier follows `VECTOR_VERSIONING_V1.md`…"); that direct reference is part of the freeze-time reference update already required by this classification. No binding rule is contradicted.

### 2.2 `GAME_WIPE_MODEL_V1.md` - reference update at freeze

Evidence:

- §10 (L185-193): LIVE/PTU are never mixed, missing values do not fall back across channels, completeness precedes build-derived defaults. All preserved by v1.1 §8.3 and §9.
- §9 (L173-183): "there *may* be a current epoch per *supported* game-state channel/context according to the persistence architecture" is permissive. Production-only v1 mutable state is a supported configuration.
- A PTU Preview is read-only and not a wipe target (v1.1 §7.2.3, §7.6); this is consistent with the FROZEN dry-run and wipe-target semantics.

Why not "no change": §10 (L193) names `VECTOR_VERSIONING_V1.md` directly ("according to `VECTOR_VERSIONING_V1.md`"). Because v1.1 is a full-document successor, that version-specific reference needs a binding disposition when supersession becomes effective. No binding rule is contradicted.

Required freeze-time disposition (recorded now, not applied now): at the freeze transition, the direct reference in `docs/frozen/GAME_WIPE_MODEL_V1.md` §10 (L193) must be explicitly dispositioned by one of the following governed freeze mechanisms, selected and justified in the freeze-transition change set under the then-binding Governance:

1. controlled update of the direct reference to the newly effective authority;
2. explicitly justified retention of the old version-specific reference; or
3. another binding supersession mechanism that resolves the reference unambiguously.

This change set records the requirement only. It does not select or execute any of these actions and does not modify `GAME_WIPE_MODEL_V1.md` or any other `docs/frozen/*` file. The action is applied only when v1.1 is actually frozen and supersession is activated.

### 2.3 `VECTOR_GOVERNANCE_V1.md` - no successor change

Evidence: §5.1-§5.6 (L129-140), §6 (L150+), §8 (L177+) and §11 (L214-223) are sufficient to govern this successor. v1.1 §16 only applies them.

Observation (not a change request): §5.6 states that a proposed rule becomes Production-authoritative "only after merge into `main`", without saying "as FROZEN". Read with §3.1 ("FROZEN rules present in `main`") and §5 ("A FROZEN rule is binding after approval") this requires approval and FROZEN status. v1.1 §16 states the stricter reading explicitly. Clarification of this wording belongs to the separately tracked `VECTOR_GOVERNANCE_V1_1.md` (R1/R5), not to this task.

### 2.4 `VECTOR_VERSIONING_V1.md` - reference update at freeze

v1.1 is a full-document successor. No edit to `VECTOR_VERSIONING_V1.md` occurs now. At a future governed freeze transition the Rule Index must record v1.0 as `SUPERSEDED` with v1.1 as its replacement; the treatment of the predecessor file follows the then-binding Governance and the approved transition plan (v1.1 §16.6).

### 2.5 `FLEET_DATA_MODEL_V1.md` - reference update at freeze

Evidence:

- §12 (L202-205) requires dataset-derived fleet information to use the active dataset channel with strict LIVE/PTU isolation and no cross-channel fallback. v1.1 §6.7 and §8.3 preserve this.
- §12 (L209) states that changing the dataset channel does not create a second owned ship. This is consistent with v1.1 §6.3 (`PRODUCTION_USER_STATE` is not created, copied or replaced by a dataset switch).
- §19 invariant 8 (L272) forbids mixing LIVE and PTU data in one derived fleet calculation. A `PRODUCTION_USER_STATE_SNAPSHOT` is user-state input, not LIVE reference data (v1.1 §6.7, §8.3(8)), so no rule is contradicted.
- Fleet loadout and ownership domains remain `PRODUCTION_USER_STATE`; a PTU Preview never mutates them (v1.1 §7.2.3).

Why not "no change": §12 (L207) names VECTOR Versioning v1 directly ("according to VECTOR Versioning v1"). Because v1.1 is a full-document successor, that version-specific reference needs a binding disposition when supersession becomes effective. No binding rule is contradicted.

Required freeze-time disposition (recorded now, not applied now): at the freeze transition, the direct reference in `docs/frozen/FLEET_DATA_MODEL_V1.md` §12 (L207) must be explicitly dispositioned by one of the following governed freeze mechanisms, selected and justified in the freeze-transition change set under the then-binding Governance:

1. controlled update of the direct reference to the newly effective authority;
2. explicitly justified retention of the old version-specific reference; or
3. another binding supersession mechanism that resolves the reference unambiguously.

This change set records the requirement only. It does not select or execute any of these actions and does not modify `FLEET_DATA_MODEL_V1.md` or any other `docs/frozen/*` file. The action is applied only when v1.1 is actually frozen and supersession is activated.

## 3. Open freeze dependencies (not successor classifications)

These are not defects of the classifications above; they must be handled in the governed freeze process.

| # | Dependency | Handling |
|---|---|---|
| D1 | v1.1 §7.3 references `CANONICAL_DATA_MODEL_V1.md` (PROPOSED) for canonical identity/mapping, and the typed vocabulary is mirrored in proposed `DATA_CONTEXT_MODEL_V1.md` | A PROPOSED document is not Production-authoritative. The freeze review must either sequence the freeze after the referenced canonical authority is FROZEN or explicitly decide the reference treatment |
| D2 | project_owner approval and freeze-transition evidence (v1.1 §16.2) | Future governed task |
| D3 | Rule Index transition at freeze (v1.1 §16.4) | Future change set, same as D2 |

## 4. Finding closure matrix (F1-F14)

| Finding | Closure in change set | Status |
|---|---|---|
| F1 Supersession header | v1.1 header; §1; §16.1-16.2 require approval, freeze evidence, governed promotion as FROZEN, simultaneous Rule Index transition, v1.0 `SUPERSEDED`; a PROPOSED file on `main` never supersedes | Addressed |
| F2 Full vs partial | Full-document successor (header, §1, §16.1.3); "sections 6.3 and 13 only" removed; all v1.0 rules carried forward | Addressed |
| F3 Approval evidence | Header placeholders; §16.2-16.3 distinguish GOV-V1 binding rules from GOV-V1.1 recommendations | Addressed (evidence itself deferred) |
| F4 Required metadata | §5 restores "Required metadata" with the verbatim v1.0 list | Addressed |
| F5 Isolation scope | §6.7 documents the intentional clarification; snapshot defined as cross-context user-state provenance | Addressed |
| F6 Retained material | §§2-5, 8-15 carry forward v1.0 §§2-13 incl. examples and the material-amendment clause (see §5 table) | Addressed |
| F7 Snapshot | §6.3-6.4: `PRODUCTION_USER_STATE` vs immutable `PRODUCTION_USER_STATE_SNAPSHOT` with id, capture time/revision, source, consistency boundary | Addressed |
| F8 Terminology | Canonical vocabulary in v1.1 §6; mirrored in `DATA_CONTEXT_MODEL_V1.md` §4.1; `PTU_PREVIEW` retained only as `evaluation_type` value and visible label; CDM/Pipeline contexts sentence aligned. Document languages unchanged | Addressed |
| F9 "Production" | v1.1 §6.1 qualified terms; DCM §4.1 note | Addressed |
| F10 Result provenance | v1.1 §7.5 field set, reproducibility boundary, non-persisted envelope | Addressed |
| F11 Entity mapping | v1.1 §7.3 fail-closed mapping referencing `CANONICAL_DATA_MODEL_V1.md`; no identity rules redefined | Addressed |
| F12 Rule Index shorthand | `RULE_INDEX.md` §9 and rows replaced; concise, points to v1.1 | Addressed |
| F13 Dependent specs | §2 of this record | Addressed |
| F14 Mutable-state channel wording | `CANONICAL_DATA_MODEL_V1.md` index-key line clarified; architecture unchanged | Addressed |

## 5. v1.0 to v1.1 traceability

| v1.0 | v1.1 | Relation |
|---|---|---|
| §1 Purpose | §1 | Clarified (successor/authority) |
| §2 Canonical identifier | §2 | Verbatim |
| §3 Application version (3.1-3.3) | §3 | Verbatim incl. examples |
| §4 Independent axes (4.1-4.3) | §4 | Verbatim incl. examples |
| §5 Dataset revision/provenance, Required metadata | §5 | Verbatim; adds revision definition and pointer to §7.5 |
| §6.1 LIVE, §6.2 PTU | §8.1, §8.2 | Verbatim; adds LIVE-baseline qualifier and PTU Preview sentence |
| §6.3 Strict isolation (1-7) | §8.3 (1-7) and §6.7 | Carried forward; "calculation inputs" refined to "channel-dependent calculation inputs" in rule 1 and clarified by §6.7; rule 5 "exactly one active Dataset Context"; rule 8 added |
| §7 Completeness Filter (1-6, statuses) | §9 | Verbatim; adds No-Guess scope and `REVIEW_REQUIRED` |
| §8 UI presentation | §10 | Verbatim; adds `Environment` meaning and `PTU_PREVIEW` label rule |
| §9 Dev/Production labels | §11 | Verbatim; "Production deployments" qualifier |
| §10 Dataset activation | §12 | Verbatim |
| §11 Release/data update | §13 | Verbatim |
| §12 README MAJOR rule (1-6) | §14 | Verbatim |
| §13 Frozen decision | §15 | Carried forward incl. "any material amendment requires a successor version"; adds typed-context decisions |
| (none) | §6, §7, §16 | New: typed contexts, PTU Preview boundary, supersession lifecycle |

## 6. Deferred after this change set

- project_owner approval, freeze-transition change set, `SUPERSEDED` marking of v1.0, R3 closure and predecessor-file treatment (v1.1 §16).
- Resolution of D1 (canonical authority is still PROPOSED).
- Freeze-time Rule Index/reference updates for `PERSISTENCE_PROVENANCE_V1.md`, `GAME_WIPE_MODEL_V1.md` (including the mandatory L193 disposition in §2.2), `FLEET_DATA_MODEL_V1.md` (including the mandatory L207 disposition in §2.5) and `VECTOR_VERSIONING_V1.md`.
- Approval of `VECTOR_GOVERNANCE_V1_1.md` (R1) and its formalization of approval-evidence rules.
- Code implementation of snapshot/provenance storage and the visible `PTU_PREVIEW` label.
- Intentional: the German `DATA_CONTEXT_MODEL_V1.md` and the English v1.1 retain their own languages.
