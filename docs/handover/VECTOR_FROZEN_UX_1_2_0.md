# VECTOR 1.2.0 Frozen UX
- Inventory CRUD uses an inline editor in the existing lot/storage row, never native browser prompt/confirm dialogs.
- Editable: material, amount, unit, quality, allowed location.
- Clicking/tapping an editable lot row may open editing; an explicit Edit action may remain.
- Tab/Shift+Tab follow logical visual order; Enter/Space activate appropriate controls; Esc cancels editing.
- Enter must never unexpectedly cycle Header/top-bar controls.
- Visible cyan focus state; no positive manually numbered tabindex.
- Foreign crew lots remain view-only.
