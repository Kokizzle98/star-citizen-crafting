import { hintEntries } from '@/lib/keyboard/key-help'

/**
 * Thin line at the bottom of the inventory area: shows only the keys that
 * apply in the current state. Display only; the keys themselves are handled in
 * useInventoryKeys / InventorySwitch / VectorShell.
 */
export function KeyHintBar({ page, inlineEditorActive, deleteConfirmOpen }: {
  page: 'own' | 'crew'
  inlineEditorActive: boolean
  deleteConfirmOpen: boolean
}) {
  const entries = hintEntries({ page, inlineEditorActive, deleteConfirmOpen })
  return <div className="key-hint-bar" role="group" aria-label="Tastenhilfe">
    <ul>
      {entries.map((entry) => <li key={entry.id}><kbd>{entry.label}</kbd> {entry.short}</li>)}
    </ul>
  </div>
}
