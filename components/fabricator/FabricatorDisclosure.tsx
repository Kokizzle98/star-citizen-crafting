'use client'

import type { ReactNode } from 'react'

// Uniform collapse pattern of the Fabricator (UX-6a): the native
// <details>/<summary> element. The browser provides Tab focus, Enter / Space
// toggling and the expanded state for assistive technology; there is no custom
// key handling and no ARIA to keep in sync. The summary stays visible while
// closed, so the key statement (status, current choice) never needs an expand.
// Without `open` the element is uncontrolled and starts closed; a parent that
// needs to collapse it (variant choice after a pick) passes `open` and
// `onOpenChange`.

export function FabricatorDisclosure({ summary, children, className, open, onOpenChange }: {
  summary: ReactNode
  children: ReactNode
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <details className={`fabricator-disclosure${className ? ` ${className}` : ''}`} open={open}
      onToggle={onOpenChange ? event => onOpenChange(event.currentTarget.open) : undefined}>
      <summary className="fabricator-disclosure__summary">{summary}</summary>
      <div className="fabricator-disclosure__body">{children}</div>
    </details>
  )
}
