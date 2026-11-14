'use client'

import { useEffect, useState } from 'react'
import { useKeySet } from '@/components/layout/useKeySet'
import {
  enterLevel,
  escapeAction,
  leaveLevel,
  moveSelection,
  trimPath,
} from '@/lib/keyboard/key-set'

/**
 * Inventory part of the global key set (INVENTORY_UX_V1_2 section 13.1):
 * W / S select, D / F go one level deeper, A and Esc go one level back,
 * B edits the selected lot, T focuses the search, R resets the filters.
 * Q / E live in InventorySwitch, 1 to 6 in VectorShell.
 *
 * The keys move the selection and open or close the same groups a click opens
 * or closes. B delegates opening the editor to the view (`onEdit`); the hook
 * itself writes nothing and never deletes.
 */
export function useInventoryKeys({
  childKeys,
  openGroups,
  setGroupOpen,
  inlineEditActive,
  transientActive,
  cancelEdit,
  cancelTransient,
  blocked,
  resetFilters,
  onEdit,
}: {
  /** Entries of the list below the given path of entered groups; `null` if that group does not exist. */
  childKeys: (path: readonly string[]) => string[] | null
  openGroups: ReadonlySet<string>
  setGroupOpen: (id: string, open: boolean) => void
  inlineEditActive: boolean
  /** A transient element is open (delete confirmation). */
  transientActive: boolean
  cancelEdit: () => void
  cancelTransient: () => void
  /** A request is running: keys do nothing. */
  blocked: boolean
  resetFilters: () => void
  /** Key B on the selected entry; true if an editor was opened. The view checks ownership and editability. */
  onEdit: (selectedKey: string) => boolean
}): { selectedKey: string | null } {
  const [enteredPath, setEnteredPath] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  // A click, a filter or a view switch may have closed or removed entered groups.
  const path = trimPath(enteredPath, (prefix, key) => (childKeys(prefix)?.includes(key) ?? false) && openGroups.has(key))
  const keys = childKeys(path) ?? []
  const selectedKey = selected !== null && keys.includes(selected) ? selected : null

  useEffect(() => {
    if (selectedKey !== null) document.querySelector('[data-key-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedKey])

  function goBack(): boolean {
    if (path.length === 0) return false
    const left = path[path.length - 1]
    setGroupOpen(left, false)
    setEnteredPath(leaveLevel(path))
    setSelected(left)
    return true
  }

  useKeySet((event) => {
    if (blocked) return false
    if (event.type === 'escape') {
      const result = escapeAction({ inlineEditActive, transientActive, typing: event.typing })
      if (result === 'cancel-edit') { cancelEdit(); return true }
      if (result === 'close-transient') { cancelTransient(); return true }
      return result === 'back' ? goBack() : false
    }
    // While the delete confirmation is open the list keys rest.
    if (transientActive) return false
    switch (event.action.type) {
      case 'select-prev':
      case 'select-next': {
        if (keys.length === 0) return false
        setSelected(moveSelection(keys, selectedKey, event.action.type === 'select-prev' ? 'prev' : 'next'))
        return true
      }
      case 'open': {
        if (selectedKey === null) return false
        const deeper = enterLevel(path, selectedKey)
        const children = childKeys(deeper)
        if (children === null) return false // a lot: there is no level below it
        setGroupOpen(selectedKey, true)
        setEnteredPath(deeper)
        setSelected(children[0] ?? null)
        return true
      }
      case 'back':
        return goBack()
      case 'edit':
        return selectedKey !== null && onEdit(selectedKey)
      case 'focus-search': {
        const field = document.getElementById('inventory-search')
        if (!field) return false
        field.focus()
        return true
      }
      case 'reset-filters':
        resetFilters()
        return true
      default:
        return false
    }
  })

  return { selectedKey }
}
