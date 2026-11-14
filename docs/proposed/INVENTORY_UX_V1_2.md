# VECTOR Inventory UX v1.2

**Status:** PROPOSED  
**Version:** 1.2  
**Base Commit:** `c483aa9` (`develop` at the time of writing)  
**Authority Scope:** INVENTORY_UX  
**Approved By:** pending project_owner approval (the owner decisions of 2026-11-14 are recorded in section 1; promotion is a separate step)  
**Supersedes:** `INVENTORY_UX_V1_1.md` v1.1 in full (after approval)  
**Scope:** Personal and Crew inventory interaction, quality tiers, level model, global key set, key help, lot representation, key figure strip, Crew overview, quantity/quality handling, locations, filtering, grouping, editing, accessibility and dataset isolation

## 1. Purpose

This document is the full-document successor to Inventory UX v1.1 and defines the UX and interaction rules for the personal and Crew VECTOR inventory. Sections 3.1, 9.1, 9.2, 13.1, 13.2, 17, 18 and 19 are the amendments of v1.2 (owner decisions of 2026-11-14); all other rules carry over from v1.1 unchanged. The inventory must support fast stock maintenance without hiding the underlying lot structure required for location, quantity, unit and quality accuracy.

Until this document is approved and promoted to FROZEN, `INVENTORY_UX_V1_1.md` alone is binding. This proposal is design input only and changes no data model, no merge key and no authorization rule.

Amendments of v1.2:

1. Edit key `B` for the selected own lot (section 13.1). Delete gets no key.
2. The Crew Inventory edit symbol for own lots is the presentation of the existing link "In Mein Inventory bearbeiten", with a defined jump and return (section 3.1). Acceptance criterion 14 is reworded accordingly (section 18).
3. GLOBAL / LOCATION deliberately has no key (section 13.1).
4. Key help: hint bar and overview (section 13.2).
5. Already built elements are recorded so that the specification matches the product: key figure strip (section 9.1) and Crew overview (section 9.2). Description only; nothing new is added.
6. Acceptance criteria 20 and following (section 18).
7. Frozen decision replaced by the status of this proposal (section 19).

## 2. Core model

- Personal inventory belongs to the authenticated VECTOR user.
- Inventory positions are stored as lots/stock positions; aggregation in the UI does not remove the underlying lots.
- Different qualities remain separate lots unless an explicit merge rule applies.
- Different storage locations remain separate lots.
- Aggregated values are presentation values derived from the active lots and active dataset context.
- Inventory UX must never fabricate missing values or silently mix incompatible dimensions.
- The inventory has two pages. **Mein Inventory** is the management page (Quick Add, edit and delete of the user's own lots). **Crew Inventory** is the overview page; the Crew view is derived from the ownership of each lot and nothing is stored twice.

## 3. Quick Add

Personal inventory provides a Quick Add workflow with:

- Material
- Quantity
- Unit
- Quality
- Storage location
- Add/store action

Quick Add is for the user's own inventory and lives on Mein Inventory. Crew Inventory has no Quick Add; stock is entered through Personal Inventory.

On Crew Inventory all lots are read-only, including the current user's own lots: no edit, no delete, no inline editor. Foreign lots are labelled "Nur ansehen". Own lots offer a link "In Mein Inventory bearbeiten" that opens the same lot on Mein Inventory. The label is a presentation aid; authorization stays in the backend (section 16).

### 3.1 Edit symbol on Crew Inventory

The link "In Mein Inventory bearbeiten" may be presented as an edit symbol next to the user's own lots on Crew Inventory. Symbol and link are the same element.

Binding rules:

- The symbol is a navigation element, not an editing state. Crew Inventory still has no inline editor and no write action (section 3, section 16).
- Foreign lots have neither a symbol nor a link; they keep the label "Nur ansehen".
- The symbol has the accessible name "In Mein Inventory bearbeiten" and is operable by Tab, Enter and Space. Its visual design (icon, colour) belongs to the UX foundation (section 17).
- A click switches to Mein Inventory, opens the groups that contain this lot and opens the inline editor of exactly this lot, in the same editing state as the Edit action (section 12.1). If the lot is not found, nothing opens.
- Saving or cancelling returns to the last position on Crew Inventory: open groups, selection and scroll position as before. If that position cannot be restored, the return goes to the top of Crew Inventory. The return applies only when the editor was opened through this symbol.

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

### 5.1 Quality tiers

Quality tiers are a display convention for the quality value 0 to 1000. They do not change lot identity: the merge key still uses the exact quality value (section 7).

| Tier | Quality range |
|---|---|
| SCRAP | 0 to 499 |
| STANDARD | 500 to 750 |
| BULK | 751 to 850 |
| PRODUCTION | 851 to 950 |
| PRIME | 951 to 999 |
| PERFECT | 1000 |

Binding rules:

- Tier boundaries live in one central configuration. No screen hard-codes a boundary or a colour.
- Colour encodes the tier only, and is always accompanied by the tier name as text. Colour alone never carries meaning.
- A legend shows all tiers and ranges.
- Aggregates use the quantity-weighted average and the minimum to maximum range. The weighted average is rounded to the nearest integer (halves round up) before the tier is assigned. The rounded integer is the value shown, so label and number always agree. Minimum and maximum are integers already.
- The tier names and boundaries are a presentation decision of VECTOR and must not be presented as official Star Citizen terminology.

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

### 8.3 Level model

The inventory pages use a drill-down whose level count depends on the view. Lot detail (history, source) is an inline panel inside a lot row, never a separate level.

| View | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| GLOBAL | Materials, collapsed by default (section 9) | Lots of one material, after explicit expand | none |
| LOCATION | Materials, collapsed by default | Locations of one material | Lots at that location |

A visible depth indicator shows the current level and the total of the active view ("Ebene n von 2" in GLOBAL, "Ebene n von 3" in LOCATION). This section assigns level numbers to the hierarchies of sections 8.1 and 8.2 and does not change them.

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

### 9.1 Key figure strip

Both inventory pages show a read-only strip "Kennzahlen" above the filters:

| Figure | Meaning |
|---|---|
| Materialien | number of distinct materials |
| Menge SCU | total quantity of VOLUME materials, formatted with the active unit preference (AUTO/SCU/cSCU/mSCU/µSCU); the displayed value always includes its concrete unit |
| Menge Stück | total quantity of COUNT materials (pieces) |
| Lots | number of lots ("dein Bestand" on Mein Inventory, "Crew-Bestand" on Crew Inventory) |
| Zuletzt geändert | most recent lot update: "heute, HH:mm" if it lies on the current calendar day (Europe/Berlin), otherwise "TT.MM.JJJJ"; "–" without a timestamp |

Binding rules:

- The strip is computed from the same lots as the list, after filtering (section 10).
- SCU and pieces are never added together (section 4.1). There is no overall average across materials.
- Lots whose unit is unknown count in neither quantity and are reported as a hint ("n ohne bekannte Einheit"). A quantity without any known-unit lot shows `–` if unknown-unit lots exist, otherwise `0`.
- The strip has no controls and no effect on the filters.

### 9.2 Crew overview

Crew Inventory additionally shows a read-only overview (variant without a player level). It does not change the level model of section 8.3: the player is a column and a filter, never a level.

- **Players per material:** the compact material row shows "n Spieler", the number of distinct owners (`owner_user_id`) among the lots of that material.
- **Panel "Qualitätsverteilung":** the number of materials per quality tier, assigned by the rounded weighted average of the material (section 5.1). All six tiers are always shown, also with 0. Only VOLUME (SCU) materials with an average are counted; COUNT materials, materials with unknown unit and materials without a usable average are not counted and are named in a note. VOLUME and COUNT are never mixed.
- **Panel "Spieler":** one entry per owner (`owner_user_id`, never grouped by name) with the number of lots and the number of materials, sorted by name.

Binding rules:

- The overview is computed from the same lots as the list, after filtering (section 10).
- It is display only: no buttons, no effect on the filters, no write action.

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
- delete actions require an application-owned confirmation interaction where confirmation is necessary, never a native browser confirmation dialog;
- the delete confirmation is shown in the row and names the lot (quantity, material, quality, location).

### 12.1 Inline editor activation

An editable inventory lot/storage row may enter inline edit mode through direct row interaction.

Binding rules:

- Clicking or tapping an editable lot/storage row may activate its inline editor.
- A dedicated `Edit` action may additionally remain available.
- Direct row activation and an explicit Edit action must open the same editing state and follow the same validation and authorization rules.
- Row activation must not interfere with expand/collapse controls, selection controls, links, buttons or other interactive elements contained in the row.
- Keyboard activation must remain predictable and must follow the global VECTOR keyboard rules.
- `Esc` cancels the active inline edit without committing changes.
- Read-only lots must never enter edit mode through row interaction.
- Foreign Crew lots remain strictly view-only and must not expose an enabled editing state merely because the current user shares a Crew with the owner.
- Authorization must be enforced by the backend authorization model; the UI state is not a security boundary.

## 13. Keyboard and focus UX

Inventory follows the global VECTOR keyboard rules:

- `Tab` / `Shift+Tab` navigate interactive elements in logical visual order;
- `Enter` and `Space` activate buttons and open/close applicable interactive elements;
- `Esc` cancels inline editing or closes the active transient UI where applicable;
- interactive elements expose a clearly visible cyan focus state;
- positive manually numbered `tabindex` ordering is prohibited;
- pressing `Enter` must not unexpectedly move interaction to header/top-level controls.

Collapsed material rows and lot-level actions must remain keyboard-operable.

### 13.1 Global key set

In addition to the rules above:

| Key | Function |
|---|---|
| W / S | Select previous / next entry |
| D / F | Open / enter the selected entry |
| A | Back one level |
| B | Edit the selected own lot (opens its inline editor) |
| Q / E | Switch page: Mein Inventory / Crew Inventory |
| T | Focus search |
| R | Reset filters |
| 1 to 6 | Jump to area by position in the main navigation: 1 Dashboard, 2 Inventory, 3 Blueprints, 4 Fabricator, 5 Fleet, 6 Trading |

Binding rules:

- Letter and number keys are inactive while focus is in a text, number or select input, and while an inline editor is active.
- `Esc` first cancels an active inline edit or closes a transient element. Only when nothing of that kind is active does `Esc` act as "back one level".
- `B` acts only on Mein Inventory and only while an own lot is selected. It opens the same inline editor as the Edit action (section 12.1). On Crew Inventory and on material or location rows it has no effect.
- Deleting has no key. A lot is deleted only by clicking or tabbing to its delete action with the in-row confirmation (section 12).
- GLOBAL / LOCATION deliberately has no key (owner decision 2026-11-14); it is switched by click, Tab, Enter and Space only. Q / E switch between Mein Inventory and Crew Inventory.
- No letter or number key acts while Ctrl, Alt or Meta is held, or while the account drawer is open.
- Every function reachable by these keys remains reachable by Tab, Enter and Space.
- Navigation entries marked as not yet available ("BALD") ignore their number key until the area exists. The mapping follows the navigation order; changing that order requires an amendment of this document.

### 13.2 Key help

The key set is made visible. This is display only and adds no key.

- **Hint bar:** a thin line at the bottom of the inventory area with the accessible name "Tastenhilfe". It shows only the keys that apply in the current state:
  - normal (Mein Inventory): W / S select, D / F open, A back, Q / E Mein / Crew, T search, R reset filters, and B edit while an own lot is selected;
  - Crew Inventory: the same without the edit hint;
  - inline editor open: only "Esc abbrechen" (letter and number keys rest);
  - delete confirmation open: only "Esc schließen".
- **Overview:** a button "Tastenhilfe" with visible text, operable by Tab, Enter and Space and without a key of its own, opens an overview of ALL keys with their effect and the note "Alles geht auch mit Tab, Enter und Leertaste." The overview is a transient element: Esc or a close button closes it, focus moves into it when it opens and returns to the button when it closes. While it is open the keys behind it rest.
- **One source:** key help and the real keys must agree. The table of keys and effects exists in one place as data, and a test fails if a key in the help does not exist in the key logic or a key of the key logic is missing in the help.

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

- Crew Inventory aggregation details beyond the rules in sections 2, 3, 8.3 and 9.2;
- visual style, typography, icons, branding, Dashboard content, navigation layout and header layout (UX foundation);
- location derivation of Home and refinery locations from SCMDB;
- Crew management features;
- crafting reservation/consumption transaction logic;
- SCMDB extraction internals;
- UEX market data behavior;
- full location-catalogue maintenance;
- database table names or migration implementation.

Those concerns belong to their respective FROZEN or architecture specifications.

## 18. Acceptance criteria

An implementation conforms to Inventory UX v1.2 when:

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
13. Mein Inventory has Quick Add and own-lot edit and delete. Crew Inventory has none of these for any lot, own or foreign.
14. No lot on Crew Inventory shows an enabled editing state: Crew Inventory has no inline editor and no write action. A link or symbol "In Mein Inventory bearbeiten" for own lots is allowed (navigation only, section 3.1). The backend rejects changes to foreign lots regardless of the UI (section 16, unchanged).
15. Materials are collapsed by default; lots show only after expanding. The depth indicator matches the active view (2 levels in GLOBAL, 3 in LOCATION).
16. Tier boundaries and colours come from one central configuration, every tier colour is paired with its text label, and aggregate tiers use the rounded weighted average.
17. Letter and number keys do nothing while typing in an input or during inline edit.
18. `Esc` order follows section 13.1.
19. Every key-driven function also works by Tab, Enter and Space.
20. `B` opens the inline editor of the selected own lot, only on Mein Inventory. It does nothing on Crew Inventory, on material or location rows, in input fields, during inline edit, or with Ctrl, Alt or Meta held.
21. No key deletes a lot, and GLOBAL / LOCATION has no key. Deleting works only through the delete action with the in-row confirmation.
22. Crew Inventory shows the edit symbol only for the user's own lots, never for foreign lots. A click opens Mein Inventory with the inline editor of exactly that lot.
23. Saving or cancelling that edit returns to the last position on Crew Inventory (open groups, selection, scroll), or to its top if that cannot be restored.
24. The hint bar shows only the keys valid in the current state (normal, Crew, inline editor, delete confirmation). The overview opens and closes by button, Esc and close button, with correct focus.
25. Key help and real keys agree, secured by a test in both directions.
26. The key figure strip follows section 9.1.
27. The Crew overview follows section 9.2 and is display only.

## 19. Status of this document

VECTOR Inventory UX v1.2 is **PROPOSED**. It is the full-document successor to v1.1 once approved. `INVENTORY_UX_V1_1.md` stays **FROZEN** and binding, and remains physically unchanged, until the project owner approves the promotion. Promotion (move to `docs/frozen/`, registration of v1.1 as `SUPERSEDED`, `docs/RULE_INDEX.md`) is a separate step after the owner's approval.

After promotion this document supersedes conflicting legacy inventory behavior from the former SC Group Crafting handover where newer VECTOR-wide FROZEN rules exist, especially the persistent `Unbekannt` system-location rule, inline CRUD rule, keyboard UX rule and strict LIVE/PTU dataset isolation.

Material amendments require a further successor version of this document and the normal VECTOR Governance process
