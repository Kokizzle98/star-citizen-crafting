# SCMDB Source Inventory

| Field | Value |
|---|---|
| Version | v1.1 (v1.0 analysed base `1b135de`; `data/scmdb/` is unchanged between the two commits) |
| Status | PROPOSED (analysis and recommendation only; no exclusion is decided here) |
| Base commit | `8f504ef` (`develop`, merge of PR #93) |
| Scope | Every file under `data/scmdb/` (24 files, two channels: LIVE `4.10.2-live.12913470`, PTU `4.10.3-ptu.13032516`) |
| Changes in v1.1 | File count corrected from 23 to 24. v1.0 followed `totalJsonFiles: 23` in `local-mirror-manifest.json`, which does not count the manifest itself. Section 8 added: reconciliation with `docs/reviews/SCMDB_SCHEMA_CATALOG_PROFILE_V1.md`. Used as evidence input by `DATASET_PIPELINE_V1.md` v1.2. |
| Method | Read-only. `git log/show`, `grep`, and one-off Python scripts (not committed). Classification is by content, not by name. |
| Rule applied | OD-DL-04: VECTOR keeps a broad source set. Only demonstrably technical artifacts may be excluded. Uncertain means RETAIN or REVIEW. |

This document contains structure and counts only. No upstream data is copied into it.

## 1. Limits of this analysis

- **Upstream was not accessed.** `KrovaxCode/SCMDB_DATA` was not queried. Everything below comes from this repository's files and git history.
- **The mirror history is short.** `data/scmdb/` has 7 commits, spanning 2026-10-26 to 2026-10-29 (4 days). Change-rhythm statements describe that window only. They are not a long-term cadence.
- **Intermediate syncs are only partly comparable.** Of the seven commits, one is a partial first import (`5ded067`), one is the first full import (`c5a7bf9`), and four touched only the manifest. Content comparisons use the first full import (`c5a7bf9`) against the latest sync (`e271759`).
- **Field meaning is inferred from names and values.** For example, the community-vote fields in `mema-cache.json` are read as upstream site data. No upstream documentation was consulted.
- **The existing review was not used as input.** v1.1 compares it with these findings afterwards (section 8).
- **Tests and lint were not run.** The change is a single documentation file.

## 2. Classification table

Sizes are in bytes. "LIVE/PTU" rows describe a pair of per-build files. `Consumers` lists code that reads the file at run time or in CI. Tests that only read it as a fixture are noted as "tests".

| File | Content summary | Class | Change rhythm (evidence) | Consumers | Recommendation | Evidence |
|---|---|---|---|---|---|---|
| `merged-<build>.json` (LIVE 12,854,995 / PTU 12,927,690) | Object with 17 keys. Game-derived contract and pool data: `contracts` (1565 / 1577), `legacyContracts` (291), `blueprintPools` (160 / 175), `locationPools` (959 / 958), `resourcePools`, `shipPools`, `cargoManifestPools`, `factionRewardsPools`, `factions`, `regions`, `scopes`, `eventScopes`, `ships`. | GAME_DATA | Renamed per build. At the PTU build change, 6 sections changed (`locationPools`, `blueprintPools`, `shipPools`, `ships`, `contracts`, `legacyContracts`). LIVE file unchanged since import. | `lib/blueprints/blueprint-reward-extractor.ts` (`contracts`, `blueprintPools`); `lib/scmdb/location-extractor.ts` (`locationPools` only); `scripts/sync-scmdb-blueprint-catalog.mjs`; audit v6; tests | RETAIN | Content diff `c5a7bf9` to `e271759`; grep. |
| `crafting_blueprints-<build>.json` (4,245,240 / 4,248,248) | `meta` (1618 / 1619 blueprints), `dismantle`, `properties` (29), `resources`, `items`, `blueprints[]` with `guid`, `tag`, `productEntityClass`, `tiers`. | GAME_DATA | PTU build change altered `meta` and `blueprints` (+1). LIVE unchanged. | `lib/blueprints/blueprint-extractor.ts`, `blueprint-dataset.ts`; `lib/fabricator/fabricator-live-source.ts` (LIVE); `lib/inventory/material-units.ts` (LIVE); `src/data.js`; `scripts/sync-scmdb-blueprint-catalog.mjs`; preflights; audit v6; tests | RETAIN | Same diff; grep. |
| `crafting_items-<build>.json` (1,318,558 / 1,321,447) | `meta` (1616 / 1617 items: 271/272 weapons, 922 armor, 379 ship components), fire-mode, ammo and magazine pools, `manufacturers`, `items[]` with `entityClass`, `itemType`, `size`, `grade`. | GAME_DATA | PTU build change altered `meta`, `fireModesPools`, `ammoPools`, `items`. LIVE unchanged. | `lib/fabricator/fabricator-live-source.ts` (LIVE); `src/data.js`; `tests/fabricator-fixture.mjs`; preflight; audit v6 | RETAIN | Same diff; grep. |
| `mining_data-<build>.json` (388,113 / 388,112) | `meta` (50 locations, 39 elements, 63 compositions), clustering presets, quality distribution, refinery profiles. | GAME_DATA | LIVE and PTU are identical apart from the `version` string. The PTU build change altered no section. | Audit v6 only (via `latest.json` file names). No runtime consumer. | RETAIN | Equality check LIVE vs PTU; diff across PTU builds. |
| `mining_equipment-<build>.json` (51,194 / 51,193) | `meta` (18 lasers, 29 modules, 6 gadgets), `globalParams`, `mineableElements` (42). | GAME_DATA | Same as `mining_data`: identical across channels apart from `version`; unchanged across PTU builds. | Audit v6 only. No runtime consumer. | RETAIN | Same checks. |
| `mission-history-<build>.json` (175,533 / 175,382) | `schema`, `channel`, `current_version`, `generated_at`, `versions_seen` (4 builds), `missions` (1593 / 1578) mapping mission id to `first_seen` / `last_seen`. | SOURCE_EVIDENCE | PTU build change: 2 missions added, 1576 unchanged, none edited. `generated_at` changes per build. | Audit v6 only. No runtime consumer. | RETAIN | Per-entry diff `c5a7bf9` to `e271759`. |
| `cig_data_issues-<build>.json` (23,706 / 23,706) | Known CIG data errors annotated by upstream: `blueprintRecords` (5), `blueprintPools` (2), `entities` (14), `contracts` (3), plus `_comment` fields. | SOURCE_EVIDENCE | LIVE and PTU are byte-identical. Unchanged across the PTU build (pure rename). | Audit v6 only. | RETAIN | `cmp` LIVE vs PTU; rename similarity 100%. `VECTOR_SOURCE_AUTHORITY_V1` section 5 lists CIG data issues as SCMDB authority. |
| `deltas-live.json` (6,340,548) | `environment`, `pairs[]` (26): per build pair, added / removed / changed counts and sets for missions, blueprint pools, scopes, event scopes, blueprints, items, resources. | BUILD_DIFF_EVIDENCE | Not changed after import. | None at run time. Frozen authority lists deltas. | RETAIN | Grep (no consumer); `VECTOR_SOURCE_AUTHORITY_V1` section 5. Usable as cross-check fixture for the later domain precheck. |
| `deltas-ptu.json` (12,663,491) | Same shape, 63 pairs. | BUILD_DIFF_EVIDENCE | One pair appended at the PTU build change (`12999338` to `13032516`). | None at run time. | RETAIN | Pair count 62 to 63. Same fixture use. |
| `changelog.json` (115,137) | 88 entries `{version, date, changes[]}` with typed notes (`feat`, `improve`, `fix`, `data`, `chore`). Versions are SCMDB site releases (1.0.66 down to 0.9.1), not game builds. Some notes describe new game builds. | SOURCE_EVIDENCE | One entry added (1.0.66) at the latest sync. Not touched by the other syncs. | `sync-scmdb-data.yml` validates it as JSON only. | RETAIN | Entry count 87 to 88. |
| `latest.json` (1,306) | Schema 2. Per channel: `version`, `generated_at`, and the `files` map naming every per-build file. | IDENTITY_INDEX | Changed at the PTU build change (new file names, new `generated_at`). | Central: fabricator, loadout reader, material units, blueprint sync script, location and reward extractors (tests), preflights, audit. | RETAIN | Grep: the primary entry point for almost all readers. |
| `game-versions.json` (190) | Array of `{version, file}` for the current PTU and LIVE builds. | IDENTITY_INDEX | Changed at the PTU build change. | `sync-scmdb-data.yml` (must exist and parse). | RETAIN | Grep. |
| `versions.json` (190) | Byte-identical to `game-versions.json`. | IDENTITY_INDEX | Same as `game-versions.json`. | `sync-scmdb-data.yml` (must exist and parse). | RETAIN | `cmp` shows identical. Redundancy is a possible later REVIEW topic, but the sync workflow requires both names. |
| `local-mirror-manifest.json` (1,640) | Written by this repository's sync workflow, not by upstream. `source`, `generatedAt`, `totalJsonFiles`, per-dataset file lists, `staticFiles`. | VECTOR_OWN | Changed in all 5 syncs after the first full import (`c5a7bf9`). In 4 of them (`eaf4f77`, `a344fb2`, `130022a`, `e11f51d`) it was the only file touched; the change is the `generatedAt` timestamp. | `src/data.js` (legacy front end); `vector-scmdb-preflight.yml`; `vector-release-preflight.yml` | RETAIN_NO_TRIGGER | Per-commit file list. A timestamp-only change has no domain meaning. |
| `mema-cache.json` (697,276) | Array of 838 per-contract aggregate rows keyed by `contract_id`: sample counts, duration and rate percentiles, party-size splits, `top_ships`, `updated_at`, and vote counters (`votes_up_patch`, `votes_down_patch`, `votes_down_7d`, `bug_reasons`). | VOLATILE_DERIVED_STATISTIC | Changed in 1 of 5 syncs after the first full import (`e271759`): 56 of 835 rows changed, 3 rows added, none removed. | None in repo code. Audit v6 does not list it. | RETAIN_NO_TRIGGER | Row-level diff; see section 4. |
| `site-settings.json` (755) | Upstream site configuration: feature flags (`blueprints_enabled`, `ptu_enabled`, `mema_enabled`, `require_rsi_for_entries`), cache interval and last refresh, and `scenario_overrides` per channel (named game event scenarios set true or false). | Mixed: TECHNICAL_ARTIFACT plus possible GAME_DATA | Changed in 1 of 5 syncs after the first full import: `ptu_enabled` false to true, `updated_at`, and `mema_cache_last_refreshed`. | None found in repo code. | REVIEW | See section 4. `scenario_overrides` names game events; relevance is unknown. |
| `workflow-state.json` (93) | Two keys: `mema_cache_interval_hours`, `mema_cache_last_refreshed`. | TECHNICAL_ARTIFACT | Changed in 1 of 5 syncs after the first full import: the timestamp only. | None found in repo code. | EXCLUDE_CANDIDATE | Both keys also appear with the same values in `site-settings.json`. See section 4. |

## 3. Domain to source-file map

The repository reads the **LIVE channel only** for runtime work (`AGENTS.md`: no cross-channel fallback). Readers resolve file names through `latest.json`.

| Domain | Source file(s) | Reader | Notes |
|---|---|---|---|
| Blueprints (catalog) | `crafting_blueprints-<build>.json` | `lib/blueprints/blueprint-extractor.ts`, `blueprint-dataset.ts`, run by `scripts/sync-scmdb-blueprint-catalog.mjs` | Needs `latest.json`. |
| Reward sources | `merged-<build>.json` (`contracts`, `blueprintPools`), joined with the blueprint catalog | `lib/blueprints/blueprint-reward-extractor.ts`, run by the same script | Rejects a merged file whose `version` differs from the manifest. |
| Locations | `merged-<build>.json` (`locationPools` only) | `lib/scmdb/location-extractor.ts` via `location-dataset.ts` | No runtime or script caller found. Only tests call it. Migrations `database/migrations/scmdb/001` to `007` contain no references to mirror file names. |
| Crafting Items / Fabricator | `crafting_blueprints-<build>.json` + `crafting_items-<build>.json` | `lib/fabricator/fabricator-live-source.ts` (reads LIVE names from `latest.json`; PTU never consulted); `lib/inventory/material-units.ts` reads the blueprints file | The legacy `src/data.js` front end reads both files for LIVE and PTU through `local-mirror-manifest.json`. |
| Loadout | `latest.json` only (see below) | `lib/loadout-source/loadout-source-read.ts` | Reads the LIVE version from `latest.json` to judge whether its own index is stale. |
| Mining, mission history, CIG issues | `mining_*`, `mission-history-*`, `cig_data_issues-*` | Audit script `vector_item_data_audit_v6_multisource.py` (CI: `vector-item-data-audit.yml`) | No runtime consumer. |

### Loadout: what is known and what is not

- **Known.** The only SCMDB file the loadout code reads is `latest.json`, to get the LIVE build version. The loadout data itself comes from a git-ignored derived index. `scripts/generate-loadout-source-index.mjs` builds it from a local `scunpacked-data` checkout (`ships/*.json`). That script has no reference to `data/scmdb/`. `getLoadoutSource` has no caller outside its own module. `docs/workflows/LOADOUT_SOURCE_INDEX.md` states that nothing in the application uses the index yet.
- **Unknown.** Whether a future loadout feature will join SCMDB data. Candidates are `crafting_items` (379 ship components in the LIVE `meta`) and `mining_equipment`. The join key (SCMDB `entityClass` against the index's component UUIDs) is not verified. Until that is decided, no loadout-related SCMDB file can be called unnecessary.

## 4. Explicit statements

### mema-cache.json is a non-trigger

- **Content.** Per-contract aggregate statistics and vote counters. These look like upstream community or site data, not game-file data. Class: VOLATILE_DERIVED_STATISTIC.
- **Verified.** The configured refresh interval is 12 hours (`mema_cache_interval_hours: 12` in both `site-settings.json` and `workflow-state.json`). Content changes are statistical drift: 56 of 835 rows changed, all with a new `updated_at`, and 3 rows were added.
- **Refined (not what the hypothesis said).** The file did **not** change on almost every sync. It changed in 1 of 5 syncs after the import. The file that changes almost every sync is `local-mirror-manifest.json`. The two recorded refresh stamps (2026-10-23 and 2026-10-28) are five days apart, so the 12-hour cadence is the configured value, not an observed one.
- **Recommendation.** RETAIN, but a change in `mema-cache.json` alone must never count as a change trigger. The same holds for the timestamp keys it co-changes with.

### Exclusion candidates

- **workflow-state.json: EXCLUDE_CANDIDATE.** Evidence is conclusive on content. It has 2 keys. Both are duplicated, with identical values, in `site-settings.json`. No repository code reads it. Its only change in the history moved the refresh timestamp together with `mema-cache.json`. Not verified: whether upstream tooling needs the file. The sync workflow copies the whole upstream `data/` directory with `rsync --delete`, so an exclusion would be a mirror-filter decision for the owner.
- **site-settings.json: REVIEW, not a clean exclusion.** The hypothesis is only partly confirmed. Most keys are site operation flags and timestamps (technical). `scenario_overrides` lists named in-game event scenarios per channel (for example a holiday event) set to true or false. It could affect how contracts or pools should be read. Nothing in the repository uses it today, but the relevance cannot be ruled out. Under OD-DL-04 this is REVIEW. If the owner later decides `scenario_overrides` is irrelevant, the remainder is a technical exclusion.

## 5. Files that make a precheck hard

- **`merged-<build>.json`.** One 12.9 MB file feeds at least two domains (reward sources via `contracts` and `blueprintPools`, locations via `locationPools`). Its other sections (`factions`, `ships`, `shipPools`, `cargoManifestPools`, `scopes`, and others) have no consumer today. A whole-file fingerprint would trigger on any section. A domain precheck would need per-section fingerprints. The `deltas-*.json` pairs list added, removed and changed counts per section and can serve as cross-check fixtures.
- **`crafting_blueprints` and `crafting_items`.** Their `meta` blocks change with every content change, so `meta` is not an independent signal.
- **`latest.json` and the two version files.** They change on every build (file names, `generated_at`). They are identity, not content, so a precheck should read them for naming only.
- **Per-build file names.** A new build renames every per-build file (similarity 99 to 100%). A path-based change trigger fires on every build even for files whose content is identical (`mining_*`, `cig_data_issues-*`).
- **Existing CI path filters.** `vector-scmdb-preflight.yml`, `vector-release-preflight.yml` and `vector-item-data-audit.yml` already trigger on `data/scmdb/**`. Today, a change in `mema-cache.json` or `local-mirror-manifest.json` alone starts those workflows.

## 6. Other observations

- `versions.json` and `game-versions.json` are byte-identical.
- LIVE and PTU copies of `cig_data_issues`, `mining_data` and `mining_equipment` are content-identical apart from the version string. The data hardly varies by channel. Only the file name does.
- `sync-scmdb-data.yml` mirrors the entire upstream `data/` directory with `rsync --delete` and then generates `local-mirror-manifest.json` itself. Any exclusion must be implemented there. That is out of scope here, as is the known push failure of that workflow.

## 7. Open questions

1. Does `KrovaxCode/SCMDB_DATA` show a longer change history per file than the 4 days visible here? Not checked, because upstream was not accessed.
2. Is the `mema-cache.json` refresh really every 12 hours upstream? Only two refresh stamps were available.
3. Does upstream tooling depend on `workflow-state.json`?
4. Does `scenario_overrides` in `site-settings.json` matter for contract availability, and who maintains it?
5. Will loadout planning ever read SCMDB files beyond `latest.json`, and through which join key?
6. Should `versions.json` and `game-versions.json` stay as two names (the sync workflow requires both), or does upstream plan to retire one?
7. Answered in v1.1 (section 8): the review is a non-normative `REVIEW_RECORD` about catalog structure. This inventory covers file classification. They complement each other.

## 8. Reconciliation with SCMDB_SCHEMA_CATALOG_PROFILE_V1

`docs/reviews/SCMDB_SCHEMA_CATALOG_PROFILE_V1.md` (added in `637730e`, 2026-10-29) is registered in `RULE_INDEX.md` as a non-normative `REVIEW_RECORD`. It profiles catalog-capable fields. This inventory classifies whole files. That file is not edited here.

### Agreements

- **Source families.** All 12 families the review names are present here: the 7 per-build families, the 2 `deltas-*` files, and `latest`, `game-versions` and `versions`.
- **Known source issues.** The review treats CIG/SCMDB issue annotations as a reason to preserve source classification. This inventory classes `cig_data_issues-*` as `SOURCE_EVIDENCE` and retains it.
- **Channel and build separation.** Both find clean LIVE/PTU separation by build string.
- **No whole-tree query surface.** The review recommends bounded read models instead of loading full raw JSON. That matches the finding that `merged-*.json` feeds several domains and needs per-section treatment.
- **Catalog structure.** Its required changes to `DATASET_PIPELINE_V1` (review §12) were already absorbed in pipeline v1.1. Nothing here contradicts them.

### Differences and conflicts

- **Coverage.** The review does not cover `changelog.json`, `mema-cache.json`, `site-settings.json`, `workflow-state.json` or `local-mirror-manifest.json`, although they were present in the mirror on 2026-10-26. This inventory classifies them. That is a coverage gap, not a contradiction.
- **Stale PTU build.** The review cites PTU `4.10.3-ptu.12999338`. The mirror moved to `4.10.3-ptu.13032516` in `e271759` on 2026-10-29. The review's counts are therefore a snapshot of the earlier PTU build.
- **Wipe scope (conflict with current proposals, not with this inventory).** Review §10 describes channel-scoped mutable state tables and a PTU wipe of PTU state. Pipeline v1.1 and later, and FROZEN `VECTOR_VERSIONING_V1_1.md`, define a single Production User State in v1. In those documents, PTU-native state is only a future extension. The review is historical evidence on this point and does not override them.
- **Naming.** The review writes `mission_history` (the `latest.json` key). The files are named `mission-history-<build>.json`. Same data.
- **Evidence base.** The review used the V4/V5 audit outputs. The current audit consumer is `vector_item_data_audit_v6_multisource.py`. Not re-checked whether the V4/V5 field observations still hold for the current builds.

No difference requires a change to the classes or recommendations in section 2.
