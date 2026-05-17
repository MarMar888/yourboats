'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { clockIn, clockOut, addManualEntry, deleteTimeEntry } from '../../time/actions'
import { toast } from 'sonner'

type TimeEntry = {
  id: string
  userId: string
  boatId: string | null
  boatNickname: string | null
  clockIn: Date
  clockOut: Date | null
  notes: string | null
  employeeName: string
}

type Boat = { boatId: string; nickname: string }
type Employee = { id: string; displayName: string }

function durationLabel(clockIn: Date, clockOut: Date | null): string {
  const end = clockOut ?? new Date()
  const ms = end.getTime() - clockIn.getTime()
  const totalMins = Math.floor(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtDateTime(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + fmtTime(d)
}

// ─── Clock in/out for current user ───────────────────────────────────────────

function MyClockButton({
  serviceId,
  boats,
  openEntry,
}: {
  serviceId: string
  boats: Boat[]
  openEntry: TimeEntry | null
}) {
  const [pending, startTransition] = useTransition()
  const [selectedBoat, setSelectedBoat] = useState(boats[0]?.boatId ?? '')

  if (openEntry) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground">
          Clocked in {fmtTime(openEntry.clockIn)}
          {openEntry.boatNickname && ` · ${openEntry.boatNickname}`}
          {' · '}<span className="tabular-nums text-foreground font-medium">{durationLabel(openEntry.clockIn, null)}</span>
        </div>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await clockOut(openEntry.id)
              if (!r.ok) toast.error(r.error)
              else toast.success('Clocked out')
            })
          }
        >
          Clock out
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {boats.length > 1 && (
        <select
          value={selectedBoat}
          onChange={(e) => setSelectedBoat(e.target.value)}
          className="text-sm border rounded-md px-2 py-1.5 bg-background"
        >
          {boats.map((b) => (
            <option key={b.boatId} value={b.boatId}>{b.nickname}</option>
          ))}
        </select>
      )}
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await clockIn(serviceId, selectedBoat || undefined)
            if (!r.ok) toast.error(r.error)
            else toast.success('Clocked in')
          })
        }
      >
        Clock in
      </Button>
    </div>
  )
}

// ─── Manager manual-entry form ────────────────────────────────────────────────

function ManualEntryForm({
  serviceId,
  boats,
  employees,
  onDone,
}: {
  serviceId: string
  boats: Boat[]
  employees: Employee[]
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const today = new Date().toISOString().slice(0, 16) // datetime-local format

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await addManualEntry({
        serviceId,
        boatId: (fd.get('boatId') as string) || null,
        userId: fd.get('userId') as string,
        clockIn: fd.get('clockIn') as string,
        clockOut: fd.get('clockOut') as string,
        notes: fd.get('notes') as string,
      })
      if (!r.ok) toast.error(r.error)
      else { toast.success('Entry added'); onDone() }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-muted/30 space-y-3">
      <p className="text-sm font-medium">Add time entry</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Employee</label>
          <select name="userId" required className="w-full text-sm border rounded-md px-2 py-1.5 bg-background">
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.displayName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Boat</label>
          <select name="boatId" className="w-full text-sm border rounded-md px-2 py-1.5 bg-background">
            <option value="">— none —</option>
            {boats.map((b) => (
              <option key={b.boatId} value={b.boatId}>{b.nickname}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Clock in</label>
          <input
            type="datetime-local"
            name="clockIn"
            defaultValue={today}
            required
            className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Clock out</label>
          <input
            type="datetime-local"
            name="clockOut"
            defaultValue={today}
            required
            className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
        <input
          type="text"
          name="notes"
          placeholder="e.g. hull scrub, engine compartment"
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>Add entry</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

// ─── Entry row ────────────────────────────────────────────────────────────────

function EntryRow({ entry, canManage }: { entry: TimeEntry; canManage: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center justify-between gap-3 text-sm py-2 border-b last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="font-medium shrink-0">{entry.employeeName}</span>
        {entry.boatNickname && (
          <span className="text-xs text-muted-foreground shrink-0">· {entry.boatNickname}</span>
        )}
        <span className="text-muted-foreground text-xs truncate">
          {fmtDateTime(entry.clockIn)}
          {entry.clockOut ? ` → ${fmtTime(entry.clockOut)}` : ' → now'}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`tabular-nums text-sm font-medium ${!entry.clockOut ? 'text-green-600' : ''}`}>
          {durationLabel(entry.clockIn, entry.clockOut)}
          {!entry.clockOut && <span className="text-xs font-normal ml-1">(live)</span>}
        </span>
        {canManage && entry.clockOut && (
          <button
            className="text-xs text-destructive hover:underline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!confirm('Delete this time entry?')) return
                const r = await deleteTimeEntry(entry.id)
                if (!r.ok) toast.error(r.error)
              })
            }
          >
            Delete
          </button>
        )}
        {!entry.clockOut && (
          <button
            className="text-xs text-orange-600 hover:underline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await clockOut(entry.id)
                if (!r.ok) toast.error(r.error)
              })
            }
          >
            Clock out
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TimeTracker({
  serviceId,
  entries,
  boats,
  employees,
  currentUserId,
  canManage,
}: {
  serviceId: string
  entries: TimeEntry[]
  boats: Boat[]
  employees: Employee[]
  currentUserId: string | null
  canManage: boolean
}) {
  const [showForm, setShowForm] = useState(false)

  const myOpenEntry = currentUserId
    ? entries.find((e) => e.userId === currentUserId && !e.clockOut) ?? null
    : null

  const totalMinutes = entries
    .filter((e) => e.clockOut)
    .reduce((sum, e) => {
      const ms = e.clockOut!.getTime() - e.clockIn.getTime()
      return sum + Math.floor(ms / 60000)
    }, 0)

  const totalLabel =
    totalMinutes === 0
      ? null
      : (() => {
          const h = Math.floor(totalMinutes / 60)
          const m = totalMinutes % 60
          return m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h ${m}m`
        })()

  return (
    <div className="space-y-3">
      {/* My clock in/out (shown to anyone assigned to this service) */}
      {currentUserId && (
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">My time</p>
            <MyClockButton serviceId={serviceId} boats={boats} openEntry={myOpenEntry} />
          </div>
        </div>
      )}

      {/* All entries (manager view) */}
      {canManage && (
        <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium">All time entries</p>
              {totalLabel && (
                <span className="text-xs text-muted-foreground">Total: {totalLabel}</span>
              )}
            </div>
            {!showForm && (
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => setShowForm(true)}
              >
                + Add entry
              </button>
            )}
          </div>

          {showForm && (
            <ManualEntryForm
              serviceId={serviceId}
              boats={boats}
              employees={employees}
              onDone={() => setShowForm(false)}
            />
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No time entries yet.</p>
          ) : (
            <div>
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} canManage={canManage} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
