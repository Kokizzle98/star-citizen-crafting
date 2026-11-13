# VECTOR Restart Handover

This document is operational and non-normative.

- Document version: v5 (counted up from v4; checkpoint rotation after PR #64, base commit `6f10bf1c28918e6383df86c1bc3214c3e1bf4bda`)

- Governed repository specifications remain authoritative according to their lifecycle and authority status.
- This handover exists only to recover the current working state and to locate authoritative evidence.
- Chat history must not be the sole source for a project decision.
- When this document conflicts with authoritative repository state, repository state wins and recovery must stop for drift reconciliation.

## 1. CURRENT CHECKPOINT

### Current work package

- Work package: `UX series (UX-3b to UX-6)`. UX-1 (quality tiers, #61), UX-2 (shell and branding, #62) and UX-3a (Mein Inventory / Crew Inventory split, #64) are done. Each UX work package is its own pull request and its own session; binding specification is `docs/frozen/INVENTORY_UX_V1_1.md`.
- Branch: `develop` (each UX work package works on its own feature branch)
- Base: `develop`
- Checkpoint date: `2026-11-13`
- Work-package base (historical): `6f10bf1c28918e6383df86c1bc3214c3e1bf4bda`
- Active checkpoint anchor: `6f10bf1c28918e6383df86c1bc3214c3e1bf4bda`
- Working-tree expectation: `CLEAN`
- Active PR: none at rotation time; each UX work package opens its own pull request against `develop`
- PR base: `develop`

The active anchor is the verified `develop` head after PR #64. The allowed scope below authorizes the documentation rotation and the planned UX series paths only: no migration, no Supabase or Vercel action, no Production mutation, no change to `data/`. Current HEAD may advance beyond that anchor only when all recovery invariants pass.

Allowed scope after the active checkpoint anchor (exactly these paths):

- `docs/PROJECT_STATE.md`
- `docs/handover/VECTOR_RESTART_HANDOVER.md`
- `app/vector/inventory/`
- `app/vector/page.tsx`
- `app/globals.css`
- `components/inventory/`
- `components/layout/`
- `components/quality/`
- `lib/inventory/`
- `lib/quality/`
- `tests/`

Recovery control block:

- checkpoint date;
- active work package;
- expected branch;
- base branch;
- work-package base;
- active checkpoint anchor;
- allowed path set;
- working-tree expectation;
- active PR expectations;
- `NEXT STEP`.

The control block is trusted only from the LVCR copy (see LVCR trust model in the recovery procedure), never from the working tree or the current HEAD copy.

The anchor is intentionally not an exact expected HEAD. The current committed HEAD may legitimately advance beyond the active checkpoint anchor only when all recovery invariants pass. Any unexpected changed path produces `RECOVERY_STATE = DRIFT_DETECTED`.

### Previous checkpoints (historical, all merged)

- PR `#9` (Versioning v1.1 freeze-readiness remediation): merged into `develop` on 2026-10-30.
- PR `#10` (Restart Safety + AI Efficiency v1): merged into `develop` on 2026-10-30.
- PR `#11` (Versioning v1.1 freeze transition): merged into `main` on 2026-10-30.
- PRs `#27` to `#33` (SCMDB location pipeline and its handover): merged into `develop`.
- PR `#34` (Repository Cleanup and Baseline v1: lockfile, handover, dashboard text, `AGENTS.md`/`CLAUDE.md`): merged into `develop` on 2026-11-10.
- PR `#35` (`AGENTS.md` token hygiene and checkpoint rotation to the idle baseline): merged into `develop` on 2026-11-10.
- PR `#36` (Blueprint Ownership / Tracking PR 1: SCMDB blueprint catalog and reward readers): squash-merged into `develop` on 2026-11-11 as `895c153`; reviewed feature head `5077c1f`.
- PR `#37` (DB environment governance v1 FROZEN and checkpoint rotation after PR 1): merged into `develop` on 2026-11-11 as `615a6e9`.
- PR `#38` (`WP-AOM-01` Implementation Gate 1: compact project state, AI operating model, commit-bound Project Lead evidence): merged into `develop` on 2026-11-11 as `0426896`.
- PR `#39` (Blueprint Ownership / Tracking PR 2: database foundation, migration 001): squash-merged into `develop` on 2026-11-11 as `debcd4e`; reviewed head `6cbf71e`. Migration 001 applied to Production on 2026-11-11 under an explicit named owner GO; `DB-ENV-08` postchecks PASS (recorded on PR #39).
- PR `#40` (Blueprint Ownership / Tracking PR 3: LIVE blueprint catalog sync builder and owner-side runner): squash-merged into `develop` on 2026-11-11 as `b24a2e0`; reviewed head `55f9914`. First LIVE sync run on Production on 2026-11-11 under an explicit named owner GO; read-only postchecks PASS (recorded on PR #40).
- PR `#41` (Blueprint Ownership / Tracking PR 4: usable Blueprint UI `/vector/blueprints`): squash-merged into `develop` on 2026-11-11 as `a8ee27c`; reviewed head `c3732cf` (tree identical). UI only; no migration and no Production mutation.
- PR `#42` (checkpoint after Blueprint PR 4, idle baseline): merged into `develop` on 2026-11-11 as `84e7fc3`.
- PR `#43` (Fabricator F1 – Read & Domain Foundation): squash-merged into `develop` on 2026-11-11 as `f1e0dbf` after the owner / Project Lead merge gate; reviewed head and checkpoint control revision `14b50bd`.
- PR `#45` (Fabricator F1.1 – Product Family / Functional Variant Refinement): squash-merged into `develop` on 2026-11-12 as `cc083c9` after the owner merge gate; reviewed head `a83803a`.
- PR `#46` (Fabricator F1.2 – Armor Family Key V2): squash-merged into `develop` on 2026-11-12 as `74d72dc` after the owner merge gate; reviewed head `e08e3bd`, checkpoint control revision `dfb3eac`.
- PR `#44` (Fabricator F2 – Workspace + Recipe + Crew Craftability): squash-merged into `develop` on 2026-11-12 as `706267a` after the owner merge gate.
- PR `#47` (Fabricator F3 – MANUAL Quality per material, Inventory-Aware Preset & Product Stats): squash-merged into `develop` on 2026-11-12 as `a460201` after owner manual acceptance; read-only, no database change, no Production mutation.
- PR `#48` (Governance – `VECTOR_SOURCE_AUTHORITY_V1` FROZEN, documentation only): merged into `develop` on 2026-11-12 as `9aeab14`.
- PR `#49` (Governance – Claude agent structure, Fleet Commander as role holder; documentation only): merged into `develop` on 2026-11-12 as `95caf69`.
- PR `#50` (F4-S – Vehicle Loadout Source Foundation, Option B): merged into `develop` on 2026-11-12 as `210cb07`; derived index and raw source data not committed.
- PR `#51` (read-only database runtime documentation): merged as `6c487f2`; **removed again by PR `#52`** (`36018f2`, 2026-11-13) because the repository is public and such evidence is not allowed in it (`AI_OPERATING_MODEL` section 5). No content is restated here. Security-relevant runtime evidence is kept privately by the owner, not in the repository.
- PR `#53` (checkpoint rotation after PR #52; project identifier removed from the active docs): merged into `develop` on 2026-11-13 as `b28abe7`.
- PR `#54` (public-repo rule, review before merge, runtime read access; `AI_OPERATING_MODEL` v1.2): merged into `develop` on 2026-11-13 as `2e20cf0`.
- PR `#55` (`README.md` unofficial fan project notice): merged into `develop` on 2026-11-13 as `79f7b30`.
- PR `#56` (public-repo boundary clarification, checkpoint rotation after PR #55): merged into `develop` on 2026-11-13 as `6586108`.
- PR `#57` (security hardening H1, reviewed migration `database/migrations/security/001_security_hardening_h1.sql`): merged into `develop` as `a8a4f3b`; applied once to Production under an explicit owner GO, postchecks PASS (recorded on PR #57).
- PR `#58` (no email address in the UI): merged into `develop` on 2026-11-13 as `d569e1e`.
- PR `#59` (Inventory UX v1.1 proposal) and PR `#60` (promotion to FROZEN, `INVENTORY_UX_V1.md` superseded): merged into `develop` on 2026-11-13 as `d7cbfcb` and `9808946`.
- PR `#61` (UX-1 central quality tiers): merged into `develop` on 2026-11-13 as `84ce2ef`.
- PR `#62` (UX-2 design foundations and shell): merged into `develop` on 2026-11-13 as `8b98db7`.
- PR `#64` (UX-3a Mein Inventory / Crew Inventory split): merged into `develop` on 2026-11-13 as `6f10bf1`.

No earlier PR is active. Do not reopen or modify them.

## 2. AUTHORITATIVE STATE POINTERS

These are compact status pointers only. The repository documents themselves must be read for substantive meaning.

- `VECTOR_VERSIONING_V1` = `SUPERSEDED` (file intentionally unchanged for traceability; see `docs/RULE_INDEX.md`)
- `VECTOR_VERSIONING_V1_1` = `FROZEN`
- `VECTOR_SOURCE_AUTHORITY_V1` = `FROZEN` (owner decision 2026-11-12; exact CIG UUID is the only cross-source identity, variants are separate items without unlock inheritance, SCMDB stays crafting authority, scunpacked-data is the designated structural source for F4-S, the Star Citizen Wiki API is a verification source, UEX ingame and UEX marketplace are strictly separate observation domains, `NO_EVIDENCE != NEGATIVE_EVIDENCE`, no single source signal excludes; Production-authoritative after merge into `main`)
- `DB_ENVIRONMENT_GOVERNANCE_V1` = `FROZEN` (owner decision 2026-11-11; `DB-ENV-01` to `DB-ENV-09`; see the owner's private project archive / `main` is Supabase Production holding test data, never "staging"; Production-authoritative after merge into `main`)
- `DATA_CONTEXT_MODEL_V1` = `PROPOSED`
- R2 = `IN_PROGRESS`
- R3 = `RESOLVED`
- R6 = `RESOLVED` (root `AGENTS.md` and `CLAUDE.md` exist on `develop` since PR #34)
- supersession = `EFFECTIVE`
- freeze transition = `EXECUTED` (PR #11, merged into `main` on 2026-10-30)

## 3. OWNER DECISIONS

Compact pointers only. Do not reinterpret these decisions.

- V11-PF-01 = option 1B: Versioning v1.1 before Data Context Model; DCM stays `PROPOSED` and follows later.
- V11-PF-02 = option 2C: Canonical Data Model remains a non-binding forward reference with strict fail-closed interim behavior.
- V11-PF-03 = option 3A: future R3 state is `RESOLVED`, but only during a successfully completed governed freeze transition.
- V11-PF-04: Governance v1 §5.5 is not triggered for the Versioning v1.1 promotion; ADR not required.

The durable rationale and evidence belong in the repository's decision and review records, not in this handover.

## 4. REVIEW STATE

Historical review evidence for the Versioning v1.1 work (PRs #9 to #11, all merged):

- Substantive owner-decision implementation commit: `1e363a2`
- Direct implementation review: Copilot review `5707029494` on `1e363a2`; result: `Approval recommended`; no active/open issues for that reviewed implementation
- Evidence bookkeeping commit: `2da66c9`
- Final known Versioning branch head: `0127581`

No open review finding is tracked in this handover and no review is pending.

Review evidence must always be associated with the exact commit actually reviewed. Later review IDs are not added recursively merely because they reviewed evidence bookkeeping.

## 5. ACTIVE WORK PACKAGE

`UX series` (owner priority, 2026-11-13): design mock-ups approved by the owner; specification `INVENTORY_UX_V1_1.md` FROZEN. Order, one work package per session: UX-1 **DONE**, UX-2 **DONE**, UX-3a **DONE**, UX-3b (material rows with average and range, depth indicator, KPI strip) next, UX-4, UX-5, UX-6. No database change is part of this series.

Previous active package `Fabricator Phase 1`: F1 to F3 are **DONE**; F4 (gameplay relevance) is in the evidence phase. Current state (2026-11-12):

- audits F4-A, F4-A.1, F4-A.2, Star Citizen Wiki API probe and UEX 22-UUID sample audit: **complete** (read-only); UEX identity semantics confirmed (exact CIG UUID), UEX coverage `PARTIAL`; UEX ingame and UEX marketplace strictly separate;
- `VECTOR_SOURCE_AUTHORITY_V1`: decided and documented as FROZEN (`docs/frozen/VECTOR_SOURCE_AUTHORITY_V1.md`);
- F4-S (vehicle loadout source foundation): gate decided by the owner on 2026-11-12 as **Option B** (derived index not committed; licence of scunpacked-data unresolved); implementation **DONE** (PR #50, `210cb07`) (offline generator, schema / provenance, reader with `EXACT` / `STALE` / `UNAVAILABLE`; `docs/workflows/LOADOUT_SOURCE_INDEX.md`);
- F4-B (gameplay relevance / exclusion contract): **not started**;
- UEX integration: **not started**;
- no Supabase / Production mutation.

The earlier Fabricator owner decisions stay as recorded below. Owner-approved plan and decisions are recorded in the F1 pull request; this section is a pointer, not the decision record.

Owner decisions (2026-11-11):

- `D1 = A`: product-family and variant relations come only from deterministic structural source relations (blueprint tag structure within one `attachType`; armor slot from the source `attachType`). Product names may act as a consistency veto only and never create a relation; a structural family contradicted by product identity is `REVIEW_REQUIRED` / ungrouped. No fuzzy or name-only grouping;
- `D2 = C`: F3 starts with one global MANUAL quality value Q0–1000; per-slot quality overrides are `NEXT`, and F1/F3 must not structurally prevent them;
- `D2` superseded for F3 by the owner correction of acceptance points 3 / 4 (2026-11-12): every quality-relevant recipe material (slot) is shown separately and has its own MANUAL quality slider; materials affecting the same stat are never merged on the input side, only their effects combine in the stat (unchanged engine). The global control is a bulk helper only (sets all materials at once, no permanent coupling); each material starts at its own available quality (D-F3-1) or Q500;
- `D3 = A`: modifiers and baseline values are read server-side from the repository-pinned LIVE SCMDB mirror; the mirror version must equal the `ACTIVE` LIVE database dataset version, otherwise fail closed. No LIVE/PTU fallback, no other mirror, no database extension in F1;
- `D4 = A` with contract: when a multiplicative effect is exactly determined by the recipe but no reliable baseline exists, only the relative crafting effect is shown with an explicit note; never derive a synthetic base or crafted value from it;
- `D5`: product and variant hero images stay core. The `public/assets/components` images are UI mockups, not a product image source, and must not be used as product images; a neutral placeholder is allowed in F2 while a reliable image source is investigated.
- `OD-FAB-GROUP-01` (2026-11-12): the armor product-family name veto is scoped to one functional slot (`attachType`) instead of the whole structural line; the structural source contract stays the only mechanism that creates a family or variant relation, the name stays a pure consistency veto; no special rules for individual product names (they are regression cases only);
- `OD-FAB-GROUP-02` (2026-11-12): the functional crafting fingerprint (slot, recipe structure, material identity, quantity, unit, minQuality, modifier property, operation and segments, functional base stats, fingerprint version, dataset version; no display names, no manufacturer, no tags) is a verification / classification contract only: it may confirm functional equality, make a deviation visible and provide review evidence, and never creates a family, joins unrelated products or overrides a structural relation;
- `OD-FAB-GROUP-03` (2026-11-12): structurally related components are classified FUNCTIONALLY_EQUIVALENT, FUNCTIONALLY_DIFFERENT or UNRESOLVED; functionally different items stay in their structural family and the UI must say so in words (not colour only). Calculation always stays concrete-item based; the fingerprint is not a calculation identity and no family-wide stats are synthesized. Short display labels (set / variant / component) are derived only after identity resolution and never create identity;
- `OD-FAB-GROUP-04` (2026-11-12, Armor Family Key V2): for the evidenced armor tag structure `<prefix>_<slot>_<SetNr>_<rest>` the product family identity is `<prefix>` + `<SetNr>`, the component identity is the slot / `attachType`, and the edition / variant identity is the complete structural remainder after the set number (multi-part suffixes such as `hd_sec` are no longer split). Only source structure creates a relation; FCF1, display names, mission data and identical recipes or stats never create a family. No special rules for concrete names;
- `OD-FAB-GROUP-05` to `07` (2026-11-12): the set-01 ADP lines (standard colours, Hurston Edition, Crusader Edition, Modified) form one ADP family; ADP-mk4 stays its own product family / model line and is not normalized into ADP (no synthetic series level); the set-01 Artimex lines (standard, Elysium, Modified) form one family, Artimex Hurston Dynamics Executive Security (set 02) stays separate, no microTech Artimex edition is invented;
- `OD-FAB-GROUP-08` (2026-11-12): Modified items are `VALID_SPECIAL_VARIANT`, stay visible and are never hidden by name; incomplete slot coverage stays visible and is not filled;
- `OD-FAB-UX-01` (2026-11-12, for the later F2 update): after an armor family and variant / edition the workspace offers the pure navigation state `Rüstungsset` (present components with concrete product name, present / not in the dataset, functional-deviation note); it is never an item, blueprint, recipe, aggregated recipe or crafting job, and shows no synthetic recipe and no material sum;
- `OQ-F3-1` (2026-11-12, owner domain evidence): the quality of one recipe input is quantity-weighted over the quantities actually used for the recipe; only the used part of a lot counts (example: 1.0 SCU required, 0.8 SCU Q900 plus 0.2 SCU from a 0.4 SCU Q600 lot gives Q840). For the available preset the required quantity may be composed from several lots, partial use of a lot is allowed for the calculation, and a small high-quality amount that does not cover the requirement never raises the preset; no reservation, consumption or inventory mutation;
- `D-F3-1` (2026-11-12): every recipe slot keeps its own best really available quality (visible); the global MANUAL slider's available preset is the lowest of these slot values (the highest common quality all required slots reach under the global model). It is not an inventory average, not a slot average and not the crafted item quality. Rounding never promises a higher quality than reachable (integer Q0–1000, rounded down). The F2 duplicate-material defect (the same stock counted fully for several slots of one material) is fixed in F3 through the shared selection foundation; `lib/quality/` reuse for later inventory progressive disclosure is approved, without pulling inventory work into F3;
- SCMDB source and semantic reference (owner decision 2026-11-11): SCMDB is the external origin of the mirrored SCMDB dataset, and SCMDB itself (scmdb.net, available SCMDB documentation and traceable SCMDB code) is the preferred source semantic reference for how SCMDB interprets, names, calculates and displays its own raw data. An unclear SCMDB field is neither interpreted from the raw JSON alone nor discarded right away. Evidence order: (1) repository-pinned SCMDB dataset, (2) scmdb.net representation of the same datum, (3) SCMDB documentation, (4) traceable SCMDB implementation, (5) VECTOR adapter / normalizer, (6) tests against the reproduced semantics. SCMDB is **not** an authority for VECTOR user ownership, crew membership, inventory ownership, auth / identity, governance, security or VECTOR-specific domain decisions (SCMDB `isDefault` stays a raw source value only). The planned governance package `SCMDB_SOURCE_AUTHORITY_V1` is absorbed by the FROZEN `VECTOR_SOURCE_AUTHORITY_V1` (2026-11-12).

Sequential pull requests inside this package:

- F1 (**DONE**, #43 as `f1e0dbf`): read and domain foundation in `lib/fabricator/` with tests (family/variant/slot resolution, item-to-blueprint, strict recipe, recipe-to-inventory vocabulary, modifier adapter to `VECTOR_CRAFT_CALC_V1`, baseline allowlist, size, LIVE mirror version guard); no UI, no database change, no Production mutation;
- F1.1 (**DONE**, #45 as `cc083c9`): slot-scoped armor name veto, functional crafting fingerprint and the FUNCTIONALLY_EQUIVALENT / FUNCTIONALLY_DIFFERENT / UNRESOLVED classification; no UI, no database change, no Production mutation;
- F1.2 (**DONE**, #46 as `74d72dc`): Armor Family Key V2 (`OD-FAB-GROUP-04` to `08`; undersuits are no armor-set component); foundation only, no UI, no database change, no Production mutation;
- F2 (**DONE**, #44 as `706267a`): `/vector/fabricator` workspace on the F1.2 foundation, short set / variant / component labels, `Rüstungsset` overview (`OD-FAB-UX-01`), visible functional deviation, recipe materials and crew craftability through the existing `get_active_group_inventory()`; read-only, no inventory mutation;
- F3 (**DONE**, #47 as `a460201`): MANUAL quality Q0–1000 per recipe material plus a global bulk control (owner correction of acceptance points 3 / 4), inventory-aware available preset, quantity-weighted quality primitives (`lib/quality/`), material -> stat relation and product stats (base, crafted, absolute and relative delta) computed per concrete item, targeted SCMDB semantic reconciliation and the F2 duplicate-material craftability fix; read-only, no database change, no Production mutation.

Governance follow-up `SCMDB_SOURCE_AUTHORITY_V1`: absorbed by `VECTOR_SOURCE_AUTHORITY_V1` (FROZEN, 2026-11-12).

Out of scope for the whole package: SMART, MAX and SAVE PREMIUM strategies, reservation, consumption, shopping lists, multi-blueprint planning, simulation fallback, PTU and any database migration.

## 5a. PREVIOUS WORK PACKAGE

`Blueprint Ownership / Tracking` is **complete** (PRs 1 to 4 merged: #36, #39, #40, #41). PR 2's migration is applied to Production; the LIVE catalog `4.10.2-live.12913470` is synchronized and `ACTIVE` in Production; PR 4 delivers the usable UI. This section stays as the record of the package's owner decisions; no work package is active (see section 1). Owner-approved scope and decisions are recorded in the work-package pull requests; this section is a pointer, not the decision record.

Fixed package boundaries confirmed by the owner:

- blueprint definitions are global SCMDB-derived catalog data, readable by authenticated VECTOR users only; there is no anonymous catalog;
- blueprint ownership is personal VECTOR user state (`auth.users` / `profiles.id`), never crew-owned; active-crew members may see each other's known ownership as a derived aggregation only;
- ownership must not require a verified RSI or Star Citizen account; `profiles.primary_game_account_id` is not an ownership precondition;
- a missing ownership row means `ownership not known`, never `not owned`;
- ownership provenance is modelled as `MANUAL` (writable now), `GAME_LOG` and `COMPANION` (prepared, not writable in this package);
- SCMDB `isDefault` is preserved as a raw catalog value only; it is not personal ownership and must not create an ownership rule. SCMDB marks exactly eight blueprints this way and describes them as starter blueprints in its own changelog; that is a source statement, not a rule derived from CIG data;
- ownership model `A` is approved: one current row per user and blueprint, `UNIQUE(user_id, blueprint_id)`; manual removal deletes the row and returns the state to `not known`. Historization is deliberately deferred and becomes mandatory with wipe execution or automatic detection;
- mission and reward relations may be normalized as data in the import package; the `where do I get this?` feature stays `DEFERRED` and out of scope.

Verified SCMDB source findings (mirrored datasets `4.10.2-live.12913470` and `4.10.3-ptu.13032516`; both are covered by `tests/blueprint-reward-sources.test.mjs`):

- reward relations are not unique per `contract + pool + blueprint`: the pools `BP_MISSIONREWARD_NorthRockFPSKill_EliminateBoss` and `BP_MISSIONREWARD_VaughnGenerator_EliminateBoss` each reference one blueprint twice, which SCMDB itself documents in `knownIssues.duplicateReferences` as probable CIG copy-paste errors. Each pool is used by two contracts, so each channel has four duplicate rows (`duplicateSourceRows = 4`). They are real source rows and are kept, never silently deduplicated; a later UI may merge identical statements in a derived view only, and that UI is `DEFERRED`;
- the PTU merged dataset references 14 blueprint identities that neither the PTU nor the LIVE blueprint catalog contains. Owner decision: they stay unresolved. No LIVE fallback, no synthetic blueprint rows, no mapping onto a seemingly matching blueprint; a later PTU import must treat them explicitly as an unresolved source or reference issue. PR 3 stays LIVE-only. The identities are:
  `018a29dc-d128-4697-b181-a885c60ee29c`, `04fa9b45-45a6-4dae-a21d-7a865053fccc`, `06e3f3bc-a75b-4d12-8dd6-fadc0184b88e`, `41f5d2b5-3bbe-42d7-bce6-6c5a4662e51f`, `4394e0c5-8ffc-47aa-be0c-062f3213aa89`, `4454b4bc-fc57-4421-a689-cd4ac8599649`, `61666d7d-06ca-48d2-8dbd-9e245cc129a3`, `62646684-53f5-4ef3-95f8-2022da314aaf`, `98ef4a00-9d0b-4504-8246-178440327138`, `b33bdfb5-6d25-4a7a-86f6-fdf6da4362bb`, `b356eedd-43f0-4c0e-9797-2a864da94735`, `d5737fc2-fd2e-42d4-8246-76bc624c390e`, `e6234718-dfc7-45c5-968e-c8dd1b390caa`, `f43fcac4-3bb2-4cb4-bd01-2768b585209d`.

Owner-approved reward source-occurrence model for PR 2:

- a reward row's identity is one concrete source occurrence inside one SCMDB dataset:
  `UNIQUE (dataset_id, source_contract_id, source_reward_index, source_pool_guid, source_pool_entry_index)`;
- SCMDB has no explicit index field, so `source_reward_index` (position in `contracts[].blueprintRewards`) and `source_pool_entry_index` (position in `blueprintPools[pool].blueprints`) are derived deterministically from the 0-based array positions. Verified unique for every LIVE and PTU row; the duplicates sit at pool positions 7/8 (Vaughn) and 10/11 (NorthRock);
- `blueprint_id` is stored but deliberately not part of the identity key, so a wrong blueprint mapping surfaces as a conflict instead of a second row;
- a repeated import of the same dataset stays idempotent (one dataset row per channel and version, its reward rows replaced in one transaction, following the SCMDB location sync pattern); duplicate business references stay distinct source rows;
- `duplicateSourceRows` stays explicitly measurable: stored on the dataset row, recomputed in SQL by the sync and rejected on mismatch, and asserted by a contract test;
- no reward-row identity is claimed across different dataset revisions; a random UUID alone is not an acceptable identity.

Supabase environment: resolved by the owner on 2026-11-11. see the owner's private project archive / branch `main` is the VECTOR Supabase **Production** environment, currently holding test data without retention value. It must not be called staging. The binding rules are `DB-ENV-01` to `DB-ENV-09` in `docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md`.

Read-only prechecks A to D for PR 2 (run on 2026-11-11 against Production under `DB-ENV-03`; select statements on `pg_catalog`, `pg_indexes` and `pg_policies` only, no mutation):

- A — `is_group_member`, `is_group_admin`, `set_active_group`, `get_active_group_inventory` and `get_my_app_role` all exist, are `SECURITY DEFINER` with `search_path = ''`, and are not defined in this repository. `get_active_group_inventory` is the existing crew-derived read contract: `auth.uid()` required (`AUTH_REQUIRED`), `user_settings.active_group_id` required (`ACTIVE_GROUP_REQUIRED`), membership in a non-archived crew re-validated (`ACTIVE_GROUP_NOT_ALLOWED`), then rows of all `group_members` of that crew;
- B — primary keys `groups(id)`, `group_members(group_id, user_id)`, `user_settings(user_id)`, `profiles(id)`. Foreign keys: `group_members.user_id` and `user_settings.user_id` and `profiles.id` reference `auth.users(id) ON DELETE CASCADE`; `group_members.group_id` references `groups(id) ON DELETE CASCADE`; `user_settings.active_group_id` references `groups(id) ON DELETE SET NULL`; `profiles.primary_game_account_id` references `game_accounts(id) ON DELETE SET NULL`. Checks: member role `OWNER`/`ADMIN`/`MEMBER`, crew name length 3 to 60, nickname `^[A-Za-z0-9_-]{3,24}$`. Leaving a crew deletes the `group_members` row; there is no membership status column;
- C — besides the primary-key indexes: `group_members_user_idx (user_id, group_id)` and the case-insensitive unique `profiles_nickname_lower_uidx (lower(nickname))`;
- D — RLS is enabled and not forced on all four tables. `profiles` is readable by every signed-in user (`profiles_read`) and updatable only by its owner (`profiles_update_own`); there is no INSERT or DELETE policy on `profiles`. The `groups`, `group_members` and `user_settings` policies match the owner's earlier listing.

Consequence for PR 2: the crew blueprint view must re-validate active-crew membership and the archive state itself, exactly like `get_active_group_inventory`; the existing membership helpers must not be its sole authorization boundary. The crew and profile contracts above exist only in Supabase, not as repository migrations; PR 2 contract tests must reproduce them as a test fixture from these precheck results.

Owner decision for PR 2 (2026-11-11): `get_active_crew_blueprint_status()` takes over the crew security contract of `get_active_group_inventory()` exactly — `AUTH_REQUIRED` when not signed in, `ACTIVE_GROUP_REQUIRED` without an active crew, `ACTIVE_GROUP_NOT_ALLOWED` when the active crew is archived or `auth.uid()` is not a member. There is no silent self-only fallback inside the crew function. Own ownership is read independently through the personal ownership read path, so the UI can still show `Du` and `Nicht bekannt` without a valid crew. New `SECURITY DEFINER` functions use `search_path = ''` and fully qualified names. `is_group_member()` is not changed in this work package.

Read-only EXECUTE precheck (2026-11-11, Production, `DB-ENV-03`): the five functions above are owned by `postgres` and executable by `authenticated` only, not by `PUBLIC` or `anon`. New PR 2 functions follow the same grant pattern.

Sequential pull requests inside this package:

- PR 1: checkpoint rotation and the `lib/blueprints/` catalog and reward readers with tests; no database, no UI. **Merged as #36.**
- PR 2: `database/migrations/blueprints/001` with the five tables, RLS and the ownership and crew functions, plus contract tests. **Merged as #39; migration 001 applied to Production, `DB-ENV-08` postchecks PASS.**
- PR 3: the admin synchronization of the LIVE catalog and reward relations into the database; LIVE only, no PTU import, no end-user UI. Owner decisions 2026-11-11: an owner-side local CLI runner (no admin route, no server action, no network-reachable `service_role` endpoint); only the repository-pinned LIVE mirror `4.10.2-live.12913470` (no mirror refresh); dry run by default; the only intended write path is the RPC `sync_scmdb_blueprint_catalog()`. **Merged as #40; first LIVE sync run on Production, read-only postchecks PASS.**
- PR 4: `/vector/blueprints` with the LIVE catalog, search, filters, the personal manual ownership toggle, the non-colour-only status display, the review hint, the sidebar link and the dashboard text. **Merged as #41 (`a8ee27c`).** Owner decisions 2026-11-11: `PR4-OD-01 = B` (after confirmed server success, update ownership locally; no optimistic update before confirmation; no full catalog reload after every toggle); `PR4-OD-02 = A` (show the first 100 filtered and sorted results, `Weitere 100 anzeigen` adds 100 at a time; search, filter and sort work on the fully loaded catalog); `PR4-OD-03 = A` (the one outdated status statement in `database/migrations/blueprints/README.md` is corrected in the checkpoint commit, nothing else in the migration documentation).

Out of scope for the whole package: the `where do I get this?` and mission UI, automatic blueprint detection, Game Log, Companion, RSI linking, Pledge Hangar, an `isDefault` ownership rule, the crafting link, wipe logic and any PTU ownership UI.

Known open items, none of them started:

- after this package: linking Crafting with Crew Inventory (see `SCMDB_LOCATION_HANDOVER.md`);
- a later UX / design pass (not started, not part of any active package): blueprint thumbnails or images, component size, a calmer presentation of `Nicht bekannt`, and the narrow app shell / sidebar on small screens;
- known crew `active_group` inconsistency, deliberately unchanged: when `user_settings.active_group_id` is not set, `getCrewContext()` falls back to the first crew while `get_active_group_inventory()` and `get_active_crew_blueprint_status()` report `ACTIVE_GROUP_REQUIRED` (same behaviour on Inventory and Blueprints);
- older audit scripts `vector_item_data_audit_v2` to `v5` and the `data/audit*` folders: archive or remove only after a separate, explicit decision;
- Rule Index items R2, R4 and R5 remain as listed in `docs/RULE_INDEX.md`.
- open crew authorization and privacy hardening findings, currently rated LOW to MEDIUM. They are not part of the Blueprint work package and are not repaired here. Target: a separate work package `Crew Security Hardening`, to be completed or re-assessed at the latest before the first user outside the current test group. They do not block Blueprint PR 2, because the new crew function must not use the affected helpers as its sole authorization boundary.

OPEN INFRASTRUCTURE WORK (future Spur-B target, owner decision 2026-11-11, not started): separate Supabase contexts for `LIVE` and `PTU` and a separate `DEVELOP` instance for development, preview, automated tests and deployment automation. This is the target picture for its own infrastructure and governance work package only. It is **not** a current DB-environment contract and **not** FROZEN; `DB_ENVIRONMENT_GOVERNANCE_V1` (one Supabase Production environment) stays binding until a governed change replaces it.

Completed packages: `Restart Safety + AI Efficiency v1` (PR #10) and `Repository Cleanup and Baseline v1` (PR #34).

## 6. DO NOT DO

- Do not infer authoritative project state from chat history alone.
- Do not silently continue when Git/PR state differs from the checkpoint.
- Do not change FROZEN rules as part of recovery.
- Do not reopen or modify merged PRs of earlier work packages (#9, #10, #11, #27 to #34).
- Do not change R2/R3 merely to make a workflow checkpoint look complete.
- Do not create recursive review-evidence commits.
- Do not run repository-wide AI audits when a bounded check can answer the question.
- Do not use Max review by default.

## 7. RECOVERY PROCEDURE

### LVCR trust model

The Last Verified Control Revision (LVCR) is the trusted revision containing the owner-validated recovery control block.

- Merged checkpoint: the LVCR is the verified commit on `origin/develop`.
- Unmerged PR checkpoint: the LVCR is the exact owner-confirmed commit recorded in the active PR description under `Checkpoint control revision`.
- The active PR description is the durable LVCR source for an unmerged checkpoint. Chat history and restart prompts may repeat the LVCR for convenience but are not authoritative LVCR sources.
- This handover must not contain its own current commit as the durable trust source.
- A modified handover must not authorize its own changed control fields or changed allowlist.

Fail-closed: recovery produces `RECOVERY_STATE = DRIFT_DETECTED` when the LVCR cannot be determined, the active PR description has no checkpoint control revision for an unmerged checkpoint, the recorded LVCR is not an ancestor of HEAD, the LVCR handover copy cannot be read, the HEAD control block differs from the LVCR control block, or the current handover attempts to widen its own allowlist without owner revalidation and LVCR rotation.

### Procedure

1. Read this handover.
2. Read `CURRENT CHECKPOINT`.
3. Read `NEXT STEP`.
4. Verify the repository root.
5. Run `git status --short`.
6. Run `git branch --show-current`.
7. Run `git rev-parse HEAD` (informational; HEAD is not compared literally).
8. Run `git fetch origin`.
9. Verify the expected branch.
10. Determine the LVCR: merged checkpoint, verified `origin/develop`; unmerged checkpoint, the exact owner-confirmed commit from the active PR description.
11. If the LVCR cannot be determined, emit `RECOVERY_STATE = DRIFT_DETECTED`.
12. Run `git merge-base --is-ancestor <LVCR> HEAD` and require exit code `0`.
13. Read the trusted handover with `git show <LVCR>:docs/handover/VECTOR_RESTART_HANDOVER.md`.
14. Compare the HEAD recovery control block with the LVCR control block.
15. Any control-block difference is `RECOVERY_STATE = DRIFT_DETECTED` until owner revalidation and LVCR rotation have occurred.
16. Using the trusted LVCR control block, run `git merge-base --is-ancestor <anchor> HEAD` and require exit code `0`.
17. Run `git diff --name-only <anchor> HEAD`.
18. Compare every returned path against the allowed scope obtained from the trusted LVCR copy.
19. Any unexpected path is `RECOVERY_STATE = DRIFT_DETECTED`.
20. Verify the working-tree expectation.
21. Verify upstream and remote state when applicable.
22. For an active unmerged PR, obtain its current remote head as an exact 40-character commit OID from the hosting service and require local `HEAD` to equal that remote PR head. If the remote PR head cannot be determined or differs from local `HEAD`, emit `RECOVERY_STATE = DRIFT_DETECTED`. Then verify draft state and checks when applicable.
23. Emit exactly one recovery result:

`RECOVERY_STATE = MATCH`

or

`RECOVERY_STATE = DRIFT_DETECTED`

### MATCH behavior

`RECOVERY_STATE = MATCH` requires every applicable invariant to pass:

- expected branch matches;
- the LVCR can be determined;
- the LVCR is an ancestor of HEAD;
- the HEAD control block equals the trusted LVCR control block;
- the active anchor is an ancestor of HEAD;
- every anchor-to-HEAD path is inside the trusted allowed scope;
- the working-tree expectation matches;
- for an active unmerged PR, its remote head can be determined and exactly equals local `HEAD`; applicable draft-state, check, upstream and other remote expectations match.

When MATCH:

- do not reconstruct old chat history;
- continue directly at `NEXT STEP`.

### DRIFT_DETECTED behavior

`RECOVERY_STATE = DRIFT_DETECTED` includes at least:

- wrong branch;
- LVCR missing or undeterminable;
- LVCR not an ancestor of HEAD;
- unreadable LVCR handover;
- unverified recovery-control-field change;
- mutable allowlist attempting to authorize its own new scope;
- active anchor not an ancestor of HEAD;
- unexpected path after the anchor;
- unexpected dirty working tree;
- material upstream or remote mismatch;
- active remote PR head missing, undeterminable or different from local `HEAD`, or another material PR mismatch.

Later commits alone are not drift when all invariants above still pass.

When drift is detected:

- STOP;
- show expected versus actual;
- do not guess which state is correct;
- reconstruct only the delta necessary to explain the mismatch;
- do not continue at `NEXT STEP` until the drift is reconciled;
- update the handover only after the actual state has been reconciled.

## 8. CHECKPOINT POLICY

### CHECKPOINT_REQUIRED

- owner decision;
- completed review gate;
- work-package completion;
- merge;
- freeze;
- lifecycle transition;
- branch change for a materially different work package;
- long interruption;
- before beginning a materially different high-risk work package.

### NO_CHECKPOINT_REQUIRED

- typo fix;
- citation-only correction;
- push dry-run;
- routine Git command;
- metadata-only maintenance;
- trivial mechanical commit without a state transition.

Avoid checkpoint churn.

### Anchor rotation

Distinct concepts:

- Work-package base: the historical branch origin of the current work package. It does not change during that work package and is not the active recovery comparison anchor.
- Active checkpoint anchor: the verified repository state used by the current checkpoint.
- Current HEAD: the actual branch tip.
- Allowed scope: the path set permitted after the current active checkpoint anchor.
- LVCR: the trusted revision containing the owner-validated recovery control block.

These fields rotate together as one coherent checkpoint and must not be updated independently:

- checkpoint date;
- active work package;
- expected branch;
- base branch;
- work-package base (when a new package begins);
- active checkpoint anchor;
- allowed scope;
- working-tree expectation;
- PR expectations;
- LVCR;
- `NEXT STEP`.

Rotation is required after:

- work-package completion;
- beginning a new major work package;
- a merge establishing a new stable base;
- a lifecycle or freeze transition;
- a material scope change;
- any recovery-control-field change;
- any owner-approved allowlist change.

Routine in-scope implementation commits do not rotate the checkpoint merely because HEAD advances.

A recovery-control-field change remains drift until:

1. it is committed and pushed;
2. deterministic validation passes;
3. the repository owner confirms the new control revision;
4. the active PR description is updated to the new LVCR.

Rotation occurs only after the actual repository state has been verified. The old base, anchor and LVCR remain available through Git history but are no longer active after rotation. A checkpoint must never silently inherit an outdated anchor or allowed path set.

## 9. AI WORK MODE

See `docs/workflows/AI_ASSISTED_DEVELOPMENT_WORKFLOW.md`. Compact summary:

- Tier 0: deterministic Git/CLI work, no agent
- Tier 1: routine AI work, Medium / 328K
- Tier 2: focused semantic reasoning, High / 328K only when justified
- Tier 3: large context only when evidence genuinely requires it
- Lite/Balanced for normal review gates according to risk
- Max only for a justified critical gate

1.1M is capacity, not a quality level.

## 10. NEXT STEP

NEXT STEP: Start UX-3b as its own session and pull request against `develop`: material rows with average and range, depth indicator `Ebene n von 2` in GLOBAL, KPI strip; known item: the anchor jump of `In Mein Inventory bearbeiten` does not expand the collapsed group. Binding specification: `docs/frozen/INVENTORY_UX_V1_1.md`. No Production mutation. Afterwards UX-4 to UX-6; then the owner chooses the next package (candidates: F4-B gameplay relevance / exclusion contract, UEX source foundation). The licence / redistribution decision for scunpacked-data stays open. The future Supabase `LIVE` / `PTU` / `DEVELOP` separation remains open infrastructure work in its own package and is not a current contract.
