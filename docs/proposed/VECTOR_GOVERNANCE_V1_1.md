# VECTOR Governance v1.1

**Status:** PROPOSED  
**Version:** 1.1  
**Authority Scope:** GLOBAL_GOVERNANCE  
**Approved By:** pending project_owner approval  
**Supersedes:** `VECTOR_GOVERNANCE_V1.md` v1.0 after approval and merge to `main`  
**Scope:** VECTOR project governance, source-of-truth rules, branch responsibilities, documentation lifecycle, rule authority, conflict resolution and change control

## 1. Purpose

This document defines the proposed successor governance baseline for VECTOR.

It preserves the approved governance model from VECTOR Governance v1.0 and adds deterministic authority and conflict-resolution rules for FROZEN specifications. The objective is to make rule interpretation reproducible for contributors, coding agents and future reviews without relying on document age, chat context or implicit assumptions.

Until this v1.1 proposal is approved and merged to `main`, `VECTOR_GOVERNANCE_V1.md` v1.0 remains the binding Production governance rule.

## 2. Source of Truth

GitHub is the primary technical source of truth for VECTOR.

The GitHub repository contains and versions:

- application source code;
- database migrations and SQL assets;
- deployment and automation workflows;
- technical configuration;
- architecture documentation;
- FROZEN rules;
- Architecture Decision Records;
- release metadata and versioning rules.

Operational systems retain their own authoritative runtime responsibilities:

- **GitHub:** code, architecture, governance, rules, workflows and release history;
- **Supabase:** operational authentication, database, RLS, RPCs and application data;
- **Vercel:** Preview and Production runtime deployments;
- **SCMDB Mirror / extracted SCMDB data:** primary external Star Citizen game-data source;
- **OneDrive:** backup, handover packages, exports and emergency fallback only.

OneDrive is not the primary source of truth for current code, architecture or FROZEN rules.

## 3. Branch Model

### 3.1 `main`

`main` represents the approved Production baseline.

Rules:

- Only reviewed and release-approved changes may enter `main`.
- Production deployments are created from `main`.
- FROZEN rules present in `main` are the currently approved Production rules.
- Direct development on `main` is prohibited except for an explicitly approved emergency procedure.

### 3.2 `develop`

`develop` represents the next integrated development state.

Rules:

- Normal implementation and documentation work targets `develop` or a feature branch based on `develop`.
- Vercel Preview deployments validate changes before release.
- Proposed successor rules may exist on `develop`, but they are not Production-approved until merged into `main`.

### 3.3 Release flow

The standard release path is:

```text
feature/change
-> develop
-> Vercel Preview
-> validation and release gate
-> pull request: develop -> main
-> Production deployment
```

A merge into `main` is the formal Production release boundary.

## 4. Documentation Structure

The repository documentation model includes at least:

```text
docs/
  frozen/
  proposed/
  adr/
  architecture/
  reviews/
  RULE_INDEX.md
```

### 4.1 `docs/frozen/`

Contains currently binding functional, security, UX, data, operational and release rules.

A FROZEN file is authoritative only within its declared Authority Scope and subject to applicable global invariants.

### 4.2 `docs/proposed/`

Contains candidate rules and successor specifications under review.

PROPOSED documents:

- may describe intended future behavior;
- may identify conflicts or migrations required before approval;
- are not Production-authoritative;
- never override a current FROZEN rule merely because they are newer or more detailed.

### 4.3 `docs/adr/`

Contains Architecture Decision Records for significant architectural decisions, including context, chosen option and consequences.

A significant architectural change to a FROZEN rule should have an ADR when the rationale or trade-off needs durable explanation beyond the normative rule itself.

### 4.4 `docs/architecture/`

Contains living technical documentation that may evolve with implementation.

Historical material may be retained below an explicit legacy/archive location and must be clearly marked non-binding.

### 4.5 `docs/reviews/`

Contains review and audit evidence.

Review records identify issues and remediation inputs but do not become normative policy merely by documenting a finding or recommendation.

### 4.6 `docs/RULE_INDEX.md`

`RULE_INDEX.md` is the canonical registry and navigation index for VECTOR specifications once the index itself is approved under this governance model.

The index records at minimum:

- specification name;
- lifecycle status;
- Authority Scope;
- successor/supersession relationship where applicable;
- known dependencies or freeze blockers where useful.

`RULE_INDEX.md` does not replace the normative contents of an individual FROZEN specification. If the index and an authoritative specification disagree about domain behavior, the discrepancy is a governance defect that must be corrected rather than silently interpreted.

## 5. Rule Lifecycle and Status Authority

A rule lifecycle state has explicit normative meaning.

### 5.1 `FROZEN`

- Approved current VECTOR rule.
- Binding within its declared Authority Scope.
- Subject to applicable global invariants.

### 5.2 `PROPOSED`

- Candidate or successor rule under review.
- Non-binding until approved and merged to `main` as FROZEN.
- Never silently overrides FROZEN behavior.

### 5.3 `PLANNED`

- Records that a normative specification is known to be required but is not yet available.
- Has no normative authority.
- Missing behavior must not be invented from the planned filename or title.

### 5.4 `SUPERSEDED`

- Historical normative rule replaced by an explicitly identified successor.
- Non-binding for the superseded scope.

### 5.5 `LEGACY_REFERENCE`

- Historical architecture, implementation or project reference.
- Non-binding.

### 5.6 `REVIEW_RECORD`

- Review/audit evidence.
- Non-binding.
- Findings remain remediation inputs until incorporated into current authoritative rules.

### 5.7 `RETIRED`

- Intentionally inactive rule/reference with no current normative authority.

`DRAFT` or `DEPRECATED` may still be used for working/historical material where needed, but neither state overrides a FROZEN specification.

## 6. Required FROZEN Metadata

New FROZEN specifications and materially revised successor specifications must declare at minimum:

```text
Status: FROZEN
Version: <version>
Authority Scope: <scope>
Approved By: project_owner
Supersedes: <identified document/version/section or none>
```

Existing FROZEN documents created before v1.1 remain valid. Their metadata may be normalized incrementally when they are next materially revised or when the Rule Index requires an explicit scope to remove ambiguity.

Metadata is intended to make authority deterministic, not to create unnecessary administrative overhead.

Git history and the applicable approval/release pull request provide the durable change record.

## 7. Deterministic FROZEN Rule Authority

VECTOR resolves rule authority explicitly.

Document age, Git commit order, merge order, modification timestamp, filename sorting and version-number size do not independently establish precedence between FROZEN rules.

When multiple rules appear applicable, use the following decision sequence.

### 7.1 Explicit supersession

A FROZEN specification may explicitly supersede another identified specification, version or section.

Supersession must identify:

- what is replaced; and
- the scope in which the replacement applies.

Explicit supersession has precedence within that declared scope.

A blanket assumption that a newer document replaces an older document is prohibited unless the supersession is explicit.

### 7.2 Declared Authority Scope

Every FROZEN specification has, explicitly or through the Rule Index during migration, an Authority Scope.

A domain-specific FROZEN specification is authoritative for behavior inside that domain, subject to applicable global invariants.

Example scopes include:

```text
GLOBAL_GOVERNANCE
VERSIONING
DATASET
INVENTORY
FLEET
PERSISTENCE_PROVENANCE
GAME_WIPE
ROLLBACK
AUTH
SECURITY
DATABASE_MIGRATION
```

The scope taxonomy may evolve through governance. A rule does not gain authority outside its declared scope merely because it mentions another domain.

### 7.3 Global invariants

A rule explicitly designated as a global invariant constrains every included domain.

Examples may include:

- No-Guess behavior;
- fail-closed security behavior;
- provenance preservation;
- LIVE/PTU dataset isolation;
- security and authorization boundaries.

A global invariant does not automatically replace a more specific domain rule. It constrains the set of implementations that the domain rule may permit.

If the two can operate together, both apply.

### 7.4 Status authority

Status provides an additional hard boundary:

```text
FROZEN        -> binding within scope
PROPOSED      -> design input only
PLANNED       -> no normative authority
SUPERSEDED    -> non-binding in superseded scope
LEGACY_REFERENCE -> historical only
REVIEW_RECORD -> evidence only
RETIRED       -> inactive
```

A lower-authority status cannot override a conflicting FROZEN rule.

## 8. `FROZEN_CONFLICT` and Fail-Closed Resolution

If two simultaneously applicable FROZEN rules require incompatible behavior and the conflict cannot be resolved through:

1. explicit supersession;
2. declared Authority Scope; or
3. an applicable global invariant;

VECTOR must not guess which FROZEN rule was intended to win.

The condition is classified as:

```text
FROZEN_CONFLICT
```

The affected implementation, migration, release or architectural decision is:

```text
BLOCKED
```

until the conflict is explicitly resolved through VECTOR governance.

### 8.1 Allowed conflict-resolution mechanisms

A `FROZEN_CONFLICT` may be resolved by:

- clarifying the Authority Scope of one or more rules;
- explicitly superseding a rule, version or section;
- issuing a reviewed successor version of an affected rule;
- defining the intended interaction in a new approved FROZEN specification;
- introducing or clarifying a global invariant when the invariant itself is the missing authority boundary.

The resolution must be reflected in `RULE_INDEX.md` and the affected normative specification(s).

### 8.2 Prohibited implicit precedence

The following must not independently decide rule precedence:

- newest Git commit;
- latest merge;
- newest modification timestamp;
- larger version number;
- filename sorting;
- physical position inside `docs/frozen/`;
- whichever rule an implementation or coding agent read first;
- whichever interpretation is easier to implement;
- undocumented chat context.

### 8.3 Unknown authority is not permission

When rule authority cannot be determined deterministically:

```text
FROZEN_CONFLICT -> BLOCKED
```

This is the governance-level application of VECTOR's fail-closed / No-Guess philosophy.

## 9. FROZEN Rule Change Lifecycle

A FROZEN rule must not be silently overwritten.

A material change requires:

1. a successor rule version or clearly versioned amendment proposal;
2. a documented rationale;
3. impact analysis for affected FROZEN rules, implementations and migrations;
4. review on `develop`;
5. explicit supersession metadata where existing authority is replaced;
6. update of `RULE_INDEX.md` in the same change set;
7. required validation/release gates;
8. merge through the normal release process into `main`.

Until the successor reaches `main` as FROZEN, the current FROZEN Production rule remains authoritative.

Significant architectural changes also require an ADR where the architectural rationale should remain independently traceable.

## 10. Change Traceability

Every rule or architecture change must be traceable through Git commits and, where appropriate, pull requests.

A change should identify:

- affected rule or architecture document;
- reason for the change;
- consequences and migration impact;
- related implementation changes;
- replacement/supersession relationship where applicable;
- Rule Index update when lifecycle state, scope or dependency information changes.

No important VECTOR rule should exist only in chat history, a local note or an isolated OneDrive file.

## 11. Deployment Governance

The approved environment mapping remains:

```text
GitHub default branch: develop
Vercel Preview:        develop and other non-production branches
Vercel Production:     main
GitHub Pages:          Production gateway only
```

The legacy GitHub Pages URL must only direct users to the current VECTOR Production endpoint associated with `main`. It must not expose or redirect to `develop`, PTU-only previews or immutable Vercel Preview deployment URLs.

## 12. Release Gates

Before merging `develop` into `main`, the applicable release gate must confirm:

- build success;
- Preview deployment availability where runtime behavior is affected;
- required route and runtime smoke tests;
- security-sensitive flow checks where applicable;
- review of changed files and commits;
- absence of unresolved merge conflicts;
- absence of unresolved applicable `FROZEN_CONFLICT` conditions;
- successful required checks;
- correct version and dataset metadata where applicable.

A green build without a successful runtime test is not sufficient when runtime behavior is affected.

Documentation/rule-only changes still require rule-authority and conflict review even when no runtime test is applicable.

## 13. File and Commit Rule

For every VECTOR file that must be added or changed, implementation guidance should include a suitable Git commit message.

Rule/governance commits should make lifecycle intent explicit where useful, for example:

```text
docs(proposed): add VECTOR governance v1.1 successor proposal
docs(frozen): approve VECTOR governance v1.1
docs(legacy): archive superseded governance reference
```

## 14. Governance Principles

VECTOR governance follows these principles:

- do not guess uncertain data or rule authority;
- fail closed on unresolved authoritative conflicts;
- separate Production truth from development work;
- preserve history instead of silently replacing decisions;
- make supersession explicit;
- keep code and governing rules together;
- keep the Rule Index aligned with lifecycle changes;
- validate in Preview before Production when runtime behavior is affected;
- prefer reproducible, reviewable and automated processes;
- keep operational secrets and credentials outside the repository.

## 15. R1 Remediation Decision

This v1.1 proposal addresses Rule Set Review finding R1 by defining:

- deterministic FROZEN precedence mechanisms;
- explicit Authority Scope;
- explicit supersession semantics;
- global-invariant interaction;
- hard status boundaries;
- `FROZEN_CONFLICT`;
- fail-closed `BLOCKED` behavior;
- prohibited implicit precedence based on recency or repository ordering.

R1 may be marked `RESOLVED` only after:

- this governance successor is approved and merged to `main` as FROZEN;
- `RULE_INDEX.md` is reconciled with the actual repository and approved as the canonical rule registry;
- applicable FROZEN specifications have sufficient Authority Scope/supersession information to resolve known conflicts without guessing.

## 16. Proposed Decision

VECTOR Governance v1.1 is **PROPOSED**.

Approval requires:

- project-owner review;
- consistency review against the current FROZEN rule set;
- reconciliation with `RULE_INDEX.md`;
- review on `develop`;
- merge through the normal release process into `main`.

After approval, v1.1 supersedes `VECTOR_GOVERNANCE_V1.md` v1.0 as the authoritative VECTOR governance specification.
