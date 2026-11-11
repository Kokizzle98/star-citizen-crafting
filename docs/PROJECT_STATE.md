# VECTOR Project State

- **Status:** ACTIVE (compact master state, non-normative)
- **Purpose:** the shortest repository-verified answer to "where is VECTOR right now?", for restarts of the owner, the VECTOR Project Lead and engineering agents
- **Repository:** `github.com/Kokizzle98/star-citizen-crafting`
- **Expected primary working branch:** `develop`
- **State verified through commit:** `debcd4e295960e5785ce981a1e5ea004ef3d541a`
- **Updated by work package:** Blueprint Ownership / Tracking PR 3 (LIVE Blueprint Catalog Sync)
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
- Blueprint Ownership / Tracking PR 2 — Database Foundation: **PRODUCTION COMPLETE**. Squash-merged as #39 (`debcd4e`); migration `database/migrations/blueprints/001_blueprint_ownership_foundation.sql` applied to Supabase Production on 2026-11-11 under an explicit named owner GO; `DB-ENV-08` postchecks PASS, the five Blueprint tables empty, no unexpected drift (evidence on PR #39).

## ACTIVE

- **Blueprint Ownership / Tracking PR 3 — LIVE Blueprint Catalog Sync** (branch `feat/blueprint-live-catalog-sync`, pull request against `develop`): pure payload builder `lib/blueprints/blueprint-sync-payload.ts` and owner-side CLI runner `scripts/sync-scmdb-blueprint-catalog.mjs` for the repository-pinned LIVE mirror `4.10.2-live.12913470`. Dry run by default; `--apply` calls only the RPC `sync_scmdb_blueprint_catalog()`. Repository only: **no data has been synchronized to Production.**

## PAUSED

- Blueprint Ownership / Tracking PR 4 (`/vector/blueprints`), until PR 3 is merged and the first LIVE sync has run under its own Production GO.

## BLOCKED

- None.

## NEXT

1. Validation gate, pull request, CI and owner review of PR 3; remediation if needed; merge.
2. Separate, explicit, named owner GO for the first Production run `node --env-file=.env.local scripts/sync-scmdb-blueprint-catalog.mjs --apply --expect-version 4.10.2-live.12913470` (`DB-ENV-04`), with read-only prechecks before and read-only postchecks after the run.
3. Then PR 4 on its own branch from `develop`; its first commit rotates the restart-handover checkpoint.

## OPEN DECISIONS

- No owner decision is pending for the active work package.
- Known items that will need a decision later, none started: the `Crew Security Hardening` work package (LOW to MEDIUM findings, due before the first user outside the current test group); archiving or removing the legacy audit scripts `vector_item_data_audit_v2` to `v5` and the `data/audit*` folders (separate Cleanup Gate); Rule Index remediation items R1, R2, R4 and R5; the later WP-AOM-01 gates (Security Finding Register, Backup Gate, Cleanup Gate), which stay separate future work.

## RELEVANT CONTRACTS

- FROZEN specifications in `docs/frozen/`, registered in `docs/RULE_INDEX.md` section 5. Most relevant right now: `DB_ENVIRONMENT_GOVERNANCE_V1.md` (Production read and write gates), `VECTOR_VERSIONING_V1_1.md` (LIVE/PTU isolation), `VECTOR_GOVERNANCE_V1.md` (global governance).
- Operating contracts: `AGENTS.md`, `docs/governance/AI_OPERATING_MODEL.md`, `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`.
- Recovery: `docs/handover/VECTOR_RESTART_HANDOVER.md` (control block, drift procedure, Blueprint decisions) and `SCMDB_LOCATION_HANDOVER.md` (frozen location contracts).
- Evidence: `docs/governance/PROJECT_LEAD_EVIDENCE.md` (generator, CURRENT and ARCHIVE contract, Project Lead bootstrap).
- Supabase: exactly one environment, Production, project `qpbgtzjtwgkwlgpbataq` on branch `main`; it currently holds test data and is still Production. Read-only access is allowed; every mutation needs an explicit owner GO.
