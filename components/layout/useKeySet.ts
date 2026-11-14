'use client'

import { useEffect, useRef } from 'react'
import {
  isTypingTarget,
  resolveKey,
  type KeyAction,
  type KeyContext,
} from '@/lib/keyboard/key-set'

// Marks an open inline editor (see EditInventoryLotForm).
export const INLINE_EDITOR_SELECTOR = '[data-inline-editor="active"]'
// The account drawer exists in the DOM only while it is open.
const ACCOUNT_DRAWER_SELECTOR = '#vector-account-drawer'

export type KeySetEvent =
  | { type: 'action'; action: KeyAction }
  | { type: 'escape'; typing: boolean }

function readContext(target: EventTarget | null): KeyContext {
  const element = target instanceof HTMLElement ? target : null
  return {
    inlineEditorActive: document.querySelector(INLINE_EDITOR_SELECTOR) !== null,
    accountDrawerOpen: document.querySelector(ACCOUNT_DRAWER_SELECTOR) !== null,
    target: element,
  }
}

/**
 * Attaches ONE keydown listener to the document (removed on unmount) and
 * hands the handler the key action. The handler returns true when it used the
 * key; only then the browser default is prevented. All rules about when a key
 * may act live in lib/keyboard/key-set.ts.
 */
export function useKeySet(handler: (event: KeySetEvent) => boolean, enabled = true) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      const context = readContext(event.target)
      let consumed = false
      if (event.key === 'Escape') {
        // The account drawer closes itself on Esc.
        if (context.accountDrawerOpen) return
        consumed = handlerRef.current({ type: 'escape', typing: isTypingTarget(context.target) })
      } else {
        const action = resolveKey(event, context)
        if (!action) return
        consumed = handlerRef.current({ type: 'action', action })
      }
      if (consumed) event.preventDefault()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
