# VECTOR Project State

- **Status:** ACTIVE (compact master state, non-normative)
- **Purpose:** the shortest repository-verified answer to "where is VECTOR right now?", for restarts of the owner, the VECTOR Project Lead and engineering agents
- **Repository:** `github.com/Kokizzle98/star-citizen-crafting`
- **Expected primary working branch:** `develop`
- **Document version:** v5 (counted up from v4; checkpoint rotation after PR #64)
- **State verified through commit:** `6f10bf1c28918e6383df86c1bc3214c3e1bf4bda`
- **Updated by work package:** Checkpoint rotation after PR #64 (develop `6f10bf1`): UX-3a done, UX-3b next
- **Checkpoint date:** 2026-11-13

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
- Fabricator F2 — Workspace + Recipe + Crew Craftability: **DONE**. Squash-merged as #44 (`706267a`) after the owner merge gate: `/vector/fabricator` with families, short set / variant / component labels, the `Rüstungsset` overview (OD-FAB-UX-01), visible functional deviation, recipe and crew craftability; read-only, no database change, no Production mutation.
- Fabricator F3 — MANUAL Quality per material, Inventory-Aware Preset & Product Stats: **DONE**. Squash-merged as #47 (`a460201`) after owner manual acceptance: individual quality per recipe material with a global bulk control, inventory-aware preset (`OQ-F3-1`, `D-F3-1`), `lib/quality/` primitives, per-item stats, armor temperatures reconciled with SCMDB, F2 duplicate-material fix; read-only, no Production mutation.
- Fabricator F4 evidence phase: read-only audits F4-A, F4-A.1, F4-A.2, Star Citizen Wiki API probe and UEX 22-UUID sample audit **complete** (2026-11-12). UEX identity semantics confirmed (exact CIG UUID), UEX coverage `PARTIAL`; UEX ingame and marketplace strictly separate.
- Governance – `VECTOR_SOURCE_AUTHORITY_V1` FROZEN: **DONE**. Merged as #48 (`9aeab14`); documentation only, no Production mutation.
- Governance – Claude agent structure (Fleet Commander): **DONE**. Merged as #49 (`95caf69`); Project Lead = Claude Fleet Commander, Primary Engineer = Claude Vector Terminal - GitHub / Claude Code, Independent Reviewer = GitHub Copilot (optional, punctual); documentation only, no Production mutation.
- F4-S source / distribution gate: **decided, Option B** (owner, 2026-11-12). The derived scunpacked-data index is not committed. The licence and redistribution status of scunpacked-data stay unresolved.
- F4-S – Vehicle Loadout Source Foundation (Option B): **DONE**. Merged as #50 (`210cb07`); offline generator, schema / types and reader with source / build guard; the derived index and raw source data are not committed.
- PR #51 (`6c487f2`) added read-only database runtime documentation; PR #52 (`36018f2`) removed it again because the repository is public and such security-relevant evidence does not belong in it (`AI_OPERATING_MODEL` section 5). Security-relevant runtime evidence is kept privately by the owner, not in the repository.
- Security hardening H1: **DONE**. Merged as #57 (`a8a4f3b`); reviewed migration `database/migrations/security/001_security_hardening_h1.sql` applied once to Supabase Production under an explicit owner GO; postchecks PASS (evidence on PR #57).
- No email address in the UI: **DONE**. #58 (`d569e1e`); the account label falls back to a neutral text, regression test `tests/no-email-display.test.mjs`.
- Inventory UX v1.1: **DONE**. #59 (`d7cbfcb`) proposal, #60 (`9808946`) promotion to FROZEN as full-document successor; `INVENTORY_UX_V1.md` registered `SUPERSEDED`. Documentation only.
- UX-1 central quality tiers: **DONE**. #61 (`84ce2ef`): `lib/quality/tiers.ts`, `QualityChip`, legend. No data model change.
- UX-2 design foundations and shell: **DONE**. #62 (`8b98db7`): fonts, brand line, navigation 01 to 06 (`components/layout/navigation.ts`), fan-project notice. No data model change.
- UX-3a Mein Inventory / Crew Inventory split: **DONE**. #64 (`6f10bf1`): `Mein Inventory` and `Crew Inventory` are separate pages, the Crew page is read-only, and Quick Add renders only with a known user (Copilot review fix). No data model change.
- Governance / documentation after PR #52: **DONE**. #53 (`b28abe7`) checkpoint rotation and project identifier removed from the active docs; #54 (`2e20cf0`) public-repo rule in `AGENTS.md` and review-before-merge and runtime read access in `AI_OPERATING_MODEL` (v1.2); #55 (`79f7b30`) unofficial fan project notice in `README.md`; #56 (`6586108`) public-repo boundary clarification and checkpoint rotation. Documentation only, no Production mutation.

## ACTIVE

- UX series (owner priority: a usable, good-looking app for the owner and the first outside tester). Design mock-ups approved by the owner on 2026-11-13. Order, one work package per session: UX-1 (quality tiers) **DONE**, UX-2 (shell and branding) **DONE**, UX-3a (Mein Inventory / Crew Inventory split, Crew page read-only) **DONE**, UX-3b (material rows with average and range, depth indicator, KPI strip) next, UX-4 (Crew Inventory overview polish), UX-5 (global key set), UX-6 (icons, dashboard polish). Binding specification: `docs/frozen/INVENTORY_UX_V1_1.md`.

## PAUSED

- None.

## BLOCKED

- None.

## NEXT

1. UX-3b: material rows with average and range (Ø and Spanne), depth indicator `Ebene n von 2` in GLOBAL, KPI strip. Known item: the anchor jump of `In Mein Inventory bearbeiten` does not expand the collapsed group.
2. After the UX series the owner chooses the next package (candidates: F4-B and a UEX source foundation, each as its own package, only after an explicit owner decision). F4-B (gameplay relevance / exclusion contract) and a UEX source foundation stay separate work packages. The licence / redistribution decision for scunpacked-data stays open and is tracked below.
3. Later and not part of Fabricator Phase 1: reliable product / variant visuals (D5).

## OPEN DECISIONS

- Licence and redistribution of scunpacked-data (no licence file): unresolved. Option B keeps the index local and uncommitted until this is decided; a later move to option A or A′ needs its own owner decision. No other owner decision is pending for the current work package.
- Later UX work package (not started): compact lot / location display in the Fabricator, grouping by player and location, progressive disclosure, and a clear distinction between "available in the crew" and "available at one place".
- `SCMDB_SOURCE_AUTHORITY_V1` is absorbed by the FROZEN `VECTOR_SOURCE_AUTHORITY_V1`; `PROVIDER_AUTHORITY_V1` (user-state providers) stays PLANNED.
- Known items that will need a decision later, none started: a later UX / design pass (blueprint thumbnails or images, component size, a calmer presentation of `Nicht bekannt`, the narrow app shell / sidebar on small screens); the known crew `active_group` inconsistency (`getCrewContext()` falls back to the first crew while the crew RPCs report `ACTIVE_GROUP_REQUIRED`), deliberately unchanged; the `Crew Security Hardening` work package (LOW to MEDIUM findings, due before the first user outside the current test group); archiving or removing the legacy audit scripts `vector_item_data_audit_v2` to `v5` and the `data/audit*` folders (separate Cleanup Gate); Rule Index remediation items R1, R2, R4 and R5; the later WP-AOM-01 gates (Security Finding Register, Backup Gate, Cleanup Gate), which stay separate future work.

## OPEN INFRASTRUCTURE WORK

- Future Spur-B target (owner decision 2026-11-11, not started): separate Supabase contexts for `LIVE` and `PTU` and a separate `DEVELOP` instance for development, preview, automated tests and deployment automation, specified and implemented in its own infrastructure and governance work package. This is **not** a current DB-environment contract and **not** FROZEN: `DB_ENVIRONMENT_GOVERNANCE_V1` (one Supabase Production environment) stays binding until a governed change replaces it.

## RELEVANT CONTRACTS

- FROZEN specifications in `docs/frozen/`, registered in `docs/RULE_INDEX.md` section 5. Most relevant right now: `INVENTORY_UX_V1_1.md` (inventory UX, quality tiers, key set), `VECTOR_SOURCE_AUTHORITY_V1.md` (external source identity and authority), `DB_ENVIRONMENT_GOVERNANCE_V1.md` (Production read and write gates), `VECTOR_VERSIONING_V1_1.md` (LIVE/PTU isolation), `VECTOR_GOVERNANCE_V1.md` (global governance).
- Operating contracts: `AGENTS.md`, `docs/governance/AI_OPERATING_MODEL.md`, `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`.
- Recovery: `docs/handover/VECTOR_RESTART_HANDOVER.md` (control block, drift procedure, Blueprint decisions) and `SCMDB_LOCATION_HANDOVER.md` (frozen location contracts).
- Evidence: `docs/governance/PROJECT_LEAD_EVIDENCE.md` (generator, CURRENT and ARCHIVE contract, Project Lead bootstrap).
- Security-relevant runtime evidence (database dumps, policy / grant listings, project identifiers) is held privately by the owner and is not stored in this repository.
- Supabase: exactly one environment, Production, project: see the owner's private project archive, branch `main`; it currently holds test data and is still Production. Read-only access is allowed; every mutation needs an explicit owner GO.
