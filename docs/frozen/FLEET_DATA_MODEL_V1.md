# VECTOR Fleet Data Model v1

**Status:** FROZEN  
**Version:** 1.0  
**Scope:** Ship master data, concrete user-owned ships, ownership and persistence, per-crew sharing, fleet composition, loadout separation, dataset/build context and wipe-safe history

## 1. Purpose

This document defines the binding logical rules for ships and fleets in VECTOR. It freezes the domain semantics without freezing a final PostgreSQL schema, table layout or migration implementation.

The objective is to preserve ownership, privacy, build provenance, loadout state and planning semantics without duplicating ships or conflating model data with concrete user assets.

## 2. Authoritative identity

- VECTOR internal UUIDs are authoritative for ship and fleet entities.
- SCMDB, RSI/CIG, UEX and other provider identifiers are external identities only.
- External identifiers may map to VECTOR entities but must not become the primary internal identity.
- A provider migration or identifier change must therefore not require a new VECTOR-owned ship identity when the underlying entity is unchanged.

## 3. Ship model versus user-owned ship

VECTOR strictly separates a global ship model from a concrete user-owned ship.

### 3.1 Ship model

A ship model represents the canonical master-data definition of a ship or variant.

Example concept:

```text
ARGO MOLE
```

The global ship model exists once per canonical model/variant in the applicable dataset context.

### 3.2 Concrete user-owned ship

Every concrete user-owned ship is an individual VECTOR record with its own internal UUID.

Binding rules:

- A user may own multiple concrete ships of the same model.
- Duplicate ship models owned by one user are supported by design.
- Each concrete ship may have its own nickname, ownership source, persistence class, current state, sharing configuration and loadout state.
- Concrete ships must never be collapsed merely because their canonical ship model is identical.

## 4. Ownership and acquisition semantics

A user-owned ship records the owning VECTOR user and an ownership/acquisition classification.

Supported conceptual ownership types include at least:

```text
PLEDGE
INGAME
REWARD
LOANER
RENTAL
TEMPORARY
```

The implementation may refine these values, but the semantic separation between persistent pledge/platform-linked assets and game-state-dependent assets is binding.

Acquisition provenance must remain distinguishable where known, for example RSI pledge, in-game purchase or reward.

## 5. Persistence and game epochs

Ship persistence is independent from the canonical ship model.

Binding rules:

- Pledge-backed ships and in-game-acquired ships have different persistence/provenance semantics.
- An in-game ship belongs to the relevant game-state epoch in which the asset exists/acquired provenance is tracked.
- A pledge ship normally does not depend on a game epoch for its fundamental ownership.
- Wiped or invalidated ships are historized instead of blindly deleted.
- A wiped/inactive ship must not remain in active personal or crew fleet views unless a dedicated historical view explicitly includes it.

The exact game-epoch storage model belongs to the persistence/wipe architecture and is not fixed by this document.

## 6. Personal fleet

VECTOR supports a personal fleet owned by a user.

Binding rules:

- A personal fleet references concrete user-owned ships.
- Fleet membership does not replace ship ownership.
- A ship remains owned by the user even when shared into a crew context.
- VECTOR may designate one primary personal fleet per user.
- Additional fleet groupings may be introduced later as long as they do not violate concrete-ship identity or ownership rules.

## 7. Crew fleet

A crew fleet is a view/composition of concrete user-owned ships that users have explicitly shared with that crew.

Binding rules:

- Crew fleet ownership is not copied from the user.
- Adding a ship to a crew fleet never transfers ownership.
- The same concrete user-owned ship may have different visibility/sharing states for different crews.
- Crew fleet membership is therefore derived through a per-crew share relationship.
- A ship with no active share for a crew is private to that crew context.
- Hidden or revoked shares do not appear in the active crew fleet and must not contribute to official crew planning/material requirements.

## 8. Per-crew sharing

Ship privacy is crew-specific, not a single global boolean.

A conceptual share relation must be able to identify:

```text
concrete user ship
+ crew
+ share state
+ fleet-planning permission
+ sharing provenance/timestamps
```

Recommended semantic share states include:

```text
SHARED
HIDDEN
REVOKED
```

Exact database names are implementation details.

## 9. Fleet planning permission boundary

Sharing a ship and allowing official fleet planning are related but distinct decisions.

Binding rules:

- A shared ship may be visible without necessarily being eligible for official crew fleet planning.
- Official planning must respect the per-crew `allow_fleet_planning` equivalent policy.
- Revoked/hidden/non-plannable ships must not silently contribute to official crafting/farming requirements.
- UI visibility must not substitute for backend authorization or planning eligibility checks.

## 10. Loadout concepts are strictly separate

The following concepts must never be merged into one state:

1. **Factory Default Loadout**
2. **Actual Loadout State**
3. **Saved Loadout Template**
4. **Target Loadout**

### 10.1 Factory Default Loadout

Represents the version-correct factory configuration for a canonical ship model.

- belongs to ship master data;
- is dataset/game-build aware;
- may change between Star Citizen builds;
- is not automatically the user's current in-game state.

### 10.2 Actual Loadout State

Represents what VECTOR currently believes is installed on a concrete user-owned ship in the relevant game-state context.

- belongs to a concrete user-owned ship;
- may be current, outdated, unknown, unverified or reset by a wipe;
- must retain provenance/capture context where available;
- must not be overwritten by merely choosing a Target Loadout.

### 10.3 Saved Loadout Template

Represents a user-owned reusable configuration/template.

- may be associated with a concrete ship or reusable where allowed;
- is not necessarily installed;
- is not automatically an official fleet target.

### 10.4 Target Loadout

Represents the desired future state used by personal or fleet upgrade planning.

- is planning data;
- does not mutate the Actual Loadout merely by being selected;
- may remain valid as a plan through game-state changes until explicitly recalculated, reviewed, archived or otherwise invalidated by planning rules.

## 11. Hardpoints and installed items

Loadouts are expressed against compatible ship hardpoints/slots.

Binding principles:

- a loadout item assignment must reference a logical hardpoint/slot context;
- compatibility is evaluated against the active dataset/build context;
- incompatible or unresolved item/hardpoint relationships must not be silently accepted;
- missing compatibility/master data is handled by the dataset completeness rules rather than guessed.

Exact hardpoint schema and compatibility implementation remain architecture details.

## 12. Dataset and Star Citizen build context

Fleet master data is dataset-aware.

Binding rules:

- ship models, hardpoints, factory defaults, compatibility and dataset-derived stats use the active VECTOR dataset channel;
- LIVE and PTU datasets are strictly isolated;
- no LIVE/PTU cross-channel fallback is permitted;
- changing `LIVE | PTU` changes the dataset context for fleet catalog/master-data derived information;
- missing data in the active channel is handled by the Completeness Filter;
- the canonical VECTOR release identifier still references the approved LIVE build according to VECTOR Versioning v1.

A concrete user-owned ship remains a user asset; changing the dataset channel does not create a second owned ship. Dataset-dependent interpretation of that ship may differ by channel/build.

## 13. Fleet planning and official material goals

This document preserves the interface to Fleet Planning without duplicating the full Fleet Planning specification.

Binding rules:

- official material/farming targets use eligible concrete ships from the applicable crew fleet;
- hidden, revoked or planning-ineligible shares must not contribute;
- only the approved ACTIVE fleet-plan version may produce official crew material goals;
- Draft or Published-but-not-Active planning states must not silently alter current official requirements;
- target loadouts remain separate from Actual Loadout state.

Detailed plan status/version semantics belong to `FLEET_PLANNING_V1.md`.

## 14. Star Citizen game wipe interaction

Wipes must not destroy the semantic distinction between master data, ownership provenance, actual state and target planning.

Binding rules:

- canonical ship master data is not deleted merely because game state is wiped;
- affected user-owned in-game ships may be invalidated/historized according to wipe rules;
- surviving pledge-backed ships may remain active when the wipe policy specifies preservation;
- affected Actual Loadout states may be reset or historized according to wipe policy;
- Factory Default must be resolved against the applicable target game build when a reset-to-default action is performed;
- Target Loadouts/plans are planning records and are not silently replaced by Actual/Factory state;
- affected official plans may require recalculation/review according to the Fleet Planning and Wipe specifications.

## 15. External imports

External sources such as RSI/CIG or future watcher/import pipelines may discover or update fleet information.

Binding rules:

- external provider IDs remain external identities;
- deterministic matching must use explicit provider/external identity mappings where available;
- uncertain matches must not be guessed;
- imports must not silently merge two concrete user-owned ships only because they share a model;
- imports must preserve the distinction between ownership, sharing and loadout states;
- secrets, cookies and privileged provider tokens must not be exposed to the public frontend.

## 16. Authorization boundary

- Ship ownership belongs to the owning user.
- Crew membership does not transfer ownership.
- Crew hierarchy role alone does not grant arbitrary modification rights over another user's ship.
- Sharing and Fleet Planning permissions must be enforced by backend authorization/RLS/RPC logic as applicable.
- UI controls must reflect permissions but are not the security boundary.
- Platform administration, crew hierarchy, functional crew roles and user ownership are distinct authorization dimensions.

## 17. Data integrity invariants

An implementation must preserve at least these invariants:

1. Every concrete user-owned ship has a unique internal VECTOR identity.
2. Multiple concrete ships may reference the same canonical ship model.
3. A crew fleet does not copy or change ship ownership.
4. Sharing is evaluated per concrete ship and per crew.
5. Hidden/revoked shares do not participate in active crew fleet views or official material goals.
6. Factory Default, Actual, Saved Template and Target Loadout remain separate state domains.
7. Dataset-dependent ship/master data is build/channel aware.
8. LIVE and PTU data are never mixed in the same derived fleet calculation.
9. Wiped assets/states are historized/invalidated where applicable instead of blindly mass-deleted.
10. External provider identifiers never replace VECTOR's internal authoritative UUIDs.

## 18. Non-goals

This specification does not freeze:

- exact PostgreSQL table names;
- enum versus lookup-table implementation;
- final RLS policy SQL;
- provider-specific import APIs;
- exact SCMDB/RSI/UEX payload formats;
- final hardpoint compatibility algorithm;
- Fleet Planning screen UX;
- wipe execution SQL;
- marketplace behavior.

These belong to implementation architecture, migrations or separate FROZEN specifications.

## 19. Acceptance criteria

A fleet implementation conforms to Fleet Data Model v1 when:

- duplicate ship models per user are represented as distinct owned ships;
- every owned ship has an internal UUID;
- crew fleet membership is derived from per-crew shares without transferring ownership;
- changing one crew's share does not implicitly change another crew's share;
- non-plannable/hidden/revoked shares are excluded from official crew calculations;
- Factory, Actual, Saved and Target loadouts cannot overwrite or masquerade as each other;
- build-aware master data respects the active LIVE/PTU context without cross-channel fallback;
- uncertain external matches are not guessed;
- wipe handling can preserve historical identity/provenance;
- authorization is enforced beyond the frontend.

## 20. Frozen decision

VECTOR Fleet Data Model v1 is **FROZEN**.

This document extracts and modernizes the previously fixed V2 fleet-domain decisions into the current VECTOR governance model. Where legacy implementation sketches conflict with newer VECTOR-wide FROZEN rules, the current Governance, Versioning, Dataset Isolation, Authorization and No-Guess rules take precedence.

Material amendments require a successor version and the normal VECTOR Governance process.
