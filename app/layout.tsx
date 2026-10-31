import type { Metadata } from 'next'
import './globals.css'
import { VectorShell } from '@/components/layout/VectorShell'
import { VectorTopbar } from '@/components/layout/VectorTopbar'

export const metadata: Metadata = {
  title: {
    default: 'VECTOR',
    template: '%s | VECTOR',
  },
  description: 'VECTOR crew, inventory and crafting platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de">
      <body>
        <a className="skip-link" href="#main">
          Zum Inhalt springen
        </a>

        <VectorShell>
          <VectorTopbar />

          <main id="main" className="vector-content">
            {children}
          </main>
        </VectorShell>
      </body>
    </html>
  )
}
