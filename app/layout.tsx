import type { Metadata } from 'next'
import './globals.css'
import { AppHeader } from '@/components/layout/AppHeader'

export const metadata: Metadata = {
  title: { default: 'VECTOR', template: '%s | VECTOR' },
  description: 'VECTOR crew, inventory and crafting platform',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        <a className="skip-link" href="#main">Zum Inhalt springen</a>
        <AppHeader />
        <main id="main" className="shell">{children}</main>
      </body>
    </html>
  )
}
