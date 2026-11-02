'use client'

import { createContext, useContext, useState } from 'react'
import type { UnitMode } from '@/lib/inventory/inventory-display'

const UnitContext = createContext<{
  mode: UnitMode
  setMode: (mode: UnitMode) => void
}>({
  mode: 'AUTO',
  setMode: () => {},
})

export function UnitPreference({
  children,
}: {
  children: React.ReactNode
}) {
  const [mode, setMode] = useState<UnitMode>('AUTO')

  return (
    <UnitContext.Provider value={{ mode, setMode }}>
      {children}
    </UnitContext.Provider>
  )
}

export function useUnitPreference() {
  return useContext(UnitContext)
}

function isUnitMode(value: string): value is UnitMode {
  return value === 'AUTO' ||
    value === 'SCU' ||
    value === 'cSCU' ||
    value === 'mSCU' ||
    value === 'µSCU'
}

export function UnitControl() {
  const { mode, setMode } = useUnitPreference()

  return (
    <div className="vector-topbar__crew vector-unit-control">
      <label htmlFor="vector-unit">UNIT</label>
      <select
        id="vector-unit"
        value={mode}
        onChange={(event) => {
          const value = event.target.value

          if (isUnitMode(value)) {
            setMode(value)
          }
        }}
      >
        <option value="AUTO">AUTO</option>
        <option value="SCU">SCU</option>
        <option value="cSCU">cSCU</option>
        <option value="mSCU">mSCU</option>
        <option value="µSCU">µSCU</option>
      </select>
    </div>
  )
}
