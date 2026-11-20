# VECTOR Project State

- **Status:** ACTIVE (compact master state, non-normative)
- **Purpose:** the shortest repository-verified answer to "where is VECTOR right now?", for restarts of the owner, the VECTOR Project Lead and engineering agents
- **Repository:** `github.com/Kokizzle98/star-citizen-crafting`
- **Expected primary working branch:** `develop`
- **Document version:** v18 (counted up from v17; ROT-14 checkpoint rotation, base commit `5bd0d5b726406f9336beea4a48f1ad042249c852`)
- **State verified through commit:** `5bd0d5b726406f9336beea4a48f1ad042249c852`
- **Updated by work package:** ROT-14 (checkpoint rotation, documentation only, 2026-11-20). Repository facts and merged PRs were verified with `git` against `origin` at the base commit above. Previous update: ROT-13 (checkpoint rotation after PR #101).
- **Checkpoint date:** 2026-11-20

## How to read this file

- `State verified through commit` is the latest complete commit through which the statements below were technically or factually verified. This file never contains the hash of the commit that contains this version of itself; that would be self-referential and impossible.
- The Snapshot Commit of an exported evidence set is recorded by the evidence generator in `VECTOR_EVIDENCE.md`, not here. The exported copy of this file is content-identical to the repository file at that Snapshot Commit.
- Directly observed runtime evidence (Supabase Production, Vercel) can invalidate repository assumptions. Record the observation explicitly; never reconcile silently.
- Chat memory and OneDrive snapshots do not replace current Git evidence. When they differ from `origin/develop`, Git wins: stop and reconcile instead of guessing.
- The recovery control block (anchor, allowed paths, drift procedure) lives in `docs/handover/VECTOR_RESTART_HANDOVER.md`. This file does not duplicate it.

## DONE

- Versioning v1.1 freeze and freeze transition (PRs #9 to #11, merged into `main` on 2026-10-30).
- SCMDB location pipeline and its frozen handover contracts (PRs #27 to #33; `docs/handover/SCMDB_LOCATION_HANDOVER.md`).
- Repository cleanup and baseline, `AGENTS.md` and `CLAUDE.md` as agent entry point (PRs #34, #35; merged 2026-11-10).
- Blueprint Ownership / Tracking PR 1: SCMDB blueprint catalog and reward readers with tests, no database, no UI (PR #36, squash-merged 2026-11-11 as `895c153`).
- DB environment governance v1 FROZEN: `DB-ENV-01` to `DB-ENV-09`, single Supabase Production environment holding test data, no staging (PR #37, merged 2026-11-11 as `615a6e9`). Superseded in full by v1.1 (see DEV-DB G0 below); v1.0 stays unchanged for traceability.
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
- UX-3b material rows, depth indicator, KPI strip: **DONE**. #66 (`3f29025`): level model per `INVENTORY_UX_V1_1.md` (historical: that version is now superseded by `INVENTORY_UX_V1_2.md`; GLOBAL Material → Lots, LOCATION Material → Ort → Lots), material row with quantity, Ø (quantity-weighted, rounded half up) and Spanne, depth indicator `Ebene n von 2` / `Ebene n von 3`, KPI strip, and the anchor jump of `In Mein Inventory bearbeiten` now opens the group. Display only, no data model change. Assumptions from #66: level n = deepest expanded level (all collapsed = level 1); the KPI strip computes over the filtered rows.
- UX-4 Crew Inventory overview: **DONE**. #68 (`463d91d`): variant A without a player level: "n Spieler" in the material row, panel "Qualitätsverteilung", panel "Spieler". Display only, no data model change.
- UX-5 global key set: **DONE**. #69 (`77ee94a`): keys per section 13.1 (W/S, D/F, A, Q/E, T, R, 1 to 4; 5 and 6 "BALD"), Esc order. `lib/keyboard/key-set.ts`, `components/layout/useKeySet.ts`. No new write path.
- UX-5b key help: **DONE**. #70 (`c483aa9`): hint bar per state and "Tastenhilfe" overview, table in `lib/keyboard/key-help.ts`, tested against the key logic. Display only.
- Inventory UX v1.2: **DONE**. #71 (`6e3ba14`) proposal, #72 (`914bbe0`) promotion to FROZEN as full-document successor; `INVENTORY_UX_V1_1.md` registered `SUPERSEDED` (`docs/RULE_INDEX.md` v1.3). Documentation only.
- Checkpoint rotation after PR #72 (Rotation-8): **DONE**. #73 (`16dc3d3`): PROJECT_STATE v7, handover v7, anchor `914bbe0`, allowed scope adds `lib/keyboard/`. Documentation only.
- UX-5c `B` key: **DONE**. #74 (`de31ad5`): action `edit` (`INVENTORY_UX_V1_2.md` section 13.1), hint "B bearbeiten" only with a selected own lot on Mein Inventory (section 13.2); starts the same editor as the edit button; no key for deleting. No new write path.
- UX-5d Crew edit symbol with jump and return: **DONE**. #75 (`8ea2425`): the symbol on own lots in Crew Inventory (link "In Mein Inventory bearbeiten") opens the editor of exactly that lot; save or cancel returns to the saved position (`lib/inventory/inventory-return-state.ts`); hint "öffnen, dann B bearbeiten" on material and location rows. Display and navigation only.
- UX-6a Fabricator clarity pass and dataset label in the header: **DONE**. #76 (`c4d60fe`): `Rezept & Crew-Bestand` and `Material-Qualität im Detail` are collapsed (`components/fabricator/FabricatorDisclosure.tsx`, native `details` / `summary` with own indicator and focus on the variant row after the choice), the variant choice is one compact row after selection, and the header shows `LIVE · 4.10.2` taken from the existing repository-pinned dataset (`components/layout/dataset-label.ts`, LIVE only, no selection, no second hard-coded version). No functional change.
- UX-6b Dashboard polish: **DONE**. #77 (`de12e8f`): Inventory card is a link, uniform card footers, status with glyph, readable contrast, labelled project state, and the entry hint for new users names the crew membership first ("Neu hier? Du brauchst zuerst eine Crew-Mitgliedschaft: Lass dich von deiner Crew einladen.") with a link to Mein Inventory. Display only.
- Release `develop` to `main`: **DONE**. PR #79 (merge commit, `main` = `e916f69`). Rollback point: tag `pre-release-2026-11-14` on `eb6f108`.
- Login hardening: **DONE**. #80 (`e2a8b66`): `next` redirect hardened (findings F1 and F4 from the review of PR #79).
- UX-7 public start page: **DONE**. #81 (`cdd9340`): public start page, fan project notice, link to the official site.
- FAB-UX-1 Fabricator basics: **DONE**. #82 (`858ddfc`): hint bar, WASD keys, variant panel stays open, hint in the variant area.
- UX-8 visitor navigation: **DONE**. #83 (`217fa91`): visitors see only Start and Sign in; Inventory redirects to sign-in without a login.
- Checkpoint rotation after PR #83: **DONE**. #84 (`875f9f5`), documentation only.
- INV-EMPTY-1 empty states in Inventory: **DONE**. #85 (`9b882f9`): explanatory hints with the next step for empty Mein Inventory / Crew Inventory, the Location view when every lot is in `Unbekannt`, and filters without a match; clearer text for `PLAYER_CONTEXT_REQUIRED`. Texts and display only.
- REPO-TIDY-1 repository root tidy: **DONE**. #86 (`9d58d61`): audit scripts V4 to V6 and the resolver config to `scripts/audit/`, armor scripts to `scripts/armor-environment/`, notes to `docs/notes/` and `docs/handover/`, unused audit scripts V2 and V3 removed, audit workflow paths adjusted. No logic change.
- Release 2 `develop` -> `main`: **DONE**. PR #87 (merge commit, `main` = `66c531bd`, tag `release-2026-11-17` on `66c531bd`). Rollback points: tag `pre-release-2026-11-14` on `eb6f108` and the previous `main` `e916f69`. Delta: #81 to #86 (#80 was already in `main` through #79). No database, data, dependency or environment change in the release.
- DEV-DB concept (WP DEV-DB-KONZEPT): **DONE**. PR #89 (merge commit `e97f88f`): `docs/architecture/DEV_DB_CONCEPT.md`, documentation only; the read-only inventory of the current database is kept privately by the owner.
- DEV-DB G0 (governance decision for the DEVELOP Supabase): **DONE** (#89 concept, #90 governance). `DB_ENVIRONMENT_GOVERNANCE_V1_1.md` FROZEN as full-document successor (owner decision 2026-11-17): only `DB-ENV-09` changes, a separate `DEVELOP` project on the Free plan is allowed; `DB-ENV-01` to `DB-ENV-08` carry over. `DEV_DB_CONCEPT.md` is `ACCEPTED` (v1.0).
- DEV-DB G1 to G4 (separate `DEVELOP` database): **DONE** (owner-approved steps, each with its own GO). The `DEVELOP` project exists on the Free plan, schema, catalog data and synthetic test data are in place, and Vercel Preview deployments of the branch `develop` run against it. Production stays reachable only through `main`. Other branch previews are not part of this statement. No project identifiers, URLs, keys or accounts are recorded here (public repository).
- Documentation PRs #92–#95: #92 DOC-REF-2 updated DB governance references; #93 introduced SCMDB source inventory v1.0 (analysis only); #94 updated `DATASET_PIPELINE_V1.md` to v1.2, `SCMDB_SOURCE_INVENTORY.md` to v1.1 and `docs/RULE_INDEX.md` to v1.5 (all remain `PROPOSED`; nothing was frozen); #95 GOV-1 added GitHub Copilot as optional Secondary Engineer / Specialist while Claude Code remains Primary and default Engineer. The current AI operating model is v1.5 and also lists Copilot as optional Independent Reviewer.
- Governance and evidence PRs #97–#98: `DB_ENVIRONMENT_GOVERNANCE_V1_2.md` became FROZEN, including DB-ENV-10 One-Time Production Execution and DB-ENV-11 security-hardening sequence exception; GOV-3 updated Project Lead evidence governance references to v1.2.
- Release 3 `develop` -> `main`: **DONE**. PR #99 (merge commit, `main` = `9cc4b2a`, tag `release-2026-11-18`); governance documentation only.
- Privilege hardening: **RECORDED** by PR #101 in `database/migrations/security/002_security_hardening_h2.sql`, with a contract test. The migration is already applied; it reaches `main` only with a separate next release.
- Checkpoint rotation after PR #101: **DONE**. PR #102 (ROT-13), documentation only.
- DOMAIN-PRECHECK-V1: **DONE**. PR #103 added the fail-closed domain precheck core, CLI and tests; unreadable mirror entries produce `HELD` instead of being dropped. The same PR records DATASET_PIPELINE_V1 v1.2 owner decisions 19 to 22 in `docs/proposed/DATASET_PIPELINE_V1.md`.
- MIRROR-WORKFLOW-V2: **DONE**. PR #104 syncs SCMDB without direct push; the default mode is dry-run when `SCMDB_SYNC_MODE` is unset.
- MIRROR-REVIEW-ACK: **DONE**. PR #105 added hash-bound reviewed acknowledgement for site-settings holds.
- Production privilege hardening G6: **DONE** on 2026-11-18 under named per-step owner GOs; DB-ENV-11 is satisfied by PR #101. Evidence is private.
- Governance / documentation after PR #52: **DONE**. #53 (`b28abe7`) checkpoint rotation and project identifier removed from the active docs; #54 (`2e20cf0`) public-repo rule in `AGENTS.md` and review-before-merge and runtime read access in `AI_OPERATING_MODEL` (v1.2); #55 (`79f7b30`) unofficial fan project notice in `README.md`; #56 (`6586108`) public-repo boundary clarification and checkpoint rotation. Documentation only, no Production mutation.

## ACTIVE

- UX series (owner priority: a usable, good-looking app for the owner and the first outside tester). Design mock-ups approved by the owner on 2026-11-13. Order, one work package per session: UX-1 (quality tiers) **DONE**, UX-2 (shell and branding) **DONE**, UX-3a (Mein Inventory / Crew Inventory split, Crew page read-only) **DONE**, UX-3b (material rows with average and range, depth indicator, KPI strip) **DONE**, UX-4 (Crew Inventory overview) **DONE**, UX-5 (global key set) **DONE**, UX-5b (key help) **DONE**, UX-5c (`B` key) **DONE**, UX-5d (Crew edit symbol with jump and return) **DONE**, UX-6a (Fabricator clarity pass, dataset label) **DONE**, UX-6b (dashboard polish) **DONE**. The series is complete as planned; remaining open points are listed under OPEN DECISIONS. Binding specification: `docs/frozen/INVENTORY_UX_V1_2.md`.

## PAUSED

- None.

## BLOCKED

- None.

## NEXT

- Before switching the mirror workflow from dry-run (`SCMDB_SYNC_MODE` unset) to publish: structured independent review of the mirror workflow, owner-side GitHub Actions settings check, and owner-side dashboard checks.
- Release `develop` -> `main` remains a separate owner decision; PRs #101–#105 are not on `main` yet.

## OPEN DECISIONS

- Licence and redistribution of scunpacked-data (no licence file): unresolved. Option B keeps the index local and uncommitted until this is decided; a later move to option A or A′ needs its own owner decision. No other owner decision is pending for the current work package.
- Later UX work package (not started): compact lot / location display in the Fabricator, grouping by player and location, further progressive disclosure (the collapsible recipe and quality sections are done in UX-6a), and a clear distinction between "available in the crew" and "available at one place".
- `SCMDB_SOURCE_AUTHORITY_V1` is absorbed by the FROZEN `VECTOR_SOURCE_AUTHORITY_V1`; `PROVIDER_AUTHORITY_V1` (user-state providers) stays PLANNED.
- Known items that will need a decision later, none started: a later UX / design pass (blueprint thumbnails or images, component size, a calmer presentation of `Nicht bekannt`, the narrow app shell / sidebar on small screens); the known crew `active_group` inconsistency (`getCrewContext()` falls back to the first crew while the crew RPCs report `ACTIVE_GROUP_REQUIRED`), deliberately unchanged; the `Crew Security Hardening` work package (LOW to MEDIUM findings, due before the first user outside the current test group); archiving or removing the `data/audit*` folders (separate Cleanup Gate; the unused audit scripts `v2` and `v3` were removed and the V4 to V6 audit scripts moved to `scripts/audit/` in REPO-TIDY-1, V6 still imports V4 and V5); Rule Index remediation items R1, R2, R4 and R5; the later WP-AOM-01 gates (Security Finding Register, Backup Gate, Cleanup Gate), which stay separate future work.
- Open points found before the release (2026-11-14, none started, none blocks the release):
  - **No crew invitation UI.** The database has `invite_group_member` and `respond_group_invite`, but no page or component calls them (only `set_active_group` and the read RPCs are used). Issuing an invitation (crew owner) and accepting it (invited user) are missing. The dashboard hint "Lass dich von deiner Crew einladen" therefore has no in-app path.
  - **Dashboard milestone text is outdated.** `app/vector/page.tsx` still shows `NÄCHSTER MEILENSTEIN: Fabricator Quality & Stats`, although F3 is done.
  - **Empty states without a link.** Addressed in text by INV-EMPTY-1 (#85): the empty states now name the next action. They still contain no clickable link; a link would be a separate small package.

## OPEN INFRASTRUCTURE WORK

- `DEVELOP` instance (owner decision 2026-11-17): a second, ordinary Supabase project on the Free plan for development, preview and safe write tests; **created**, governed by `DB-ENV-09` in `DB_ENVIRONMENT_GOVERNANCE_V1_2.md`, planned in `docs/architecture/DEV_DB_CONCEPT.md`. The privilege hardening migration is recorded and already applied; its release to `main` is listed under NEXT. Later steps of the concept remain separate work. Vercel Preview deployments of the branch `develop` use `DEVELOP`; Vercel Production uses the Production database.
- Separate Supabase contexts for `LIVE` and `PTU` (future Spur-B target, owner decision 2026-11-11, not started): **not** a current DB-environment contract and **not** FROZEN. The Free plan does not allow more than two active projects, so this stays a separate future package (concept section 9).

## RELEVANT CONTRACTS

- FROZEN specifications in `docs/frozen/`, registered in `docs/RULE_INDEX.md` section 5. Most relevant right now: `INVENTORY_UX_V1_2.md` (inventory UX, quality tiers, key set, key help), `VECTOR_SOURCE_AUTHORITY_V1.md` (external source identity and authority), `DB_ENVIRONMENT_GOVERNANCE_V1_2.md` (Production read and write gates, DEVELOP environment, One-Time Production Execution), `VECTOR_VERSIONING_V1_1.md` (LIVE/PTU isolation), `VECTOR_GOVERNANCE_V1.md` (global governance).
- Operating contracts: `AGENTS.md`, `docs/governance/AI_OPERATING_MODEL.md`, `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`.
- Recovery: `docs/handover/VECTOR_RESTART_HANDOVER.md` (control block, drift procedure, Blueprint decisions) and `docs/handover/SCMDB_LOCATION_HANDOVER.md` (frozen location contracts).
- Evidence: `docs/governance/PROJECT_LEAD_EVIDENCE.md` (generator, CURRENT and ARCHIVE contract, Project Lead bootstrap).
- Security-relevant runtime evidence (database dumps, policy / grant listings, project identifiers) is held privately by the owner and is not stored in this repository.
- Supabase: two environments exist. Production (project: see the owner's private project archive, branch `main`) currently holds test data and is still Production. `DEVELOP` (Free plan, permitted by `DB-ENV-09`, since v1.1) is the development and preview database. Read-only access to Production is allowed; every Production mutation needs an explicit owner GO; target state: one project-scoped connection per project, `PRODUCTION` read-only; until then the engineer writes exclusively to the project named `DEVELOP` (verified by name before every write) and reads `PRODUCTION` read-only, except execution under `DB-ENV-10` (`DB-ENV-09` condition 8, amended 2026-11-18, owner decision).
