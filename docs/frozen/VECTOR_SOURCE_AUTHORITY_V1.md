# VECTOR Source Authority v1

**Status:** FROZEN\
**Version:** 1.0\
**Authority Scope:** External game-data and observation sources for VECTOR reference data: cross-source item identity, variant identity, per-domain source authority, source freshness, evidence discipline and the runtime boundary for external sources\
**Approved By:** project_owner (2026-11-12)\
**Supersedes:** none (absorbs the planned `SCMDB_SOURCE_AUTHORITY_V1` work package noted in the restart handover)

## 1. Purpose

VECTOR uses more than one external source for Star Citizen game data and observations. This contract fixes, before any further source is ingested:

1. which identity joins records across sources;
2. which source is the authority for which domain;
3. how freshness is expressed per source;
4. that missing evidence is never negative evidence;
5. that no single source signal classifies gameplay relevance or excludes a record.

It is a governance contract only. It implements nothing and lifts no existing gate (§19).

Per `VECTOR_GOVERNANCE_V1.md` §5, this FROZEN rule is binding for development on `develop` after its approval merge and becomes Production-authoritative after merge into `main`.

## 2. Evidence base

The contract is derived from the read-only audits recorded on 2026-11-12: F4-A (gameplay relevance / craftability classification), F4-A.1 (vehicle / component evidence), F4-A.2 (scunpacked-data as additional source), the Star Citizen Wiki API probe and the UEX 22-UUID cross-source sample audit. Audit numbers quoted here are sample observations only and must not be extrapolated to the full catalog.

## 3. Global item identity (A)

The exact CIG / Star Citizen entity UUID is the only cross-source identity:

```text
SCMDB output UUID (productEntityClass)
= scunpacked item UUID
= Star Citizen Wiki API item UUID
= UEX item uuid
```

Rules:

- Cross-source joins happen only on the exact UUID.
- No automatic join on names, slugs, manufacturer plus name, tags, product family, fuzzy matching or similar technical properties. A name may be shown as a plausibility aid only.
- A missing UUID match stays `SOURCE_UNAVAILABLE` (source-specific, e.g. `UEX_UNAVAILABLE`) or `UNRESOLVED`. There is no name fallback.
- A source record without a UUID (observed in UEX: `uuid: null`) cannot be joined and stays `UNRESOLVED`.
- Source-local identifiers (for example UEX `id`, `id_item`, `id_parent`, scunpacked `PortId`, Wiki API slugs) remain source-local relation keys and never become VECTOR identity.

Audit evidence: in the UEX sample, three of four non-matches had a UEX record with the same display name but a different, real CIG entity (for example `TrueDef-Pro Arms` as `vgl_armor_light_arms_01_01_microtech` versus the SCMDB output `vgl_armor_light_arms_01_01_01`). Name joins would have produced wrong links.

## 4. Variants (B)

- Every variant or skin is its own item with its own UUID.
- A blueprint unlock applies only to that concrete variant.
- No unlock inheritance between base item, colours, skins, Modified variants or product-family members, and no inheritance through a source-local family relation (for example UEX `id_parent`).
- Product families are grouping and UX only and never a shared gameplay identity (consistent with the Fabricator decisions `D1`, `OD-FAB-GROUP-01` to `08`).

## 5. SCMDB_DATA (C)

`KrovaxCode/SCMDB_DATA`, mirrored in `data/scmdb/`, remains the VECTOR crafting authority for:

- blueprints and recipes, inputs and quantities;
- material / quality modifiers;
- blueprint rewards and reward pools, contract / mission relations, `isDefault`;
- known issues and CIG data issues;
- deltas;
- the existing LIVE / PTU crafting semantics.

Blueprint or recipe existence alone does not prove active gameplay relevance. SCMDB remains no authority for VECTOR user state, ownership, auth, governance or VECTOR-specific domain decisions (owner decision 2026-11-11, restart handover section 5). The provenance of SCMDB's own upstream data is not public and is recorded as `UNKNOWN`; no relation between SCMDB and any other source in this contract is assumed.

## 6. scunpacked-data (D)

`StarCitizenWiki/scunpacked-data` (game-file extraction with the ScDataDumper loader) is the designated supplementary structural game-data source for F4-S:

- ships and stock loadouts;
- ship ↔ component relations;
- ports, hardpoints, sizes, compatible types, required tags;
- editable / uneditable evidence.

`Editable = false` is evidence only and never an exclusion criterion.

**Gate:** F4-S implementation remains STOPPED at the source / distribution gate (unclear licence and redistribution status of the data; persistence of a derived index undecided). This contract does not lift that gate.

## 7. Star Citizen Wiki API (E)

Role: verification and enrichment source, not the primary F4-S bulk authority.

Suitable for targeted UUID cross-checks, vehicle / component verification, port / loadout verification and single normalized detail queries.

Reasons from the probe: the sampled port and loadout signals matched scunpacked-data exactly and version pinning (`?version=`) works, but the API exposes no immutable source revision or commit, historical builds are not guaranteed to remain available, and the source is currently `STALE` relative to the active SCMDB build. The licence of the API code must not be read as a licence for the game data it serves.

## 8. UEX identity (F)

For matched items UEX uses the same CIG UUID semantics.

UEX 22-case sample audit (2026-11-12): 22 cases, 21 lookup-capable outputs, 17 exact UUID matches, 4 `NO_MATCH`, 1 `OUTPUT_UNRESOLVED`; no UUID collision observed; variants carry separate UUIDs. These numbers are sample results and are not extrapolated to the catalog.

UEX coverage is incomplete. A missing UEX match is `UEX_UNAVAILABLE`, never `INVALID`, `IRRELEVANT` or `NOT_IN_GAME`. UEX `id`, `id_item` and `id_parent` stay source-local.

## 9. UEX ingame observation domain (G)

`UEX_INGAME_OBSERVED` is its own domain: observed terminals, locations, buy prices, sell prices, patch / game version, `date_added`, `date_modified` and other observation or freshness evidence.

- Positive terminal evidence: `INGAME_RECORDED`.
- No terminal record: `NO_RECORDED_INGAME_LOCATION`. This explicitly does **not** mean `NOT_AVAILABLE_INGAME`.

## 10. UEX player market domain (H)

`UEX_PLAYER_MARKET` is strictly separate: WTB, WTS, listing prices, currency, quality, listing timestamp, listing expiration and marketplace trends / averages where explicitly provided.

`PLAYER_MARKET_RECORDED` does not prove regular ingame shop availability.

## 11. Hard UEX separation (I)

Ingame terminal evidence and player market evidence are never mixed:

```text
terminal price  !=  player market price
```

Not allowed: common average prices, marketplace fallback for terminal prices, terminal prices presented as player market prices, or a generic unqualified `item_price`.

## 12. UEX privacy (J)

Normalized public VECTOR market evidence carries only item-related fields. Unless a later separate contract requires them, it does not take over username, avatar, personal profile information or contact information from listings.

## 13. Freshness (K)

Freshness is source-specific and is never translated into another source's terms:

| Source | Freshness fields |
|---|---|
| SCMDB | version, channel, build, dataset |
| scunpacked-data | version, channel, build, source commit |
| Star Citizen Wiki API | API game version, channel, build where provided, processed timestamp; no source-commit equivalent is claimed |
| UEX | patch / game version, `date_added`, `date_modified`, VECTOR fetch timestamp |

For structural sources the established states `EXACT`, `STALE` and `UNAVAILABLE` apply. For UEX, which provides a patch version without a full CIG build:

```text
PATCH_MATCH | PATCH_STALE | PATCH_FUTURE | UNKNOWN_PATCH
```

A build match stays `UNKNOWN` while UEX provides no complete CIG build. `STALE`, `UNAVAILABLE` and `UNKNOWN` are freshness states, not negative evidence. LIVE evidence is never used as PTU evidence (`VECTOR_VERSIONING_V1_1.md`).

## 14. Evidence discipline (L, M)

Global rule:

```text
NO_EVIDENCE  !=  NEGATIVE_EVIDENCE
```

Examples: no UEX terminal record does not mean not obtainable ingame; no marketplace listing does not mean not tradeable; no contract reward does not mean the blueprint is impossible to obtain; no scunpacked match does not mean the item is irrelevant.

Every statement derived from these sources is typed as one of:

```text
FACT | INFERENCE | UNKNOWN | OWNER_DOMAIN_EVIDENCE
```

## 15. Metadata conflicts (N)

When the UUID matches exactly but metadata differs (name, manufacturer, type, size):

```text
IDENTITY             = EXACT
METADATA_CONSISTENCY = CONSISTENT | DIFFERENT | SOURCE_FIELD_MISSING | UNRESOLVED
```

Metadata never decides identity. No source silently overwrites another domain authority; a difference is recorded, not corrected (sample example: manufacturer of `Serac` differs between UEX and SCMDB).

## 16. Domain authority matrix (O)

| Domain | Authority |
|---|---|
| Crafting recipe | SCMDB |
| Crafting modifier | SCMDB |
| Blueprint unlock / reward | SCMDB |
| Known crafting issues | SCMDB |
| Ship stock loadout | scunpacked-data / F4-S |
| Port / hardpoint | scunpacked-data / F4-S |
| Port compatibility | scunpacked-data / F4-S |
| Editable evidence | scunpacked-data / F4-S |
| Structural verification | Star Citizen Wiki API |
| Observed ingame shop | UEX ingame |
| Observed ingame price | UEX ingame |
| Player WTB / WTS | UEX marketplace |
| Player market quality / price | UEX marketplace |
| Global item identity | CIG UUID |
| Gameplay relevance | F4-B — NOT YET IMPLEMENTED |

## 17. Runtime boundary (P)

External sources are not queried uncontrolled in the Fabricator hot path:

```text
external sources
  -> controlled ingestion / evidence generation
  -> normalized VECTOR evidence
  -> runtime consumer
```

No large raw datasets and no hundreds of external requests per page view.

## 18. Gameplay relevance and exclusion (Q)

This contract classifies no gameplay relevance. The intended later pipeline is:

```text
SCMDB crafting evidence
+ F4-S structural evidence
+ UEX ingame evidence
+ UEX player market evidence
+ freshness
+ owner review
-> F4-B gameplay relevance classification
```

Only F4-B may later define states such as `RELEVANT_EVIDENCED`, `UNVERIFIED`, `REVIEW_REQUIRED` and `EXCLUDED_REVIEWED`. No single source signal may trigger an automatic exclusion. In particular none of these rules is allowed:

```text
Editable = false        -> exclude
UEX no shop             -> exclude
UEX no marketplace      -> exclude
no contract reward      -> exclude
STALE                   -> exclude
```

## 19. Gates and non-implementation boundary

This contract implements nothing. Still open and unchanged:

- F4-S (vehicle loadout source foundation): STOPPED at the source / distribution gate;
- F4-B (gameplay relevance / exclusion contract): not started;
- UEX source foundation (client, sync, normalized evidence): not started;
- every Supabase Production mutation still requires a separate explicit owner GO (`DB_ENVIRONMENT_GOVERNANCE_V1.md`).

## 20. Relation to other rules

- `VECTOR_VERSIONING_V1_1.md` (FROZEN) stays the authority for LIVE / PTU isolation and build provenance; this contract adds source-specific freshness vocabulary only.
- `PERSISTENCE_PROVENANCE_V1.md` (FROZEN) stays the authority for provenance of persisted data.
- `DATASET_PIPELINE_V1.md` (PROPOSED) names SCMDB as the approved upstream; it must be reconciled with this contract before its own freeze.
- `PROVIDER_AUTHORITY_V1.md` (PLANNED) remains planned for provider direction, capabilities, observations and mutations of user-state providers; this contract covers external reference-data and observation sources only and does not pre-empt it.
