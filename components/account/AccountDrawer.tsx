'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type AccountDrawerProps = {
  nickname: string
  groupName?: string
  groupRole?: string
  isAdmin: boolean
  rsiLinked: boolean
}

const DRAWER_ID = 'vector-account-drawer'

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AccountDrawer({
  nickname,
  groupName,
  groupRole,
  isAdmin,
  rsiLinked,
}: AccountDrawerProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const wasOpen = useRef(false)

  const close = useCallback(() => setOpen(false), [])

  // The drawer is portalled to <body> so no topbar stacking context or
  // containing block can constrain it.
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (open) {
      wasOpen.current = true
      closeRef.current?.focus()
    } else if (wasOpen.current) {
      wasOpen.current = false
      triggerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) {
        return
      }

      const items = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      )

      if (items.length === 0) {
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (!drawerRef.current.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const drawer = (
    <>
      <div
        className="vector-account__backdrop"
        aria-hidden="true"
        onClick={close}
      />

      <aside
        id={DRAWER_ID}
        ref={drawerRef}
        className="vector-account__drawer"
        role="dialog"
        aria-modal="true"
        aria-label="VECTOR Account"
      >
        <button
          ref={closeRef}
          className="vector-account__close"
          type="button"
          onClick={close}
          aria-label="Account-Menü schließen"
        >
          ✕
        </button>

        <header className="vector-account__header">
          <p>VECTOR IDENTITY</p>
          <strong>{nickname}</strong>

          {groupName ? (
            <>
              <span>{groupName}</span>
              <span className="vector-account__connected">
                ● CONNECTED · {groupRole}
              </span>
            </>
          ) : (
            <span>Kein aktiver Crew Context</span>
          )}
        </header>

        <nav aria-label="Account-Verwaltung">
          <section>
            <p className="vector-account__section-title">
              ACCOUNT
            </p>

            <Link href="/account/security">
              Login &amp; Sicherheit
            </Link>

            <Link href="/account/security">
              Verknüpfte Accounts
            </Link>

            <Link href="/account/security">
              Game Accounts {rsiLinked ? '✓' : ''}
            </Link>
          </section>

          <section>
            <p className="vector-account__section-title">
              CREW
            </p>

            <Link href="/vector">
              Crew Übersicht
            </Link>
          </section>

          {isAdmin ? (
            <section>
              <p className="vector-account__section-title">
                SYSTEM
              </p>

              <Link href="/admin">
                Administration
              </Link>
            </section>
          ) : null}
        </nav>

        <form
          className="vector-account__signout"
          action="/auth/signout"
          method="post"
        >
          <button type="submit">Abmelden</button>
        </form>
      </aside>
    </>
  )

  return (
    <div className="vector-account">
      <button
        ref={triggerRef}
        className="vector-account__trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? DRAWER_ID : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="vector-account__identity">
          <strong>{nickname}</strong>
          <span>
            {groupName
              ? `${groupName}${groupRole ? ` · ${groupRole}` : ''}`
              : 'Kein Crew Context'}
          </span>
        </span>

        <span aria-hidden="true">▾</span>
      </button>

      {mounted && open ? createPortal(drawer, document.body) : null}
    </div>
  )
}
