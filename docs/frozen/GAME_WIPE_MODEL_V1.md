# VECTOR Game Wipe Model v1

**Status:** FROZEN  
**Version:** 1.0  
**Scope:** Star Citizen game wipes, partial resets, game-state epochs, dry-run/approval semantics, historization, recalculation and separation from VECTOR platform-destructive actions

## 1. Purpose

This document defines the binding logical rules for handling Star Citizen game wipes in VECTOR.

A game wipe is a controlled, data-driven transition of Star Citizen game-state data. It is not a deletion of VECTOR itself, not a platform wipe, and not an implicit permission to destroy unrelated platform records.

The specification freezes domain behavior and safety invariants. It does not freeze final PostgreSQL table names, SQL implementation or administrative UI layout.

## 2. Core principles

1. Star Citizen wipes are configurable by affected domain and explicit action.
2. A wipe may be full or partial.
3. Different game-state domains may reset independently.
4. Wiped or invalidated records are historized where history is relevant instead of blindly deleted.
5. Platform identity, crew membership, authorization, audit history and unrelated saved platform configuration survive a Star Citizen game wipe.
6. Wipe scope is never guessed from patch/build numbering alone.
7. Wipe execution must be previewable before destructive or state-changing actions are applied.
8. Wipe processing must be auditable and idempotent where implementation requires retryability.

## 3. Game wipe versus platform wipe

VECTOR strictly distinguishes:

```text
STAR CITIZEN GAME WIPE
!=
VECTOR PLATFORM WIPE
```

A Star Citizen game wipe may alter Star Citizen game-state domains according to declared rules.

A VECTOR platform wipe is a critical administrative operation governed separately by `PLATFORM_CRITICAL_ACTIONS_V1.md`.

Game-wipe permissions or configuration must never authorize platform-wide deletion.

## 4. Wipe event lifecycle

Every wipe is represented as an explicit logical event.

Recommended lifecycle states include:

```text
DRAFT
PREVIEWED
APPROVED
EXECUTING
COMPLETED
FAILED
CANCELLED
```

Exact physical enum/storage implementation is not frozen.

Binding behavior:

- a DRAFT event may be configured but must not alter game state;
- a dry run/preview must be possible before approval/execution;
- execution uses a locked or otherwise immutable approved configuration snapshot;
- completion/failure state and audit information remain traceable.

## 5. Full and custom wipes

VECTOR supports at least two logical wipe classes:

```text
FULL
CUSTOM
```

`FULL` does not mean "delete everything". It means a predefined broad wipe profile whose domain actions are still explicit.

`CUSTOM` allows an announced partial reset to affect only selected domains.

No future Star Citizen wipe is assumed to match a historical full-wipe template automatically.

## 6. Addressable wipe domains

The wipe engine must support independently addressable domains where applicable, including:

- wallet/currency;
- inventory lots;
- individual owned in-game items;
- in-game ships;
- pledge-backed ships;
- actual ship loadout state;
- locations/current game location state;
- refinery jobs;
- reputation/progression;
- blueprint ownership/progression;
- missions;
- character state;
- fleet plans and derived requirements.

Additional game-state domains may be introduced without invalidating this model.

## 7. Wipe actions

A domain rule must declare its behavior explicitly.

Supported conceptual actions include:

```text
KEEP
RESET
INVALIDATE
RESET_TO_DEFAULT
PARTIAL_RESET
ARCHIVE
RECALCULATE
KEEP_AND_RECALCULATE
```

The implementation may refine action names, but equivalent semantics must remain explicit.

### 7.1 KEEP

Preserve the affected current record/state without wipe mutation.

### 7.2 RESET

Start/reset the domain to its configured target baseline while preserving relevant history.

### 7.3 INVALIDATE

Mark affected game-state records no longer active/valid while retaining historical provenance where required.

### 7.4 RESET_TO_DEFAULT

Reset surviving entities to an applicable build-correct default state, such as a surviving ship's Actual Loadout being reset to the factory default valid for the target dataset/build.

### 7.5 PARTIAL_RESET

Apply a restricted reset based on an explicit filter/rule, such as a subset of asset categories or acquisition classes.

### 7.6 ARCHIVE

Remove the affected state from active operational views while retaining it as historical data.

### 7.7 RECALCULATE

Keep the underlying plan/entity but recompute dependent derived results.

### 7.8 KEEP_AND_RECALCULATE

Preserve the source planning record while recomputing derived state/requirements that may have changed because of the wipe.

## 8. Rule filters

A wipe rule may include explicit selection/filter criteria.

Examples include:

```text
persistence class
acquisition source
item/asset category
specific record properties
applicable game-state epoch
```

Binding rules:

- filter semantics must be explicit and reproducible;
- missing/uncertain data must not be guessed into a destructive match;
- a record must not be wiped merely because it resembles an affected class when deterministic rule matching is unavailable.

## 9. Game-state epochs

A wipe may create a new game-state epoch when the affected persistence boundary requires it.

Binding rules:

- game-state epochs are distinct from game builds;
- a new Star Citizen build does not automatically imply a new epoch;
- historical records remain linked to their prior epoch where required;
- new active game-state records use the current applicable epoch;
- there may be a current epoch per supported game-state channel/context according to the persistence architecture.

## 10. Dataset/build relationship

Wipe interpretation is build-aware but must respect VECTOR dataset isolation.

- LIVE and PTU data are never mixed.
- Target/default master data used during reset/recalculation comes from exactly one applicable dataset context.
- A missing value in one channel must not fall back to another channel.
- Completeness rules apply before build-derived defaults or calculations are treated as valid.
- The canonical VECTOR release identifier continues to reference the approved LIVE build according to `VECTOR_VERSIONING_V1.md`.

## 11. Dry run

A mandatory dry-run/preview exists before execution of an approved game wipe.

The dry run should be able to determine, where applicable:

- affected domain;
- action to be applied;
- affected-record count/impact summary;
- preserved data summary;
- configuration identity/hash or equivalent immutable reference;
- records requiring recalculation/review;
- validation/errors that block safe execution.

A dry run must not itself perform the wipe.

The exact storage shape of dry-run results is an implementation detail.

## 12. Approval and execution safety

Before execution:

- the wipe configuration must be reviewable;
- a successful applicable dry run must exist;
- the configuration used for execution must not silently differ from the reviewed configuration;
- failures must be surfaced rather than silently ignored;
- execution must be server-controlled, not a sequence of unrestricted client-side deletes.

Authorization/step-up requirements may vary by risk and are governed with the platform security specifications.

## 13. Historization instead of blind deletion

Game-state records affected by a wipe should be invalidated, reset or archived when historical traceability matters.

Binding principle:

> WIPED is a lifecycle/provenance state, not an instruction to forget that the record ever existed.

Historization supports:

- auditability;
- reconciliation;
- wipe investigation;
- historical user state;
- fleet-plan recalculation;
- provenance continuity.

Physical retention details are not frozen here.

## 14. Pledge-backed versus in-game assets

Persistence class is considered during wipe processing.

Binding rules:

- Pledge ownership is not automatically invalidated by an ordinary game wipe.
- In-game-acquired assets may be invalidated according to the wipe rule.
- A surviving pledge-backed ship's in-game Actual Loadout may still reset independently of ownership.
- Temporary/rental/loaner semantics remain distinct and are handled according to explicit configured rules.
- Acquisition provenance is preserved where known.

## 15. Ship and loadout behavior

Fleet/loadout semantics follow `FLEET_DATA_MODEL_V1.md`.

Binding wipe behavior:

- canonical ship master data is not deleted because a user-state wipe occurs;
- affected concrete in-game ships may become WIPED/invalidated and disappear from active fleet views;
- surviving ships may receive a new Actual Loadout state when `RESET_TO_DEFAULT` applies;
- the factory default must be resolved against the applicable target game dataset/build;
- previous custom Actual Loadout state remains historized where required;
- Target Loadouts and Saved Loadout Templates are not silently overwritten by a wipe of Actual Loadout state.

## 16. Inventory and owned items

Inventory/owned-item wipe behavior follows persistence and acquisition semantics.

Binding rules:

- affected GAME inventory lots/items may be invalidated/historized;
- PLEDGE/platform-persistent assets are not treated as ordinary GAME inventory by default;
- consumed, sold or already archived history must not be revived merely because a wipe occurs;
- ownership/master-data relationships must remain traceable where reference integrity allows;
- an incomplete master-data record does not justify guessing an item's wipe classification.

## 17. Wallet behavior

Wallet/currency state is an independently resettable domain.

A wallet wipe may:

- close/historize the previous game-state balance context;
- start a new applicable epoch/balance baseline;
- leave unrelated ships, inventory or progression untouched unless their own rules specify otherwise.

The configured reset amount/source must be explicit. VECTOR must not fabricate a default amount when unknown.

## 18. Progression and blueprint behavior

Reputation, blueprint ownership/progression, missions and character state are independent wipe domains.

Binding rules:

- each affected domain requires an explicit action;
- KEEP versus RESET must follow known wipe configuration/announcement, not historical assumptions;
- unknown wipe scope remains unresolved until configured/verified;
- history may remain archived even when current progression resets.

## 19. Refinery jobs and transient game processes

Transient processes such as refinery jobs may be independently invalidated when the wipe requires it.

Their wipe behavior must not implicitly invalidate unrelated inventory or wallet data unless an explicit rule requires it.

## 20. Fleet plans and crafting requirements

Saved plans are distinct from wiped current game state.

Binding behavior:

- a wipe does not blindly delete fleet/upgrade plans;
- affected material/crafting requirements may require recalculation;
- an ACTIVE plan affected by a wipe may transition to `REVIEW_REQUIRED` or equivalent review state;
- recalculation produces a new reviewable plan/result version where the planning model requires versioning;
- recalculation must not silently reactivate a revised plan;
- only an explicitly ACTIVE approved plan/version produces official crew farming targets.

## 21. Full-wipe profile example

A broad wipe may conceptually be configured like:

```text
PLEDGE_SHIPS           KEEP
INGAME_SHIPS           INVALIDATE
SHIP_LOADOUT_STATE     RESET_TO_DEFAULT
INVENTORY              INVALIDATE
OWNED_ITEMS            PARTIAL_RESET / INVALIDATE by rule
WALLET                 RESET
LOCATIONS              RESET
REFINERY_JOBS          INVALIDATE
BLUEPRINT_OWNERSHIP    KEEP or RESET according to verified scope
REPUTATION             KEEP or RESET according to verified scope
FLEET_PLANS            KEEP_AND_RECALCULATE
```

This is an example/configuration template only. It is not an assumption about every future Star Citizen wipe.

## 22. Partial-wipe example

A partial wipe can affect only selected domains, for example:

```text
WALLET                 RESET
INVENTORY              PARTIAL_RESET by explicit rule
INGAME_SHIPS           KEEP
SHIP_LOADOUT_STATE     KEEP
REPUTATION             KEEP
BLUEPRINT_OWNERSHIP    KEEP
FLEET_PLANS            RECALCULATE only if affected inputs changed
```

The actual rule set for a real wipe must be based on verified configuration/scope.

## 23. Loadout-only reset example

A loadout reset can conceptually be expressed independently:

```text
PLEDGE_SHIPS            KEEP
INGAME_SHIPS            KEEP
SHIP_LOADOUT_STATE      RESET_TO_DEFAULT
OWNED_ITEMS             INVALIDATE/PARTIAL_RESET only where explicitly affected
FLEET_PLANS             KEEP_AND_RECALCULATE
```

Again, this is a capability example, not a prediction of Star Citizen wipe behavior.

## 24. Reconciliation after a wipe

Post-wipe imports, watcher events or user reconciliation must respect wipe history.

Binding rules:

- a previously wiped record is not silently resurrected solely by fuzzy matching;
- deterministic matching may reconnect evidence to an existing historical identity where appropriate;
- new post-wipe assets/state should be associated with the current applicable epoch;
- uncertain locations use the persistent `Unbekannt` system location;
- unresolved identity conflicts remain unresolved rather than guessed;
- reconciliation decisions remain auditable where material.

## 25. Manual corrections

Authorized manual correction may be necessary after imperfect or incomplete game data/imports.

Manual correction must:

- preserve provenance that the change was manual;
- respect ownership/authorization boundaries;
- not rewrite wipe history without an explicit corrective operation;
- avoid cross-channel LIVE/PTU substitution;
- remain compatible with future reconciliation.

## 26. Audit and affected-record history

Wipe execution must produce sufficient auditability to answer:

- which wipe event/rule affected a record;
- what action was selected;
- whether processing succeeded or failed;
- when processing occurred;
- what previous/new state is relevant for investigation where snapshots are required.

Critical failure must be observable and retry/compensation must not require guessing what already happened.

## 27. Idempotency and retry safety

Wipe processing must be designed so that retries do not repeatedly destroy or mutate already processed state unpredictably.

Implementation must provide an idempotency or equivalent execution-safety strategy for state-changing wipe jobs.

Exact technical mechanism is not frozen.

## 28. Failure handling

If execution cannot safely complete:

- the wipe event/job must not be reported as successfully completed;
- failed records/actions remain traceable;
- error information sufficient for controlled retry or compensation must be retained;
- incomplete execution must not be hidden from operators;
- the system must not guess corrective mutations.

## 29. Authorization boundary

- Creating, reviewing, approving and executing a wipe are privileged operations.
- Authorization must be enforced server-side.
- UI hiding/disabling is not the security boundary.
- A Star Citizen game-wipe operator does not thereby receive VECTOR platform-wipe authority.
- Critical VECTOR platform destruction is governed separately.

Exact permission codes may evolve outside this document.

## 30. Interaction with dataset updates

A dataset update and a game wipe are independent events.

Binding rules:

- a new SCMDB/LIVE dataset does not by itself imply that user game state was wiped;
- a new game build does not automatically create a wipe event;
- a wipe may reference source and target game builds where useful;
- dataset normalization/activation is governed by Dataset Pipeline rules;
- user-state wipe execution is governed by this Game Wipe Model.

## 31. Data integrity invariants

A conforming implementation preserves at least these invariants:

1. Game wipes never delete VECTOR platform identity by implication.
2. Domain actions are explicit rather than inferred from a generic wipe flag.
3. Partial wipes can alter one domain while preserving another.
4. Wiped records can remain historically traceable.
5. Pledge ownership and Actual Loadout state can be affected independently.
6. Game build and game-state epoch remain distinct concepts.
7. LIVE and PTU never cross-fallback during wipe defaults/recalculations.
8. Saved/Target plans remain separate from Actual state.
9. Recalculated fleet plans require review/activation behavior according to Fleet Planning rules.
10. Dry-run/preview precedes controlled execution.
11. Execution is auditable and retry-safe.
12. Game-wipe authority never implies platform-wipe authority.

## 32. Non-goals

This document does not freeze:

- exact SQL tables/columns;
- exact PostgreSQL enum names;
- final worker/job technology;
- exact queue implementation;
- final administrative UI layout;
- exact dry-run storage schema;
- final audit snapshot retention duration;
- automatic interpretation of CIG announcements;
- platform-wipe security details beyond strict separation.

## 33. Acceptance criteria

An implementation conforms to Game Wipe Model v1 when it can demonstrate that:

- a wipe is represented by explicit per-domain rules;
- a mandatory non-mutating dry run can preview impact;
- a wallet-only reset does not implicitly wipe ships/inventory;
- an in-game ship can be invalidated without deleting its history;
- a pledge-backed ship may survive while Actual Loadout resets separately;
- a reset-to-default uses a valid default from one applicable dataset context;
- PTU cannot supply missing LIVE reset/default data or vice versa;
- unknown wipe scope remains unresolved instead of guessed;
- affected ACTIVE fleet planning can become review-required and be recalculated without silent reactivation;
- post-wipe reconciliation preserves epoch/provenance history;
- failed execution is observable and safely retryable/compensatable;
- a game wipe cannot invoke unrestricted platform destruction.

## 34. Frozen decision

VECTOR Game Wipe Model v1 is **FROZEN**.

This document extracts and modernizes the configurable Star Citizen wipe model from the legacy V2 logical architecture and aligns it with current VECTOR Governance, Versioning, Persistence & Provenance, Fleet, Dataset Isolation, Location and No-Guess rules.

Where legacy drafts conflict with newer VECTOR-wide FROZEN rules, the newer FROZEN rules take precedence.

Material amendments require a successor version and the normal VECTOR Governance process.
