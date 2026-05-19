'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { clockIn, clockOut } from '@/app/(app)/time/actions'
import { toast } from 'sonner'
import posthog from 'posthog-js'

type Combo = {
  serviceId: string
  boatId: string
  label: string
}

type OpenEntry = {
  id: string
  serviceId: string
  boatId: string | null
  clockIn: string // ISO string
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [
    h > 0 ? String(h) : null,
    String(h > 0 ? m : m).padStart(h > 0 ? 2 : 1, '0'),
    String(s).padStart(2, '0'),
  ]
    .filter((v) => v !== null)
    .join(':')
}

export function ClockClient({
  userId,
  assigned,
  openEntry,
}: {
  userId: string
  assigned: Combo[]
  openEntry: OpenEntry | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Which combo is selected in the dropdown
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    if (openEntry) {
      return `${openEntry.serviceId}__${openEntry.boatId ?? ''}`
    }
    if (assigned.length > 0) {
      return `${assigned[0].serviceId}__${assigned[0].boatId}`
    }
    return ''
  })

  // Live elapsed timer
  const [elapsed, setElapsed] = useState<number>(0)
  useEffect(() => {
    if (!openEntry) { setElapsed(0); return }
    const start = new Date(openEntry.clockIn).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [openEntry])

  const isClocked = openEntry !== null
  const selectedCombo = assigned.find(
    (a) => `${a.serviceId}__${a.boatId}` === selectedKey
  )

  function handleClockIn() {
    if (!selectedCombo) return
    startTransition(async () => {
      const r = await clockIn(selectedCombo.serviceId, selectedCombo.boatId)
      if (!r.ok) {
        toast.error(r.error)
      } else {
        toast.success('Clocked in')
        posthog.capture('employee_clocked_in', { service_id: selectedCombo.serviceId, boat_id: selectedCombo.boatId, user_id: userId })
        router.refresh()
      }
    })
  }

  function handleClockOut() {
    if (!openEntry) return
    startTransition(async () => {
      const r = await clockOut(openEntry.id)
      if (!r.ok) {
        toast.error(r.error)
      } else {
        toast.success('Clocked out — ' + formatElapsed(elapsed))
        posthog.capture('employee_clocked_out', { service_id: openEntry.serviceId, boat_id: openEntry.boatId, elapsed_seconds: elapsed, user_id: userId })
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 px-4">

      {/* Timer display */}
      <div className="text-center">
        <div
          className={`text-7xl font-mono font-semibold tabular-nums tracking-tight transition-colors ${
            isClocked ? 'text-green-600' : 'text-muted-foreground/30'
          }`}
        >
          {isClocked ? formatElapsed(elapsed) : '0:00'}
        </div>
        {isClocked && (
          <p className="text-sm text-muted-foreground mt-2">
            Clocked in to{' '}
            <span className="font-medium text-foreground">
              {assigned.find(
                (a) =>
                  a.serviceId === openEntry.serviceId &&
                  a.boatId === (openEntry.boatId ?? '')
              )?.label ?? 'a service'}
            </span>
          </p>
        )}
      </div>

      {/* Combo selector — disabled while clocked in */}
      <div className="w-full max-w-sm">
        {assigned.length === 0 ? (
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
            No services assigned to you today.
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide block text-center">
              {isClocked ? 'Currently clocked into' : 'Clock in to'}
            </label>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              disabled={isClocked || pending}
              className="w-full rounded-lg border border-input bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {assigned.map((a) => (
                <option key={`${a.serviceId}__${a.boatId}`} value={`${a.serviceId}__${a.boatId}`}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Clock in / Clock out button */}
      {assigned.length > 0 && (
        <button
          onClick={isClocked ? handleClockOut : handleClockIn}
          disabled={pending || (!isClocked && !selectedCombo)}
          className={`
            w-full max-w-sm py-5 rounded-2xl text-lg font-semibold transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            ${
              isClocked
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
            }
          `}
        >
          {pending
            ? isClocked
              ? 'Clocking out…'
              : 'Clocking in…'
            : isClocked
            ? 'Clock out'
            : 'Clock in'}
        </button>
      )}
    </div>
  )
}
