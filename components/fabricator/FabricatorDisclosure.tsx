'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// Uniform collapse pattern of the Fabricator (UX-6a): the native
// <details>/<summary> element. The browser provides Tab focus, Enter / Space
// toggling and the expanded state for assistive technology; there is no custom
// key handling and no ARIA to keep in sync. The summary stays visible while
// closed, so the key statement (status, current choice) never needs an expand.
// Without `open` the element is uncontrolled and starts closed; a parent that
// needs to collapse it (variant choice after a pick) passes `open` and
// `onOpenChange`. `focusSummarySignal` moves the focus to the (still visible)
// summary each time the number goes up: after a collapse the focus would
// otherwise be lost with the hidden button that was just used. It is not set
// by a plain click on the summary itself.

export function FabricatorDisclosure({ summary, children, className, open, onOpenChange, focusSummarySignal = 0 }: {
  summary: ReactNode
  children: ReactNode
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Increase to focus the summary after the next render (variant choice). 0 = never. */
  focusSummarySignal?: number
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (focusSummarySignal > 0) detailsRef.current?.querySelector<HTMLElement>(':scope > summary')?.focus()
  }, [focusSummarySignal])
  return (
    <details className={`fabricator-disclosure${className ? ` ${className}` : ''}`} ref={detailsRef} open={open}
      onToggle={onOpenChange ? event => onOpenChange(event.currentTarget.open) : undefined}>
      <summary className="fabricator-disclosure__summary">{summary}</summary>
      <div className="fabricator-disclosure__body">{children}</div>
    </details>
  )
}
