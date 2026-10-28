import Link from 'next/link'
const links=[['/admin','Dashboard'],['/admin/identity','Identitäten & Accounts'],['/admin/items','Item-Katalog'],['/admin/locations','Locations']]
export function AdminMenu(){return <aside aria-label="Administration"><strong>Administration</strong>{links.map(([href,label])=><Link key={href} href={href}>{label}</Link>)}</aside>}
