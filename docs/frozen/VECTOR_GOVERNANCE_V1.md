# VECTOR Governance v1

**Status:** FROZEN  
**Version:** 1.0  
**Frozen on:** 2026-10-28  
**Scope:** VECTOR project governance, source-of-truth rules, branch responsibilities, documentation lifecycle and change control

## 1. Purpose

This document defines the binding governance baseline for VECTOR. It establishes where authoritative project information is stored, how development and production states are separated, how FROZEN rules are maintained, and how architectural changes remain traceable.

## 2. Source of Truth

GitHub is the primary technical source of truth for VECTOR.

The GitHub repository contains and versions:

- application source code;
- database migrations and SQL assets;
- deployment and automation workflows;
- technical configuration;
- architecture documentation;
- FROZEN rules;
- architecture decision records;
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

A merge into `main` is the formal release boundary.

## 4. Documentation Structure

The repository should use the following structure:

```text
docs/
  frozen/
  adr/
  architecture/
```

### 4.1 `docs/frozen/`

Contains the currently binding functional, security, UX, data and release rules.

Recommended file naming:

```text
AUTH_V1_1.md
VERSIONING_V1.md
DATASET_PIPELINE_V1.md
LOCATION_RULES_V1.md
INVENTORY_UX_V1.md
KEYBOARD_UX_V1.md
FLEET_MANAGER_V1.md
TRADING_CENTER_V1.md
```

### 4.2 `docs/adr/`

Contains Architecture Decision Records for significant decisions, including context, chosen option and consequences.

Recommended naming:

```text
0001-use-github-as-source-of-truth.md
0002-separate-vector-and-dataset-versioning.md
0003-use-scmdb-mirror-as-primary-game-data-source.md
```

### 4.3 `docs/architecture/`

Contains living technical documentation that may evolve with implementation.

Examples:

```text
auth.md
dataset-engine.md
deployment.md
database.md
system-overview.md
```

## 5. FROZEN Rule Lifecycle

A FROZEN rule is binding after approval.

Rules:

1. A FROZEN rule must not be silently overwritten.
2. A material change creates a new version of the rule document.
3. The former rule remains in Git history and may be marked `SUPERSEDED`.
4. The successor document identifies the superseded version.
5. Significant architectural changes also require an ADR.
6. A proposed rule becomes Production-authoritative only after merge into `main`.

Recommended status values:

- `DRAFT`
- `PROPOSED`
- `FROZEN`
- `SUPERSEDED`
- `DEPRECATED`

## 6. Change Traceability

Every rule or architecture change must be traceable through Git commits and, where appropriate, pull requests.

A change should include:

- the affected rule or architecture document;
- the reason for the change;
- consequences and migration impact;
- related implementation changes;
- the replacement relationship if a FROZEN rule is superseded.

No important VECTOR rule should exist only in chat history, a local note or an isolated OneDrive file.

## 7. Deployment Governance

The approved environment mapping is:

```text
GitHub default branch: develop
Vercel Preview:        develop and other non-production branches
Vercel Production:     main
GitHub Pages:          Production gateway only
```

The legacy GitHub Pages URL must only direct users to the current VECTOR Production endpoint associated with `main`. It must not expose or redirect to `develop`, PTU-only previews or immutable Vercel Preview deployment URLs.

## 8. Release Gates

Before merging `develop` into `main`, the applicable release gate must confirm:

- build success;
- Preview deployment availability;
- required route and runtime smoke tests;
- security-sensitive flow checks;
- review of changed files and commits;
- absence of unresolved merge conflicts;
- successful required checks;
- correct version and dataset metadata.

A green build without a successful runtime test is not sufficient when runtime behavior is affected.

## 9. File and Commit Rule

For every VECTOR file that must be added or changed, the implementation guidance should include a suitable Git commit message.

Recommended documentation baseline commit:

```text
docs(architecture): establish VECTOR governance v1 frozen baseline
```

## 10. Governance Principles

VECTOR governance follows these principles:

- do not guess uncertain data;
- separate Production truth from development work;
- preserve history instead of silently replacing decisions;
- keep code and governing rules together;
- validate in Preview before Production;
- prefer reproducible, reviewable and automated processes;
- keep operational secrets and credentials outside the repository.

## 11. Frozen Decision

VECTOR Governance v1 is FROZEN.

Any material amendment requires:

1. a successor governance document;
2. a documented rationale;
3. review on `develop`;
4. merge through the normal release process into `main`.
