# VECTOR Rule Index

**Status:** PROPOSED  
**Version:** 1.0  
**Purpose:** Canonical registry and navigation index for VECTOR rules, specifications, architecture decisions, proposals and retired references.

## 1. Purpose

This index answers four questions for contributors and coding agents:

1. Which VECTOR rule documents exist or are planned?
2. Which documents are authoritative?
3. Which domain does each document govern?
4. What happens when rules appear to conflict?

This index does not duplicate domain rules. Normative behavior remains in the referenced specification.

## 2. Status model

| Status | Meaning | Authority |
|---|---|---|
| `FROZEN` | Approved current VECTOR rule | Binding within declared authority scope |
| `PROPOSED` | Review candidate | Non-binding until approved and frozen |
| `PLANNED` | Known required specification not yet present | No normative authority; unresolved behavior must not be invented |
| `SUPERSEDED` | Replaced by an explicit successor | Non-binding; successor is authoritative |
| `LEGACY_REFERENCE` | Historical architecture/project reference | Non-binding |
| `REVIEW_RECORD` | Historical audit/review evidence | Non-binding |
| `RETIRED` | Intentionally removed without active successor requirement | Non-binding |

## 3. Deterministic authority and conflict rule

Document recency, Git commit order, merge order, filename numbering or modification date do **not** implicitly override a FROZEN rule.

Use the following decision sequence:

1. **Explicit supersession wins.** A current FROZEN rule that explicitly supersedes another identified document/version/section is authoritative for that declared scope.
2. **Declared authority scope applies.** A domain-specific FROZEN rule governs behavior inside its declared domain unless a higher-level invariant explicitly states that it constrains that domain.
3. **Global invariants constrain domains.** Governance, security, provenance, no-guess, dataset-isolation and other explicitly global invariants apply across domains where their scope says so.
4. **PROPOSED never overrides FROZEN.** A proposal may identify a required future change but cannot silently change Production authority.
5. **LEGACY and REVIEW records never override current rules.**
6. **Unresolved FROZEN conflict fails closed.** If two applicable FROZEN rules still require incompatible behavior and neither has explicit precedence/supersession for the conflict, classify it as `FROZEN_CONFLICT`, block the affected decision/implementation and resolve it through VECTOR governance before proceeding.

Never use “newer rule wins” as an implicit conflict-resolution mechanism.

## 4. Required metadata for FROZEN specifications

New or materially revised FROZEN specifications should declare at minimum:

```text
Status: FROZEN
Version: <version>
Authority Scope: <domain or global invariant>
Approved By: project_owner
Supersedes: <document/version/section or none>
```

Git history and the approval PR provide the durable change record. Additional metadata may be added when useful but is not required merely for process overhead.

## 5. Current FROZEN registry

The following registry reflects the current known VECTOR rule set and must be reconciled against the repository whenever files are added, renamed, frozen, superseded or retired.

| Specification | Authority scope | Status | Notes / dependencies |
|---|---|---|---|
| `VECTOR_GOVERNANCE_V1.md` | Global governance, rule lifecycle, repository/release authority | `FROZEN` | Current Production authority; proposed successor: `VECTOR_GOVERNANCE_V1_1.md` |
| `VECTOR_VERSIONING_V1.md` | VECTOR version, SC build and dataset versioning/isolation | `FROZEN` | Current and sole binding VERSIONING authority; PTU Preview boundary remains unresolved pending governed promotion of proposed `VECTOR_VERSIONING_V1_1.md` |
| `INVENTORY_UX_V1.md` | Personal Inventory UX and interaction behavior | `FROZEN` | Uses current location, keyboard and dataset-context invariants |
| `FLEET_DATA_MODEL_V1.md` | User ship identity, ownership and fleet data semantics | `FROZEN` | Fleet planning remains separately specified/planned |
| `PERSISTENCE_PROVENANCE_V1.md` | Persistence classes, provenance and game-state history | `FROZEN` | Requires alignment with proposed Data Context Model before that proposal can freeze |
| `GAME_WIPE_MODEL_V1.md` | Star Citizen game-wipe planning/execution semantics | `FROZEN` | LIVE dataset trigger and Production User State target must remain distinct |
| `PLATFORM_CRITICAL_ACTIONS_V1.md` | Platform-destructive/critical administrative actions | `FROZEN` | Separate from ordinary game wipes |
| `ROLLBACK_POLICY_V1.md` | Application, database and dataset rollback/recovery | `FROZEN` | Dataset rollback does not imply game-state recovery |

## 6. Current PROPOSED registry

| Specification | Intended authority scope | Status | Freeze blockers / next action |
|---|---|---|---|
| `VECTOR_GOVERNANCE_V1_1.md` | Global governance, lifecycle, rule authority and FROZEN conflict resolution | `PROPOSED` | Successor to `VECTOR_GOVERNANCE_V1.md` v1.0; required to resolve R1 |
| `DATA_CONTEXT_MODEL_V1.md` | Build classification, LIVE/PTU dataset contexts, Production User State, PTU Preview, epochs | `PROPOSED` | Not a prerequisite for promoting `VECTOR_VERSIONING_V1_1.md`; must be reconciled with the then-FROZEN v1.1 and applicable FROZEN specifications before its own freeze; proposals do not resolve R3 |
| `DATASET_PIPELINE_V1.md` | `DATASET_PIPELINE` | `PROPOSED` | N2 category semantics and N4 identity namespace are reconciled at proposal level; align mutable-state boundaries with applicable FROZEN rules before freeze |
| `CANONICAL_DATA_MODEL_V1.md` | `CANONICAL_DATA_MODEL` | `PROPOSED` | N2 category semantics and N4 identity namespace are reconciled at proposal level; complete remaining cross-spec alignment before freeze |
| `VECTOR_VERSIONING_V1_1.md` | `VERSIONING` | `PROPOSED` | Full-document successor proposal to v1.0; supersession NOT EFFECTIVE until approval, freeze-transition evidence, simultaneous Rule Index transition and governed promotion to `main` as FROZEN. A PROPOSED file on `main` never supersedes v1.0. R3 remains open. See `reviews/VERSIONING_V1_1_IMPACT_ASSESSMENT.md` |
| `MIGRATION_TEST_CONTRACT_V1.md` | Database migration risk, tests, gates and evidence | `PROPOSED` | Reconcile staging requirement with README; bind paths to actual repository layout |
| `STAT_RESOLVER_POLICY_V1.md` | Stat resolver verification, transformations and productive eligibility | `PROPOSED` | Finalize verification/status model and canonical runtime mapping/gate |

## 7. PLANNED normative specifications

A `PLANNED` entry records that the domain is known but the referenced normative document is not yet available. A planned document must not be cited as though it already supplied binding rules.

| Planned specification | Intended authority scope | Interim handling |
|---|---|---|
| `AUTH_V1_1.md` | Direct password auth, social login, provider linking and auth safety | Use only auth rules already present in existing FROZEN specifications; unresolved details remain deferred/blocked |
| `LOCATION_RULES_V1.md` | Canonical locations, persistent `Unbekannt`, manual selectable locations, reconciliation | Existing explicit FROZEN references remain binding within their current documents; consolidate into this specification later |
| `FLEET_PLANNING_V1.md` | Draft/Published/Active fleet plans and official requirements | Do not treat historical/legacy planning documents as current normative authority |
| `PROVIDER_AUTHORITY_V1.md` | Provider direction, authority, capabilities, observations/mutations | Derive only after modern provider ADR/Data Context reconciliation |
| `GAME_IDENTITY_V1.md` | Citizen ID/RSI game identity lifecycle and reconciliation | Legacy identity flows are reference only until modern specification is approved |
| `DATABASE_MIGRATION_SAFETY_V1.md` | Backup/restore and Production migration safety | Coordinate with `MIGRATION_TEST_CONTRACT_V1.md`; avoid duplicate/conflicting rule homes |
| `RELEASE_POLICY_V1.md` | Release artifact integrity and Production promotion | Use current Governance/Versioning rules until dedicated policy is approved |

## 8. Global invariants registry

Global invariants are cross-domain constraints. Their authoritative definition must be discoverable in a FROZEN specification rather than assumed from repetition alone.

| Invariant | Current authority | Scope |
|---|---|---|
| FROZEN governance / Production authority | `VECTOR_GOVERNANCE_V1.md` | Global |
| LIVE/PTU dataset isolation | `VECTOR_VERSIONING_V1.md` | All dataset-derived values and calculations |
| Provenance preservation | `PERSISTENCE_PROVENANCE_V1.md` | Imported/derived/user-state provenance as applicable |
| No-guess behavior | Distributed across current FROZEN rules; consolidation planned | Missing/uncertain source, location, identity, resolver and channel decisions |
| Critical-action fail-closed behavior | `PLATFORM_CRITICAL_ACTIONS_V1.md` | Platform-critical destructive actions |
| Rollback fail-closed behavior | `ROLLBACK_POLICY_V1.md` | Application/database/dataset recovery |

Until No-Guess has one canonical normative home, this index records it as a global invariant only where an existing FROZEN specification explicitly states the applicable no-guess rule. The index does not create new domain behavior by itself.

## 9. Explicit LIVE/PTU review marker

The current unresolved review point is not whether LIVE and PTU datasets may mix. They may not.

The proposed versioning successor defines a typed combination for the future rule:

```text
PTU Dataset Context (all channel-dependent reference/calculation inputs)
+ read-only Production User State Snapshot (selection/input only)
= PTU Preview result (visible label PTU_PREVIEW)
```

A PTU Preview never mixes LIVE reference data into the PTU calculation, never mutates Production User State, never asserts PTU-native state, and never treats Production ownership as PTU ownership, inventory, wallet or reputation. Provenance of both the PTU dataset revision and the Production User State snapshot must be preserved.

The complete normative boundary is defined only in `VECTOR_VERSIONING_V1_1.md` (PROPOSED); `DATA_CONTEXT_MODEL_V1.md` describes the v1 state model. Neither proposal overrides FROZEN v1.0. `VECTOR_VERSIONING_V1_1.md` is a full-document successor; supersession becomes effective only after documented `project_owner` approval, freeze-transition evidence, a simultaneous Rule Index transition and governed promotion to `main` as FROZEN. R3 remains open until then. Dependent-specification impact is recorded in `reviews/VERSIONING_V1_1_IMPACT_ASSESSMENT.md`.

## 10. Historical and review records

Historical documents remain useful evidence but have no current normative authority unless a current FROZEN specification explicitly incorporates a rule.

Key locations:

```text
docs/architecture/legacy/
docs/reviews/archive/
```

`RULE_SET_REVIEW_2026-10-29.md` is a `REVIEW_RECORD`, not a policy. Its findings are remediation inputs and remain historically unchanged after remediation.

| Review record | Status | Authority Scope | Authority |
|---|---|---|---|
| `SCMDB_SCHEMA_CATALOG_PROFILE_V1.md` | `REVIEW_RECORD` | None (no Authority Scope) | Explicitly non-normative evidence only |
| `archive/RULE_SET_REVIEW_2026-10-29.md` | `REVIEW_RECORD` | None (no Authority Scope) | Explicitly non-normative historical findings |
| `VERSIONING_V1_1_IMPACT_ASSESSMENT.md` | `REVIEW_RECORD` | None (no Authority Scope) | Explicitly non-normative impact assessment and freeze-blocker record for proposed `VECTOR_VERSIONING_V1_1.md` |

## 11. Rule maintenance requirements

Update this index in the same change whenever a rule is:

- newly created as FROZEN/PROPOSED/PLANNED;
- promoted from PROPOSED to FROZEN;
- explicitly superseded;
- renamed or moved;
- retired;
- given a new authority scope that changes conflict resolution.

A reference to a specification that does not yet exist must be registered here as `PLANNED` or removed/replaced with the currently binding authority.

## 12. Contributor / agent usage

Before changing VECTOR behavior:

1. Find the affected domain in this index.
2. Read every applicable FROZEN specification for that domain plus applicable global invariants.
3. Treat PROPOSED documents as design input only.
4. Treat LEGACY_REFERENCE and REVIEW_RECORD documents as historical evidence only.
5. If an applicable FROZEN conflict cannot be resolved by explicit supersession and scope, stop with `FROZEN_CONFLICT` instead of guessing.
6. Follow the applicable validation/release gates before Production.

A concise repository-root `AGENTS.md` should later point contributors and coding agents to this index rather than duplicating the full rule set.

## 13. Known remediation queue from review 2026-10-29

| Finding | Status | Remediation home |
|---|---|---|
| R1 deterministic FROZEN precedence | `IN_PROGRESS` | `RULE_INDEX.md` + `VECTOR_GOVERNANCE_V1_1.md`; resolved only after approval/freeze |
| R2 absent referenced policies | `IN_PROGRESS` | `RULE_INDEX.md` planned registry + later dedicated specs |
| R3 LIVE/PTU preview boundary | `OPEN` | `VECTOR_VERSIONING_V1_1.md` full-document successor proposal; its governed promotion as FROZEN on `main` is the incorporation event for the boundary. `DATA_CONTEXT_MODEL_V1.md` follows and must be reconciled with the then-FROZEN v1.1 before its own freeze. R3 becomes `RESOLVED` only within the freeze-transition change set that promotes v1.1, updates this index in the same change set and records approval and transition evidence; it remains `OPEN` until then |
| R4 migration gates and paths | `OPEN` | `MIGRATION_TEST_CONTRACT_V1.md` + README/repository layout |
| R5 freeze lifecycle / ADR location | `OPEN` | `VECTOR_GOVERNANCE_V1.md` |
| R6 contributor/agent entry point | `OPEN` | repository-root `AGENTS.md` |

## 14. Status decision

`RULE_INDEX.md` is **PROPOSED** until:

- the current repository inventory is reconciled;
- FROZEN Authority Scopes are sufficiently defined;
- `VECTOR_GOVERNANCE_V1_1.md` is approved and FROZEN;
- the governance successor establishes this registry/conflict model as authoritative.

Until then, `VECTOR_GOVERNANCE_V1.md` v1.0 remains the current Production governance authority.

Once approved, the index should remain a canonical registry/navigation document while domain behavior continues to live in the individual FROZEN specifications.
