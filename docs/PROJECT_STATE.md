# VECTOR Project State

- **Status:** ACTIVE (compact master state, non-normative)
- **Purpose:** the shortest repository-verified answer to "where is VECTOR right now?", for restarts of the owner, the VECTOR Project Lead and engineering agents
- **Repository:** `github.com/Kokizzle98/star-citizen-crafting`
- **Expected primary working branch:** `develop`
- **State verified through commit:** `74d72dc706ede38524cc577a22159449a69b753a`
- **Updated by work package:** Fabricator Phase 1 — checkpoint rotation for F2 (Workspace + Recipe + Crew Craftability) on the F1.2 foundation
- **Checkpoint date:** 2026-11-12

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
- Blueprint Ownership / Tracking PR 3 — LIVE Blueprint Catalog Sync: **PRODUCTION COMPLETE**. Squash-merged as #40 (`b24a2e0`); the first LIVE sync ran once on 2026-11-11 under an explicit named owner GO (`DB-ENV-04`). Active dataset `d5a91245-a5d4-4836-9265-d30cd32527c9`, `LIVE`, `4.10.2-live.12913470`, `ACTIVE`: 1618 blueprints (1610 `VALID`, 8 `REVIEW_REQUIRED`), 7480 reward rows, `duplicateSourceRows = 4`, 0 PTU rows, 0 ownership rows; read-only postchecks PASS (evidence on PR #40).
- Blueprint Ownership / Tracking PR 4 — Usable Blueprint UI: **DONE**. Squash-merged as #41 (`a8ee27c`): `/vector/blueprints` with the active LIVE catalog, search, filters, sort, 100-plus-100 display, personal manual ownership toggle through `mark_blueprint_owned()` / `unmark_blueprint_owned()`, derived crew view, status `Du` / `Crew` / `Nicht bekannt`, `REVIEW_REQUIRED` hint, sidebar link and dashboard entry. UI only; no migration, no Production mutation.
- **Blueprint Ownership / Tracking package: COMPLETE** (PRs 1 to 4: #36, #39, #40, #41; checkpoint #42 as `84e7fc3`). LIVE Blueprint dataset `4.10.2-live.12913470` is `ACTIVE` in Production.
- Fabricator F1 — Read & Domain Foundation: **DONE**. Squash-merged as #43 (`f1e0dbf`) after the owner / Project Lead merge gate; reviewed head `14b50bd`.
- Fabricator F1.1 — Product Family / Functional Variant Refinement: **DONE**. Squash-merged as #45 (`cc083c9`) after the owner merge gate; reviewed head `a83803a`.
- Fabricator F1.2 — Armor Family Key V2: **DONE**. Squash-merged as #46 (`74d72dc`) after the owner merge gate; reviewed head `e08e3bd`. Armor family = tag prefix + set number, edition / variant = complete remainder; undersuits are no armor-set component. 652 families (62 armor sets), review states unchanged (22).

## ACTIVE

- **Fabricator Phase 1**, pull request **F2 – Workspace + Recipe + Crew Craftability** (#44) on `feat/fabricator-f2-workspace`, rebuilt on F1.2: `/vector/fabricator` with families, short set / variant / component labels, the `Rüstungsset` overview (OD-FAB-UX-01), visible functional deviation, recipe and crew craftability; read-only, no database change, no Production mutation; F3 is NEXT. Owner decisions D1 = A, D2 = C, D3 = A, D4 = A (with contract) and D5 (hero images core, mockups are no product image source) and the SCMDB source and semantic reference decision (SCMDB is the preferred semantic reference for SCMDB-derived data, never an authority for VECTOR user state) are recorded in the restart handover section 5 and the F1 pull request. The F2 checkpoint authorizes F2 paths only.

## PAUSED

- None.

## BLOCKED

- None.

## NEXT

1. Owner smoke and review of PR #44; merge only with explicit owner approval.
2. F3: global MANUAL quality slider Q0–1000 and resolved product stats, computed per concrete item.
3. Later and not part of Fabricator Phase 1: reliable product / variant visuals (D5).

## OPEN DECISIONS

- No owner decision is pending for F2.
- Later UX work package (not started): compact lot / location display in the Fabricator, grouping by player and location, progressive disclosure, and a clear distinction between "available in the crew" and "available at one place".
- Separate governance work package noted for later: `SCMDB_SOURCE_AUTHORITY_V1` (or integration into a future provider authority contract).
- Known items that will need a decision later, none started: a later UX / design pass (blueprint thumbnails or images, component size, a calmer presentation of `Nicht bekannt`, the narrow app shell / sidebar on small screens); the known crew `active_group` inconsistency (`getCrewContext()` falls back to the first crew while the crew RPCs report `ACTIVE_GROUP_REQUIRED`), deliberately unchanged; the `Crew Security Hardening` work package (LOW to MEDIUM findings, due before the first user outside the current test group); archiving or removing the legacy audit scripts `vector_item_data_audit_v2` to `v5` and the `data/audit*` folders (separate Cleanup Gate); Rule Index remediation items R1, R2, R4 and R5; the later WP-AOM-01 gates (Security Finding Register, Backup Gate, Cleanup Gate), which stay separate future work.

## OPEN INFRASTRUCTURE WORK

- Future Spur-B target (owner decision 2026-11-11, not started): separate Supabase contexts for `LIVE` and `PTU` and a separate `DEVELOP` instance for development, preview, automated tests and deployment automation, specified and implemented in its own infrastructure and governance work package. This is **not** a current DB-environment contract and **not** FROZEN: `DB_ENVIRONMENT_GOVERNANCE_V1` (one Supabase Production environment) stays binding until a governed change replaces it.

## RELEVANT CONTRACTS

- FROZEN specifications in `docs/frozen/`, registered in `docs/RULE_INDEX.md` section 5. Most relevant right now: `DB_ENVIRONMENT_GOVERNANCE_V1.md` (Production read and write gates), `VECTOR_VERSIONING_V1_1.md` (LIVE/PTU isolation), `VECTOR_GOVERNANCE_V1.md` (global governance).
- Operating contracts: `AGENTS.md`, `docs/governance/AI_OPERATING_MODEL.md`, `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`.
- Recovery: `docs/handover/VECTOR_RESTART_HANDOVER.md` (control block, drift procedure, Blueprint decisions) and `SCMDB_LOCATION_HANDOVER.md` (frozen location contracts).
- Evidence: `docs/governance/PROJECT_LEAD_EVIDENCE.md` (generator, CURRENT and ARCHIVE contract, Project Lead bootstrap).
- Supabase: exactly one environment, Production, project `qpbgtzjtwgkwlgpbataq` on branch `main`; it currently holds test data and is still Production. Read-only access is allowed; every mutation needs an explicit owner GO.
