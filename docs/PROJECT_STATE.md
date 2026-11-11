# VECTOR Project State

- **Status:** ACTIVE (compact master state, non-normative)
- **Purpose:** the shortest repository-verified answer to "where is VECTOR right now?", for restarts of the owner, the VECTOR Project Lead and engineering agents
- **Repository:** `github.com/Kokizzle98/star-citizen-crafting`
- **Expected primary working branch:** `develop`
- **State verified through commit:** `0426896bbc46747bd68d4020ca013012af4e2d06`
- **Updated by work package:** Blueprint Ownership / Tracking PR 2 (Database Foundation)
- **Checkpoint date:** 2026-11-11

## How to read this file

- `State verified through commit` is the latest complete commit through which the statements below were technically or factually verified. This file never contains the hash of the commit that contains this version of itself; that would be self-referential and impossible.
- The Snapshot Commit of an exported evidence set is recorded by the evidence generator in `VECTOR_EVIDENCE.md`, not here. The exported copy of this file is content-identical to the repository file at that Snapshot Commit.
- Directly observed runtime evidence (Supabase Production, Vercel) can invalidate repository assumptions. Record the observation explicitly; never reconcile silently.
- Chat memory and OneDrive snapshots do not replace current Git evidence. When they differ from `origin/develop`, Git wins: stop and reconcile instead of guessing.
- The recovery control block (anchor, allowed paths, drift procedure) lives in `docs/handover/VECTOR_RESTART_HANDOVER.md`. This file does not duplicate it.

## DONE

- Versioning v1.1 freeze and freeze transition (PRs #9 to #11, merged into `main` on 2026-10-30).
- SCMDB location pipeline and its frozen handover contracts (PRs #27 to #33; `SCMDB_LOCATION_HANDOVER.md`).
- Repository cleanup and baseline, `AGENTS.md` and `CLAUDE.md` as agent entry point (PRs #34, #35; merged 2026-11-10).
- Blueprint Ownership / Tracking PR 1: SCMDB blueprint catalog and reward readers with tests, no database, no UI (PR #36, squash-merged 2026-11-11 as `895c153`).
- DB environment governance v1 FROZEN: `DB-ENV-01` to `DB-ENV-09`, single Supabase Production environment holding test data, no staging (PR #37, merged 2026-11-11 as `615a6e9`).
- WP-AOM-01 Implementation Gate 1: compact project state, AI operating model, commit-bound Project Lead evidence generator (PR #38, merged 2026-11-11 as `0426896`).

## ACTIVE

- **Blueprint Ownership / Tracking PR 2 — Database Foundation** (branch `feat/blueprint-ownership-database-foundation`, pull request against `develop`): first Blueprint migration `database/migrations/blueprints/001_blueprint_ownership_foundation.sql` (five tables, RLS and grants, `sync_scmdb_blueprint_catalog`, `mark_blueprint_owned`, `unmark_blueprint_owned`, `get_active_crew_blueprint_status`), reward source-occurrence indices in the extractor, PGlite contract tests. Repository only: the migration is **not** applied to Production.

## PAUSED

- Blueprint Ownership / Tracking PR 3 (LIVE catalog synchronization) and PR 4 (`/vector/blueprints`), until PR 2 is merged and its migration has been applied under a separate production-migration GO.

## BLOCKED

- None.

## NEXT

1. Validation gate, pull request, CI and one independent Stability, Maintainability and Security review of the stable PR 2 head; remediation if needed; owner review and merge.
2. Separate, explicit, named owner GO for applying `database/migrations/blueprints/001_blueprint_ownership_foundation.sql` to Production (`DB-ENV-04`, `DB-ENV-07`), then read-only postchecks recorded on the PR 2 pull request (`DB-ENV-08`).
3. Then PR 3 on its own branch from `develop`; its first commit rotates the restart-handover checkpoint.

## OPEN DECISIONS

- No owner decision is pending for the active work package.
- Known items that will need a decision later, none started: the `Crew Security Hardening` work package (LOW to MEDIUM findings, due before the first user outside the current test group); archiving or removing the legacy audit scripts `vector_item_data_audit_v2` to `v5` and the `data/audit*` folders (separate Cleanup Gate); Rule Index remediation items R1, R2, R4 and R5; the later WP-AOM-01 gates (Security Finding Register, Backup Gate, Cleanup Gate), which stay separate future work.

## RELEVANT CONTRACTS

- FROZEN specifications in `docs/frozen/`, registered in `docs/RULE_INDEX.md` section 5. Most relevant right now: `DB_ENVIRONMENT_GOVERNANCE_V1.md` (Production read and write gates), `VECTOR_VERSIONING_V1_1.md` (LIVE/PTU isolation), `VECTOR_GOVERNANCE_V1.md` (global governance).
- Operating contracts: `AGENTS.md`, `docs/governance/AI_OPERATING_MODEL.md`, `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`.
- Recovery: `docs/handover/VECTOR_RESTART_HANDOVER.md` (control block, drift procedure, Blueprint decisions) and `SCMDB_LOCATION_HANDOVER.md` (frozen location contracts).
- Evidence: `docs/governance/PROJECT_LEAD_EVIDENCE.md` (generator, CURRENT and ARCHIVE contract, Project Lead bootstrap).
- Supabase: exactly one environment, Production, project `qpbgtzjtwgkwlgpbataq` on branch `main`; it currently holds test data and is still Production. Read-only access is allowed; every mutation needs an explicit owner GO.
