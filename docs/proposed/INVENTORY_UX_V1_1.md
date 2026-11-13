# VECTOR Inventory UX v1.1

**Status:** PROPOSED  
**Version:** 1.1  
**Authority Scope:** INVENTORY_UX  
**Approved By:** pending project_owner approval  
**Supersedes:** `INVENTORY_UX_V1.md` v1.0 after approval, promotion to FROZEN and merge to `main`  
**Scope:** Amendment of Inventory UX v1: quality tiers, two inventory pages, level model, global key set. Everything in v1.0 that is not listed in section 3 stays unchanged.

## 1. Purpose

Inventory UX v1.0 stays the binding base. This proposal adds decisions made on 2026-11-13 after the design review of the Group Terminal mock-ups (Dashboard, Mein Inventory, Crew Inventory). It changes no data model, no merge key and no authorization rule.

Until this document is approved and promoted, `INVENTORY_UX_V1.md` alone is binding. The mock-ups are design input only.

## 2. Principle

The amendment is additive. Where this document is silent, v1.0 applies. If a statement here conflicts with v1.0 and no explicit amendment in section 3 covers it, v1.0 wins and the conflict is reported as `FROZEN_CONFLICT`.

## 3. Amendments

### 3.1 Two inventory pages (extends v1.0 sections 2, 3 and 17)

- **Mein Inventory** is the management page. It contains Quick Add ("Lot hinzufügen"), inline edit and delete for the user's own lots.
- **Crew Inventory** is the overview page. It has no Quick Add. Foreign lots are labelled "Nur ansehen" and never expose an enabled edit or delete state.
- Both pages derive from the same lots. The Crew view is derived from the ownership of each lot; nothing is stored twice.
- Authorization stays in the backend. The label "Nur ansehen" is a presentation aid, not a security boundary (v1.0 section 16).

### 3.2 Level model (extends v1.0 sections 8 and 9)

The inventory pages use a three-level drill-down:

| Level | Content |
|---|---|
| 1 | Materials, collapsed by default (v1.0 section 9) |
| 2 | Lots of one material, after explicit expand |
| 3 | Detail of one lot (history, source, location) where needed |

A visible depth indicator ("Ebene n von 3") shows the current level. GLOBAL and LOCATION (v1.0 section 8) remain a presentation toggle on top of this model. Individual lots appear only after explicitly expanding the material row; this does not change v1.0 section 9.

### 3.3 Quality tiers (extends v1.0 section 5)

Quality tiers are a display convention for the quality value 0 to 1000. They do not change lot identity: the merge key still uses the exact quality value (v1.0 section 7).

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
- Aggregates still use the quantity-weighted average and the minimum to maximum range (v1.0 section 5). The tier of an aggregate is derived from its weighted average and is shown together with the numeric value.
- The tier names and boundaries are a presentation decision of VECTOR. They must not be presented as official Star Citizen terminology.

### 3.4 Global key set (extends v1.0 section 13)

The v1.0 rules (Tab, Shift+Tab, Enter, Space, Esc, visible cyan focus, no positive tabindex) remain fully in force. Additionally:

| Key | Function |
|---|---|
| W / S | Select previous / next entry |
| D / F | Open / enter the selected entry |
| A | Back one level |
| Q / E | Switch view (for example Mein / Crew, GLOBAL / LOCATION) |
| T | Focus search |
| R | Reset filters |
| 1 to 6 | Jump to area |

Binding rules:

- Letter and number keys are inactive while focus is in a text, number or select input, and while an inline editor is active.
- `Esc` first cancels an active inline edit or closes a transient element (v1.0 sections 12 and 13). Only when nothing of that kind is active does `Esc` act as "back one level".
- Every function reachable by these keys remains reachable by Tab, Enter and Space.
- `Enter` must not move interaction to header or top-level controls (v1.0 section 13).

### 3.5 Delete confirmation (clarifies v1.0 section 12)

Deleting a lot uses an in-row, application-owned confirmation that names the lot (quantity, material, quality, location). Native browser dialogs stay prohibited.

## 4. Out of scope

- Visual style, typography, icons and branding. These belong to the UX foundation document, not to this specification.
- Dashboard content, navigation order and header layout.
- Location derivation of Home and refinery locations from SCMDB (open, stays with the location work).
- Crew management features.

## 5. Acceptance criteria

An implementation conforms to Inventory UX v1.1 when all criteria of v1.0 section 18 hold and in addition:

1. Mein Inventory has Quick Add and own-lot edit and delete. Crew Inventory has none.
2. Foreign lots show no enabled edit state; the backend rejects changes regardless of the UI.
3. Materials are collapsed by default; lots show only after expanding.
4. Tier boundaries and colours come from one central configuration, and every tier colour is paired with its text label.
5. Letter and number keys do nothing while typing in an input or during inline edit.
6. `Esc` order follows section 3.4.
7. Every key-driven function also works by Tab, Enter and Space.

## 6. Decision status

`PROPOSED`. Promotion to `FROZEN` requires the owner's approval and the normal VECTOR governance process, including registration in `RULE_INDEX.md` and supersession of `INVENTORY_UX_V1.md` v1.0.
