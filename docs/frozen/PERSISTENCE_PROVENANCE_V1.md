# VECTOR Persistence & Provenance v1

**Status:** FROZEN  
**Version:** 1.0  
**Scope:** Persistence classes, ownership provenance, game-state epochs, source provenance, historical invalidation, dataset/build context, wipe semantics and auditability

## 1. Purpose

This document defines the binding persistence and provenance rules for VECTOR.

VECTOR must always distinguish between:

- what an entity is;
- who owns it;
- where it came from;
- which Star Citizen game-state period it belongs to;
- which dataset/build was used to interpret it;
- whether it is currently active, invalidated, wiped, consumed, sold or archived;
- which source or operation established or changed that state.

Persistence and provenance are domain semantics. This document does not freeze a final PostgreSQL schema.

## 2. Core separation of domains

VECTOR must keep the following domains logically separate:

1. platform identity and authorization;
2. master data;
3. user-owned platform records and saved plans;
4. current Star Citizen game state;
5. historical Star Citizen game state;
6. external-source identities and source records;
7. derived calculations and publications.

A Star Citizen wipe or dataset update must never be treated as permission to delete unrelated platform identity, crew membership, saved planning or audit history.

## 3. Internal identity is authoritative

- VECTOR internal UUIDs are authoritative for VECTOR entities.
- SCMDB, RSI/CIG, UEX, Discord, watcher and other provider identifiers are external identities only.
- External identifiers may map to internal entities but must not replace internal identity.
- Provider identifier changes must not create a new VECTOR entity when deterministic provenance proves that the underlying entity is unchanged.
- Uncertain external identity matches are never guessed.

## 4. Persistence classes

VECTOR distinguishes persistence semantics by asset/state type.

Canonical conceptual persistence classes are:

```text
PLATFORM
PLEDGE
GAME
TEMPORARY
```

Additional specialized classes may be introduced later when required, but they must preserve the semantic distinctions below.

### 4.1 PLATFORM

Platform records survive Star Citizen game wipes by default.

Examples include:

- VECTOR user/profile identity;
- crew membership and authorization;
- saved configuration and user preferences;
- audit history;
- saved plans unless a specific rule states otherwise.

### 4.2 PLEDGE

Pledge-backed assets have persistence semantics independent from ordinary in-game-earned assets.

- Pledge provenance must remain distinguishable.
- A Star Citizen game wipe does not automatically imply loss of the VECTOR record representing pledge ownership.
- The current in-game state or loadout of a pledge asset may still be affected by a wipe independently from the ownership record.

### 4.3 GAME

GAME records represent Star Citizen game-state-dependent assets or state.

Examples may include:

- in-game-acquired ships;
- inventory lots;
- in-game-purchased or looted items;
- wallets;
- progression state;
- refinery jobs;
- actual loadout state.

GAME records are associated with the applicable game-state epoch where the domain requires it.

### 4.4 TEMPORARY

TEMPORARY records represent assets/states whose validity is explicitly limited or non-persistent, such as rentals, loaners or temporary game-state objects where applicable.

Temporary provenance must not be silently promoted to permanent ownership.

## 5. Acquisition provenance

Persistence class and acquisition source are separate concepts.

Where known, VECTOR preserves acquisition provenance such as:

```text
RSI_PLEDGE
INGAME_PURCHASE
MINED
LOOTED
CRAFTED
REWARD
IMPORT
WATCHER
MANUAL
```

The exact controlled vocabulary may be refined by domain-specific specifications.

Binding rules:

- acquisition provenance must not be inferred when it is unknown;
- `UNKNOWN`/unresolved provenance is preferable to a guessed source;
- changing an asset's current state must not erase known acquisition provenance;
- source/provider provenance and user acquisition provenance are not the same concept.

## 6. Game versions and epochs

VECTOR distinguishes a game-data build from a persistent game-state epoch.

### 6.1 Game/data build

A game/data build identifies the Star Citizen build/dataset context used for master data and interpretation.

The canonical VECTOR release identifier follows `VECTOR_VERSIONING_V1.md` and always references the approved LIVE build.

### 6.2 Game-state epoch

A game-state epoch represents a persistent state period for a channel between relevant reset boundaries.

Binding rules:

- game-state-dependent records may reference the epoch in which they exist;
- a new epoch may be created when a relevant wipe/reset requires separation of old and new state;
- historical records from an earlier epoch remain traceable;
- an epoch is not the same thing as a game build: several builds may occur without a state reset, and a reset boundary must not be inferred solely from version numbering.

## 7. Dataset channel isolation

Persistence/provenance processing respects VECTOR's strict dataset isolation.

- LIVE and PTU are separate dataset contexts.
- No LIVE/PTU cross-channel fallback is permitted.
- Dataset-dependent interpretation must use exactly one active channel.
- Missing PTU data must not be completed from LIVE data and vice versa.
- Both channels are subject to the Completeness Filter.
- The canonical combined VECTOR identifier continues to use the approved LIVE build even when PTU is the active UI dataset context.

## 8. Source provenance

Externally sourced master data and derived values must be traceable to their source context.

Provenance should retain, where applicable:

```text
provider/source
external identity or source record
channel
full game build
dataset revision
source revision
extracted/imported timestamp
validated timestamp
activation status
```

Exact physical columns are implementation details, but equivalent provenance must remain available.

## 9. SCMDB provenance

The SCMDB mirror / extracted SCMDB data is VECTOR's primary Star Citizen game-data source according to the current architecture direction.

Binding persistence/provenance rules:

- source extraction does not immediately imply activation;
- extraction, normalization, completeness validation and activation are distinguishable stages;
- repeated extraction of the same LIVE build may produce a new dataset revision without changing the VECTOR application version or SC build;
- raw/source provenance must remain sufficient to investigate how an active normalized result was produced;
- incomplete or orphaned source records must not silently become trusted calculated output.

The detailed pipeline and source-adapter implementation belong to the Dataset Pipeline specification.

## 10. User-owned data versus external master data

User assets and external master data must not be conflated.

Examples:

- an inventory lot is a user-owned/game-state record;
- its item/material definition is master data;
- a concrete user-owned ship is a user asset;
- its ship model, hardpoints and factory loadout are master data.

Binding rules:

- a dataset refresh must not create or delete user ownership merely because external master data changed;
- unresolved master-data mapping must be represented as unresolved/incomplete rather than silently remapped;
- future successful remapping should preserve the identity/history of the user-owned record wherever deterministically possible.

## 11. Status and historization

State transitions must preserve history when the previous state remains relevant for audit, wipe recovery, reconciliation or planning.

Conceptual statuses may include domain-specific values such as:

```text
ACTIVE
RESERVED
CONSUMED
SOLD
WIPED
INVALIDATED
RESET
ARCHIVED
REVOKED
UNVERIFIED
```

Not every domain uses every status.

Binding rule:

> A state transition is not equivalent to deletion.

Records affected by wipes, reconciliation, revocation or lifecycle completion should be historized/inactivated when history is required instead of blindly deleted.

## 12. Star Citizen wipe semantics

A Star Citizen game wipe is a data-driven state transition, not a platform wipe.

Binding principles:

- platform identity survives;
- crew membership survives;
- platform authorization survives;
- audit history survives;
- canonical master data is not deleted merely due to a game wipe;
- saved plans survive unless a specific wipe/planning rule says otherwise;
- affected game-state records are invalidated, reset, historized or recalculated according to explicit domain rules;
- different domains may be affected independently;
- wipe effects must not be guessed from generic assumptions when the announced scope is unknown.

Detailed wipe configuration/execution belongs to `GAME_WIPE_MODEL_V1.md`.

## 13. Partial wipes and independent state domains

VECTOR must support the principle that Star Citizen may reset individual domains independently.

Examples of independently addressable domains include:

- wallet/currency;
- inventory;
- owned in-game items;
- in-game ships;
- actual ship loadout state;
- locations;
- refinery jobs;
- reputation/progression;
- blueprint ownership;
- mission/character state.

A reset in one domain must not implicitly invalidate another domain unless an explicit wipe rule requires it.

## 14. Planning provenance

Plans and derived requirements are not current game state.

Binding rules:

- Target Loadouts and fleet plans remain distinct from Actual Loadout state;
- wipe-affected planning results may become stale/review-required rather than disappearing;
- recalculated plan requirements should retain traceability to the triggering data/build/wipe context;
- only an explicitly approved ACTIVE fleet-plan version may define official crew material targets according to Fleet Planning rules.

## 15. Derived calculation provenance

Where a calculated VECTOR result can materially affect planning, crafting requirements, market valuation or other user decisions, the calculation should be traceable to its relevant inputs.

At minimum, implementations must be able to associate derived results with the applicable:

- active dataset/channel;
- game build/dataset revision;
- calculation/engine version where required;
- source entities/input state.

Incomplete required inputs trigger Completeness behavior. They must not be represented as a valid calculated result through guessed values.

## 16. Reconciliation

Reconciliation compares external/current evidence with VECTOR's existing state.

Binding rules:

- reconciliation must preserve provenance of both the existing and incoming state where required;
- uncertain entity or location matching is never guessed;
- unknown/unresolved locations fall back to the persistent VECTOR `Unbekannt` system location according to Location Rules;
- reconciliation may update current-state assertions without deleting historical provenance;
- material conflicts should be observable/auditable rather than silently overwritten.

## 17. Manual data

Manual user input is an explicit provenance source.

- Manually entered user state must be distinguishable from imported/watcher/provider-derived state where that distinction matters.
- Later automated evidence must not silently erase meaningful user provenance without reconciliation rules.
- Manual input remains subject to authorization, validation and dataset-context rules.

## 18. Auditability

Critical provenance-changing operations must be auditable where appropriate.

Examples include:

- provider/account linking or revocation;
- critical administrative state changes;
- wipe execution;
- reconciliation decisions;
- activation of a new dataset revision;
- ownership-relevant imports;
- destructive/archive actions.

Audit requirements may vary by domain, but irreversible or security-sensitive operations must not rely solely on transient frontend state.

## 19. Platform wipe separation

A VECTOR platform wipe is categorically different from a Star Citizen game wipe.

- game-wipe rules must never be reused as authorization for platform destruction;
- platform-wide destructive operations require their own critical-action policy;
- no client-side mass delete operation may substitute for controlled server-side critical administration;
- backup, audit and step-up security requirements belong to `PLATFORM_CRITICAL_ACTIONS_V1.md`.

## 20. Secrets and credential provenance

Secrets are not ordinary provenance records.

Binding rules:

- provider secrets, user credentials, privileged tokens and RSI cookies must not be exposed through the public frontend;
- provenance may record a protected credential reference/status without exposing the credential itself;
- rotation/revocation should preserve the credential lifecycle state where required without leaking secret material.

## 21. Data integrity invariants

An implementation conforms to Persistence & Provenance v1 only if it preserves at least the following invariants:

1. Internal VECTOR UUIDs remain authoritative.
2. External IDs remain provider-scoped identities.
3. Persistence class is distinct from acquisition/source provenance.
4. User ownership is distinct from external master data.
5. Game build/dataset context is distinct from game-state epoch.
6. LIVE and PTU provenance never cross-fallback.
7. Dataset enrichment can advance revision without changing VECTOR application version.
8. Wipes may affect domains independently.
9. Wiped/invalidated records are historized when history is required instead of blindly deleted.
10. Uncertain matches and missing values are not guessed.
11. Derived results remain attributable to relevant dataset/engine/input context where required.
12. Star Citizen game wipes never implicitly authorize a VECTOR platform wipe.

## 22. Non-goals

This document does not freeze:

- final PostgreSQL table/column names;
- exact enums versus lookup tables;
- retention durations;
- final source-adapter implementation;
- exact dataset-revision numbering algorithm;
- final wipe execution SQL;
- backup provider/technology;
- final audit-log physical schema.

Those belong to architecture, migrations or dedicated FROZEN specifications.

## 23. Acceptance criteria

A future implementation must demonstrate that:

- identical external provider IDs cannot become globally authoritative outside provider scope;
- a user-owned asset survives master-data refresh as the same logical asset when mapping remains deterministic;
- an in-game asset can be invalidated by a wipe without deleting its history;
- a pledge-backed ownership record can remain while its Actual Loadout state changes/reset separately;
- wallet, inventory and ship state can be reset independently;
- the active dataset revision/build can be determined for build-dependent data;
- PTU data cannot silently fill a missing LIVE value or vice versa;
- an incomplete source input cannot create a falsely valid calculated output;
- reconciliation can represent an unresolved result without guessing;
- critical destructive platform operations remain separate from game-wipe processing.

## 24. Frozen decision

VECTOR Persistence & Provenance v1 is **FROZEN**.

This document extracts and modernizes the persistence, provenance, epoch, wipe-history and provider-identity principles from the legacy V2 logical architecture into the current VECTOR governance model.

Where legacy drafts conflict with newer VECTOR-wide FROZEN rules, the current Governance, Versioning, Dataset Isolation, Location, Fleet, Authorization and No-Guess rules take precedence.

Material amendments require a successor version and the normal VECTOR Governance process.
