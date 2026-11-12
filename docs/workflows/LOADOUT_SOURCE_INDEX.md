# VECTOR Loadout Source Index

- **Status:** OPERATIONAL (non-normative)
- **Version:** 1.0
- **Base commit:** `95caf69171a9009994c6617f44d81bdad565bef7` (`develop` after PR #49)
- **Work package:** F4-S – Vehicle Loadout Source Foundation, owner decision at the source / distribution gate: **Option B** (2026-11-12)
- **Scope:** how to generate and read the derived scunpacked-data loadout index locally
- **Does not override:** `docs/frozen/VECTOR_SOURCE_AUTHORITY_V1.md`, `docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md`, `docs/frozen/VECTOR_VERSIONING_V1_1.md`

## 1. What it is

A read-only, component-UUID-centred evidence layer derived from `StarCitizenWiki/scunpacked-data`:

```text
component UUID -> vehicle(s) -> port(s) with hardpoint, min/max size, compatible types, required tags, editable
```

It copies source evidence and nothing else. It classifies nothing, filters nothing, hides nothing and excludes nothing (that is F4-B). It has no UEX or Wiki API link and no UI. Identity is the exact CIG UUID only; class names and display names are descriptive and never match anything. Multi-vehicle and multi-port relations are kept completely. Summary signals (for example `onlyOnUneditablePorts`) are additional and never replace those relations. `Editable = false` is evidence only, never an exclusion reason. `NO_EVIDENCE` is not `NEGATIVE_EVIDENCE`.

## 2. Option B and the open licence question

**scunpacked-data has no licence file; redistribution is unresolved.** Therefore, by owner decision (Option B), neither the scunpacked-data raw files nor the derived index is committed to this repository:

- the generator output path `data/derived/` and the conventional checkout location `data/external/` are listed in `.gitignore`;
- a test asserts that both stay ignored and that nothing under them is tracked;
- tests use synthetic, self-invented fixtures only.

The licence question stays open. Until it is resolved, the index exists only on the machine that generated it. On Vercel (and in CI, and in any fresh clone) it is absent, and the reader reports `UNAVAILABLE`.

## 3. Generate the index locally

Prerequisites: Node 20+, `npm ci` done, and a local scunpacked-data checkout pinned to one commit (only `ships/` is read; a sparse checkout of `ships` is enough). The audit state is commit `1340c8303709904165e2da0fa7060bce0624260b`, build `4.10.2-LIVE.12881860`.

```powershell
git clone --filter=blob:none https://github.com/StarCitizenWiki/scunpacked-data data/external/scunpacked-data
git -C data/external/scunpacked-data checkout 1340c8303709904165e2da0fa7060bce0624260b
node scripts/generate-loadout-source-index.mjs --source data/external/scunpacked-data --expect-commit 1340c8303709904165e2da0fa7060bce0624260b
```

Default output: `data/derived/loadout-source/scunpacked-live-loadout-index.json` (git-ignored, about 16 MB for the audit commit). `--out <file>` writes elsewhere (never inside the source checkout).

The generator is offline: no network, no database, no Supabase or Vercel action. It blocks (exit code 1, nothing written) when the checkout has modified tracked files, `--expect-commit` does not match, the commit subject is not a parseable LIVE build, a ship file is missing or malformed, or the source violates the expected structure. The same commit always yields byte-identical output (no timestamp inside).

Provenance stored in the index: source commit, game build (the scunpacked-data commit subject, for example `4.10.2-LIVE.12881860`), channel (`LIVE` only), format version and generator version.

## 4. Reading it

`lib/loadout-source/loadout-source-reader.ts` (pure) and `lib/loadout-source/loadout-source-read.ts` (server-only, read-only file access) compare the index with the active SCMDB LIVE version from `data/scmdb/latest.json`:

| Freshness | Meaning |
|---|---|
| `EXACT` | same game version and build number |
| `STALE` | LIVE index, but another build (`BUILD_OLDER`, `BUILD_NEWER`, `VERSION_DIFFERENT`); the evidence is still returned, `STALE` is not negative evidence |
| `UNAVAILABLE` | no usable index: `INDEX_MISSING`, `INDEX_UNREADABLE`, `INDEX_INVALID`, `CHANNEL_MISMATCH` or `EXPECTED_BUILD_INVALID` |

A missing or invalid index never crashes and never falls back to names or another source. LIVE and PTU are never mixed; PTU evidence is not produced and stays `UNAVAILABLE`.

`lookupLoadoutComponent(state, uuid)` answers `FOUND`, `NO_EVIDENCE`, `INVALID_UUID` (anything that is not a canonical lower-case UUID, including names) or `UNAVAILABLE`.

At the audit commit the index is `STALE` (`BUILD_OLDER`) against SCMDB `4.10.2-live.12913470`. Nothing in the application uses the index yet.

## 5. Not covered here

Gameplay relevance and exclusion contract (F4-B), UEX integration, Wiki API verification, UI, any database table, and the licence decision for scunpacked-data.
