import type { Metadata } from 'next'
import { Chakra_Petch, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { VectorShell } from '@/components/layout/VectorShell'
import { VectorTopbar } from '@/components/layout/VectorTopbar'
import { FAN_PROJECT_NOTICE } from '@/components/layout/navigation'

// Self-hosted at build time by next/font: no runtime request to Google.
const display = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Segoe UI', 'system-ui', 'sans-serif'],
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['Consolas', 'ui-monospace', 'monospace'],
})

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
    <html lang="de" className={`${display.variable} ${mono.variable}`}>
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

        <footer className="vector-footer">{FAN_PROJECT_NOTICE}</footer>
      </body>
    </html>
  )
}
