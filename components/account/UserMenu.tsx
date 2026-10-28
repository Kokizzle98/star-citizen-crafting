import Link from 'next/link'
export function UserMenu({ nickname, isAdmin, rsiLinked }:{nickname:string,isAdmin:boolean,rsiLinked:boolean}) {
 return <details><summary>{nickname}</summary><nav aria-label="Benutzerkonto"><strong>{nickname}</strong><Link href="/account/security">Account & Sicherheit</Link><Link href="/account/security">Verknüpfte Accounts</Link><Link href="/account/security">Game Accounts {rsiLinked?'✓':''}</Link>{isAdmin&&<Link href="/admin">Administration</Link>}<form action="/auth/signout" method="post"><button type="submit">Abmelden</button></form></nav></details>
}
