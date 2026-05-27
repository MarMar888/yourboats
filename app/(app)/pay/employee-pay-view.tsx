'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  getCurrentPeriod,
  getPeriodByIndex,
  formatPeriodLabel,
  type PayPeriod,
} from '@/lib/pay/periods'
import type { MyServiceRow } from '@/app/api/pay/my-period/route'

const SERVICE_TYPE_LABELS: Record<string, string> = {
  recurring:          'Recurring Clean',
  detailing:          'Detailing',
  buffing_waxing:     'Buff & Wax',
  acid_washing:       'Acid Wash',
  powerwashing:       'Power Wash',
  gelcoat_wetsanding: 'Gelcoat',
  captaining:         'Captaining',
  other:              'Other',
}

function fmt(n: number) { return `$${n.toFixed(2)}` }

function fmtDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

export function EmployeePayView() {
  // periodOffset: 0 = current period, 1 = previous, etc.
  const [periodOffset, setPeriodOffset] = useState(0)
  const [rows, setRows] = useState<MyServiceRow[] | null>(null)
  const [loading, startTransition] = useTransition()
  const [error, setError] = useState('')

  const currentIdx = getCurrentPeriod().index
  const period: PayPeriod = getPeriodByIndex(currentIdx - periodOffset)

  useEffect(() => {
    setRows(null)
    setError('')
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/pay/my-period?startDate=${period.startStr}&endDate=${period.endStr}`
        )
        if (!res.ok) throw new Error('Failed to load pay data')
        const data = await res.json() as { services: MyServiceRow[] }
        setRows(data.services)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error loading pay')
      }
    })
  }, [period.startStr, period.endStr])

  const totalNetPay = rows?.reduce((sum, r) => sum + r.netPay, 0) ?? 0

  return (
    <div className="space-y-4 max-w-lg">
      {/* Period navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPeriodOffset((i) => i + 1)}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium flex-1 text-center">
          {formatPeriodLabel(period)}
        </span>
        <button
          onClick={() => setPeriodOffset((i) => Math.max(0, i - 1))}
          disabled={periodOffset === 0}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>

      {/* Summary total */}
      {rows && rows.length > 0 && (
        <div className="rounded-xl border bg-card px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">My earnings this period</span>
          <span className="text-lg font-bold tabular-nums">{fmt(totalNetPay)}</span>
        </div>
      )}

      {/* Service rows */}
      {loading && (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
      )}

      {rows !== null && !loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No completed services for this period.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="divide-y rounded-xl border bg-card overflow-hidden text-sm">
          {rows.map((row) => (
            <div key={row.serviceId} className="px-4 py-3 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-tight">{row.customerName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(row.serviceDate)}
                    {' · '}
                    {SERVICE_TYPE_LABELS[row.serviceType] ?? row.serviceType}
                  </p>
                  {row.boats.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {row.boats.join(', ')}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold tabular-nums">{fmt(row.netPay)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {row.splitPct}% of {fmt(row.totalPrice)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
