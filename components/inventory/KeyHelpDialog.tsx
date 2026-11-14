'use client'

import { useRef, useState } from 'react'
import {
  KEY_HELP_CONTEXT_ORDER,
  KEY_HELP_CONTEXT_TITLES,
  KEY_HELP_FOOTNOTES,
  entriesForContext,
} from '@/lib/keyboard/key-help'

/**
 * "Tastenhilfe" button and overview of ALL keys. The button has no key of its
 * own. The overview is a native modal dialog: focus moves in when it opens,
 * Esc or the close button closes it, and focus goes back to the button.
 * While it is open the list keys rest (keydown stops at the dialog), so Esc
 * only closes the overview and never means "back one level" behind it.
 */
export function KeyHelpDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  function openDialog() {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    setOpen(true)
  }
  function closeDialog() {
    dialogRef.current?.close()
  }

  return <>
    <button type="button" ref={buttonRef} className="key-help-button" aria-haspopup="dialog" aria-expanded={open} onClick={openDialog}>Tastenhilfe</button>
    <dialog ref={dialogRef} className="key-help-dialog" aria-labelledby="key-help-title"
      onClose={() => { setOpen(false); buttonRef.current?.focus() }}
      onKeyDown={(event) => { if (event.key !== 'Tab') event.stopPropagation() }}>
      <div className="key-help-dialog__head">
        <h2 id="key-help-title">Tastenhilfe</h2>
        <button type="button" onClick={closeDialog}>Schließen</button>
      </div>
      {KEY_HELP_CONTEXT_ORDER.map((context) => <section key={context} aria-label={KEY_HELP_CONTEXT_TITLES[context]}>
        <h3>{KEY_HELP_CONTEXT_TITLES[context]}</h3>
        <dl>
          {entriesForContext(context).map((entry) => <div key={entry.id}>
            <dt><kbd>{entry.label}</kbd></dt>
            <dd>{entry.text}</dd>
          </div>)}
        </dl>
      </section>)}
      {KEY_HELP_FOOTNOTES.map((note) => <p key={note} className="key-help-dialog__note">{note}</p>)}
    </dialog>
  </>
}
