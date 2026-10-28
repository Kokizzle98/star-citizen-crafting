# VECTOR Inventory UX v1

**Status:** FROZEN  
**Version:** 1.0  
**Scope:** Personal inventory interaction, lot representation, quantity/quality handling, locations, filtering, grouping, editing, accessibility and dataset isolation

## 1. Purpose

This document defines the binding UX and interaction rules for the personal VECTOR inventory. The inventory must support fast stock maintenance without hiding the underlying lot structure required for location, quantity, unit and quality accuracy.

## 2. Core model

- Personal inventory belongs to the authenticated VECTOR user.
- Inventory positions are stored as lots/stock positions; aggregation in the UI does not remove the underlying lots.
- Different qualities remain separate lots unless an explicit merge rule applies.
- Different storage locations remain separate lots.
- Aggregated values are presentation values derived from the active lots and active dataset context.
- Inventory UX must never fabricate missing values or silently mix incompatible dimensions.

## 3. Quick Add

Personal inventory provides a Quick Add workflow with:

- Material
- Quantity
- Unit
- Quality
- Storage location
- Add/store action

Quick Add is for the user's own inventory. Crew Inventory has no Quick Add; stock is entered through Personal Inventory.

## 4. Quantity and units

### 4.1 Technical quantity classes

- `VOLUME` remains technically volume-based.
- `COUNT` remains technically count-based.
- The UI presents `COUNT` as pieces (`Stück`).
- For `COUNT`, the unit remains visible but is fixed to pieces.
- Volume and count are different dimensions and must not be treated as directly comparable quantities.

### 4.2 Sorting

When sorting by quantity:

- VOLUME positions may be compared with other VOLUME positions.
- COUNT positions may be compared with other COUNT positions.
- VOLUME and COUNT must not be ranked against each other as if they were the same dimension.

## 5. Quality

- Quality is part of the lot identity and editable lot state.
- Different qualities remain distinct unless the complete lot merge key matches.
- Aggregated average quality is always quantity-weighted.
- VOLUME weighting uses the canonical internal volume quantity.
- COUNT weighting uses the piece count.
- Quality range represents the minimum and maximum quality of the currently included lots.

## 6. Locations

### 6.1 `Unbekannt`

`Unbekannt` is a persistent VECTOR system location and the mandatory fallback whenever a location cannot be assigned unambiguously by API, log reading/watcher, import or reconciliation.

Binding rules:

- uncertain locations are never guessed;
- `Unbekannt` is filterable and groupable like other permitted inventory locations;
- an existing lot may explicitly reference `Unbekannt`;
- imports and reconciliation use `Unbekannt` when unique assignment is impossible.

### 6.2 Manual location selection

The manual inventory location selector exposes only:

- `Unbekannt`;
- Home Locations;
- locations with a refinery.

The canonical location catalogue may contain additional locations. Clearly detected external locations may be referenced internally even if they are not offered for manual selection.

## 7. Lot merge rule

Quick Add and lot editing may merge into an existing lot only when all merge-key fields match:

```text
same user
+ same material
+ same quality
+ same permitted storage location
+ compatible quantity/unit class
= merge quantity into existing lot
```

Otherwise a separate lot remains or is created.

No cross-location or cross-quality merge is allowed merely to simplify presentation.

## 8. Global and Location views

### 8.1 GLOBAL

GLOBAL is the default inventory view.

Purpose:

> How much of this material do I own in total in the active dataset context?

GLOBAL aggregates eligible lots across locations for presentation.

Hierarchy:

```text
Material
  -> Lots
```

### 8.2 LOCATION

LOCATION groups the same eligible lots by storage location.

Hierarchy:

```text
Material
  -> Location
      -> Lots
```

Changing between GLOBAL and LOCATION changes presentation/grouping, not ownership or the underlying lots.

## 9. Compact material presentation

- Materials are collapsed by default.
- A compact material row shows, where applicable:
  - material image;
  - material name;
  - total quantity;
  - quantity-weighted average quality;
  - quality range;
  - lot count.
- Individual lots appear only after explicitly expanding the material row.
- Editing and deletion are lot-level operations, not aggregate-material operations.

## 10. Filtering

Personal Inventory supports at least:

- search;
- material/type filter;
- quality filter;
- location filter including `Unbekannt`;
- sorting.

Multiple active filters use AND semantics.

Processing order is binding:

```text
1. filter lots
2. group / aggregate filtered lots
3. calculate averages and statistics
4. sort presentation results
```

Filters operate on lots. An already aggregated unfiltered material average must not be used as the input to filtering.

## 11. Sorting

Supported sorting includes:

- Material A-Z (default)
- Material Z-A
- Total quantity ascending/descending within compatible quantity dimensions
- Average quality ascending/descending
- Highest quality
- Lowest quality
- Last modified

Sorting must be deterministic for equal primary values by using a stable secondary criterion where required.

## 12. Inline CRUD UX

Inventory stock positions/lots are edited directly in the existing row via an inline editor.

Editable lot fields are:

- material;
- quantity;
- unit where permitted by the quantity class;
- quality;
- permitted storage location.

Binding rules:

- no native browser `prompt()` or `confirm()` dialogs for CRUD;
- existing authorization checks remain in force;
- `Esc` cancels an active inline edit without committing the change;
- saving re-applies merge rules and validation before persistence;
- delete actions require an application-owned confirmation interaction where confirmation is necessary, never a native browser confirmation dialog.

## 13. Keyboard and focus UX

Inventory follows the global VECTOR keyboard rules:

- `Tab` / `Shift+Tab` navigate interactive elements in logical visual order;
- `Enter` and `Space` activate buttons and open/close applicable interactive elements;
- `Esc` cancels inline editing or closes the active transient UI where applicable;
- interactive elements expose a clearly visible cyan focus state;
- positive manually numbered `tabindex` ordering is prohibited;
- pressing `Enter` must not unexpectedly move interaction to header/top-level controls.

Collapsed material rows and lot-level actions must remain keyboard-operable.

## 14. Dataset-channel isolation

Inventory respects the global VECTOR dataset context.

- LIVE and PTU are strictly isolated.
- The application-level `LIVE | PTU` selector determines the active dataset context.
- Inventory material metadata, lookups and dataset-dependent derived values use only the active channel.
- LIVE and PTU values must never be mixed in a single calculation or derived display value.
- Missing values in one channel must not fall back to the other channel.
- If required dataset information is incomplete, the applicable Completeness Filter handles the record/result instead of cross-channel substitution.

The compact active dataset label remains visible at application level, for example:

```text
LIVE 4.10.2
PTU 4.10.3
```

## 15. Data integrity and uncertainty

- Uncertain values are not guessed.
- Missing canonical metadata is not silently replaced with fabricated defaults.
- `0` is a real value and must not be used as a synonym for unknown/missing data.
- Invalid, orphaned or incomplete dataset records are subject to VECTOR's Completeness Filter.
- User-owned inventory quantities remain distinct from external game-data completeness; an incomplete external item record must not silently corrupt an owned lot.

## 16. Authorization boundary

- Users may create, edit and delete their own inventory according to applicable authorization rules.
- Crew-based visibility does not grant modification rights to another user's personal lots.
- The inventory UI must not expose an enabled mutation control when the backend authorization model does not permit that mutation.
- UI restrictions supplement, but never replace, database/RPC/RLS authorization.

## 17. Non-goals of this document

This specification does not define:

- Crew Inventory aggregation details beyond the rule that Quick Add belongs to Personal Inventory;
- crafting reservation/consumption transaction logic;
- SCMDB extraction internals;
- UEX market data behavior;
- full location-catalogue maintenance;
- database table names or migration implementation.

Those concerns belong to their respective FROZEN or architecture specifications.

## 18. Acceptance criteria

An implementation conforms to Inventory UX v1 when:

1. Quick Add supports material, quantity, unit, quality and permitted location.
2. Lot merging follows the complete merge key.
3. `Unbekannt` works as the persistent fallback location.
4. GLOBAL and LOCATION views derive from the same underlying lots.
5. averages are quantity-weighted.
6. filtering occurs before aggregation/statistics.
7. VOLUME and COUNT are not compared as one quantity dimension.
8. lot CRUD is inline and uses no native browser prompt/confirm.
9. inventory interaction is keyboard-accessible using VECTOR focus/navigation rules.
10. LIVE and PTU data never mix or cross-fallback.
11. editing another user's personal lot is not enabled through Crew membership alone.
12. missing or uncertain dataset values are not guessed.

## 19. Frozen decision

VECTOR Inventory UX v1 is **FROZEN**.

This document supersedes conflicting legacy inventory behavior from the former SC Group Crafting handover where newer VECTOR-wide FROZEN rules exist, especially the persistent `Unbekannt` system-location rule, inline CRUD rule, keyboard UX rule and strict LIVE/PTU dataset isolation.

Material amendments require a successor version of this document and the normal VECTOR Governance process
