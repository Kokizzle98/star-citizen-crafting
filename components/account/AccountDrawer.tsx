import Link from 'next/link'

type AccountDrawerProps = {
  nickname: string
  groupName?: string
  groupRole?: string
  isAdmin: boolean
  rsiLinked: boolean
}

export function AccountDrawer({
  nickname,
  groupName,
  groupRole,
  isAdmin,
  rsiLinked,
}: AccountDrawerProps) {
  return (
    <details className="vector-account">
      <summary className="vector-account__trigger">
        <span className="vector-account__identity">
          <strong>{nickname}</strong>
          <span>
            {groupName
              ? `${groupName}${groupRole ? ` · ${groupRole}` : ''}`
              : 'Kein Crew Context'}
          </span>
        </span>

        <span aria-hidden="true">▾</span>
      </summary>

      <div className="vector-account__backdrop" aria-hidden="true" />

      <aside
        className="vector-account__drawer"
        aria-label="VECTOR Account"
      >
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
    </details>
  )
}
