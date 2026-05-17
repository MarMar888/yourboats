'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { deleteTimeEntry } from './actions'
import { toast } from 'sonner'

type Row = {
  id: string
  userId: string
  employeeName: string
  boatNickname: string | null
  clockIn: Date
  clockOut: Date | null
  notes: string | null
  serviceId: string | null
  serviceDate: string | null
  serviceType: string | null
  customerName: string | null
}

type Employee = { id: string; displayName: string }

const SERVICE_LABELS: Record<string, string> = {
  recurring: 'Standard Clean',
  detailing: 'Detailing',
  buffing_waxing: 'Buffing & Waxing',
  acid_washing: 'Acid Washing',
  powerwashing: 'Powerwashing',
  gelcoat_wetsanding: 'Gelcoat Wet-Sanding',
  captaining: 'Captaining',
  other: 'Other',
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(ymd: string) {
  const [, m, d] = ymd.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${d}`
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtDateTime(d: Date): string {
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${date} ${fmtTime(d)}`
}

function durationLabel(clockIn: Date, clockOut: Date | null): string {
  const end = clockOut ?? new Date()
  const ms = end.getTime() - clockIn.getTime()
  const totalMins = Math.floor(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function minsToLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function DeleteButton({ entryId }: { entryId: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      disabled={pending}
      className="text-xs text-destructive hover:underline disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          if (!confirm('Delete this time entry?')) return
          const r = await deleteTimeEntry(entryId)
          if (!r.ok) toast.error(r.error)
          else toast.success('Deleted')
        })
      }
    >
      Delete
    </button>
  )
}

export function TimePageClient({
  rows,
  employees,
  totalByUser,
  defaultFrom,
  defaultTo,
  defaultUserId,
}: {
  rows: Row[]
  employees: Employee[]
  totalByUser: Record<string, number>
  defaultFrom: string
  defaultTo: string
  defaultUserId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [userId, setUserId] = useState(defaultUserId)

  function applyFilter() {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (userId) params.set('userId', userId)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Grand total minutes
  const grandTotal = Object.values(totalByUser).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Employee</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.displayName}</option>
            ))}
          </select>
        </div>
        <button
          onClick={applyFilter}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Filter
        </button>
      </div>

      {/* Summary */}
      {Object.keys(totalByUser).length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium mb-3">
            Summary
            {grandTotal > 0 && (
              <span className="ml-2 text-muted-foreground font-normal">
                Total: {minsToLabel(grandTotal)}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-4">
            {employees
              .filter((e) => totalByUser[e.id])
              .map((e) => (
                <div key={e.id} className="text-sm">
                  <span className="font-medium">{e.displayName}</span>
                  <span className="text-muted-foreground ml-1.5">{minsToLabel(totalByUser[e.id])}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Entries table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No time entries in this range.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Employee</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Service</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Boat</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Clock in</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Clock out</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Duration</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{r.employeeName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.serviceId ? (
                      <Link
                        href={`/schedule/${r.serviceId}`}
                        className="hover:text-foreground hover:underline transition-colors"
                      >
                        {r.customerName ?? '—'}
                        {r.serviceDate && (
                          <span className="text-xs ml-1">
                            · {fmtDate(r.serviceDate)}
                          </span>
                        )}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.boatNickname ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtDateTime(r.clockIn)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.clockOut ? fmtTime(r.clockOut) : (
                      <span className="text-green-600 text-xs font-medium">live</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {durationLabel(r.clockIn, r.clockOut)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.clockOut && <DeleteButton entryId={r.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
