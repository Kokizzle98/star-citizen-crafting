'use client'
import { useState } from 'react'
export function LinkRSIButton({ enabled }: { enabled: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function link() {
    setLoading(true); setError('')
    const r = await fetch('/api/auth/link/start', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({provider:'custom:citizen-id',next:'/account/security'}) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.url) { setError(d.error === 'PROVIDER_DISABLED' ? 'Provider im PreFlight deaktiviert.' : 'Verknüpfung konnte nicht gestartet werden.'); setLoading(false); return }
    location.assign(d.url)
  }
  return <><button type="button" onClick={link} disabled={!enabled || loading}>{!enabled?'Demnächst verfügbar':loading?'Verknüpfen…':'Mit RSI verknüpfen'}</button>{error && <p role="alert">{error}</p>}</>
}
