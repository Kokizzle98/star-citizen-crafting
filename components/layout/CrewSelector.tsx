'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AvailableGroup } from '@/lib/groups/crew-context'
import { setActiveCrew } from '@/lib/groups/set-active-crew'

type Props = {
  activeGroupId: string | null
  availableGroups: AvailableGroup[]
}

export function CrewSelector({ activeGroupId, availableGroups }: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(activeGroupId)
  const [saving, setSaving] = useState(false)
  const [refreshing, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    setSelectedId(activeGroupId)
  }, [activeGroupId])

  async function changeCrew(groupId: string) {
    if (inFlight.current || refreshing || groupId === selectedId) return

    inFlight.current = true
    setSaving(true)
    setMessage('Crew wird gewechselt …')
    setFailed(false)

    try {
      const result = await setActiveCrew(groupId)
      if (result.error) {
        setFailed(true)
        setMessage(result.error)
        return
      }

      setSelectedId(groupId)
      setMessage('Crew wurde gewechselt.')
      startTransition(() => router.refresh())
    } catch {
      setFailed(true)
      setMessage('Die Crew konnte nicht gewechselt werden. Bitte versuche es erneut.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <div className="vector-topbar__control vector-topbar__crew">
      {availableGroups.length > 0 && selectedId ? (
        <>
          <label htmlFor="active-crew">CREW</label>
          <select
            id="active-crew"
            value={selectedId}
            disabled={saving || refreshing || availableGroups.length < 2}
            onChange={(event) => void changeCrew(event.target.value)}
            aria-describedby="active-crew-status"
          >
            {availableGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </>
      ) : (
        <>
          <span>CREW</span>
          <strong>Keine Crew verfügbar</strong>
        </>
      )}
      <span
        id="active-crew-status"
        className={failed ? 'vector-topbar__crew-status vector-topbar__crew-status--error' : 'vector-topbar__crew-status'}
        role="status"
      >
        {message}
      </span>
    </div>
  )
}
