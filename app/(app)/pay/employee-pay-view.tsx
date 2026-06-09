'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  getCurrentPeriod,
  getPeriodByIndex,
  formatPeriodLabel,
  type PayPeriod,
} from '@/lib/pay/periods'
import type { MyServiceRow } from '@/app/api/pay/my-period/route'
import { cn } from '@/lib/utils'

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

// ─── Explanation tab ──────────────────────────────────────────────────────────

function GlossaryItem({ term, def }: { term: string; def: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium">{term}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{def}</p>
    </div>
  )
}

function ExplanationTab({ rows }: { rows: MyServiceRow[] | null }) {
  const hasData = rows != null && rows.length > 0

  const totalRevenue = hasData ? rows.reduce((s, r) => s + r.totalPrice, 0) : 0
  const totalPool    = hasData ? rows.reduce((s, r) => s + r.employeePool, 0) : 0
  const totalNetPay  = hasData ? rows.reduce((s, r) => s + r.netPay, 0) : 0
  const totalTips    = hasData ? rows.reduce((s, r) => s + r.tipShare, 0) : 0
  const totalPay     = hasData ? rows.reduce((s, r) => s + r.totalPay, 0) : 0

  // For bars — default to 60/40 split if no data yet
  const crewPct         = totalRevenue > 0 ? (totalPool / totalRevenue) * 100 : 60
  const yourShareOfPool = totalPool    > 0 ? (totalNetPay / totalPool)    * 100 : 0

  // Pick first row as the worked example
  const ex = hasData ? rows[0] : null
  const exCrewPct = ex && ex.totalPrice > 0
    ? Math.round(ex.employeePool / ex.totalPrice * 100)
    : null

  return (
    <div className="space-y-4">

      {/* ── Visual bar breakdown ── */}
      <div className="rounded-xl border bg-card p-4 space-y-5">
        <p className="text-sm font-semibold">
          {hasData ? 'This period — where your pay comes from' : 'How your pay is calculated'}
        </p>

        {/* Stage 1: Revenue split */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Service revenue</span>
            {hasData && <span className="font-medium tabular-nums">{fmt(totalRevenue)}</span>}
          </div>
          <div className="h-7 rounded-lg overflow-hidden flex text-[11px] font-semibold">
            <div
              className="bg-sky-400 flex items-center justify-center text-white"
              style={{ width: `${crewPct}%` }}
            >
              {Math.round(crewPct)}%
            </div>
            <div className="flex-1 bg-muted flex items-center justify-center text-muted-foreground">
              {Math.round(100 - crewPct)}%
            </div>
          </div>
          <div className="flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-400" />
              Crew pool{hasData ? ` ${fmt(totalPool)}` : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted border" />
              Business{hasData ? ` ${fmt(totalRevenue - totalPool)}` : ''}
            </span>
          </div>
        </div>

        {hasData && (
          <>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 pl-1">
              <span>↓</span>
              <span>your split of the crew pool</span>
            </div>

            {/* Stage 2: Pool → your share */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Crew pool</span>
                <span className="font-medium tabular-nums">{fmt(totalPool)}</span>
              </div>
              <div className="h-7 rounded-lg bg-sky-100 overflow-hidden flex text-[11px] font-semibold">
                <div
                  className="bg-primary flex items-center justify-center text-primary-foreground"
                  style={{ width: `${Math.max(yourShareOfPool, 4)}%` }}
                >
                  {yourShareOfPool >= 12 ? `${Math.round(yourShareOfPool)}%` : ''}
                </div>
                <div className="flex-1" />
              </div>
              <div className="flex gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary" />
                  Your pay {fmt(totalNetPay)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-100 border border-sky-200" />
                  Others {fmt(totalPool - totalNetPay)}
                </span>
              </div>
            </div>

            {/* Total callout */}
            <div className="rounded-lg bg-muted/50 px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Your total{totalTips > 0 ? ` (incl. ${fmt(totalTips)} tips)` : ''}
              </span>
              <span className="text-sm font-bold tabular-nums">{fmt(totalPay)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Step-by-step formula using a real service ── */}
      {ex && exCrewPct != null && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Example service</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ex.customerName} · {fmtDate(ex.serviceDate)} · {SERVICE_TYPE_LABELS[ex.serviceType] ?? ex.serviceType}
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service revenue</span>
              <span className="tabular-nums font-medium">{fmt(ex.totalPrice)}</span>
            </div>

            <div className="flex justify-between pl-3 border-l-2 border-sky-300">
              <span className="text-muted-foreground">
                × {exCrewPct}% goes to crew → pool
              </span>
              <span className="tabular-nums font-medium">{fmt(ex.employeePool)}</span>
            </div>

            {ex.deductionPct > 0 ? (
              <>
                <div className="flex justify-between pl-3 border-l-2 border-primary/30">
                  <span className="text-muted-foreground">× {ex.splitPct}% your split</span>
                  <span className="tabular-nums">{fmt(ex.employeePool * ex.splitPct / 100)}</span>
                </div>
                <div className="flex justify-between pl-3 border-l-2 border-primary/30">
                  <span className="text-muted-foreground">− {ex.deductionPct}% tier deduction</span>
                  <span className="tabular-nums text-muted-foreground">
                    − {fmt(ex.employeePool * ex.deductionPct / 100)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between pl-3 border-l-2 border-primary/30">
                <span className="text-muted-foreground">× {ex.splitPct}% your split</span>
                <span className="tabular-nums font-medium">{fmt(ex.netPay)}</span>
              </div>
            )}

            <div className="flex justify-between font-medium pt-1 border-t">
              <span>Your pay</span>
              <span className="tabular-nums">{fmt(ex.netPay)}</span>
            </div>

            {ex.tipShare > 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>+ tip share</span>
                  <span className="tabular-nums">{fmt(ex.tipShare)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total</span>
                  <span className="tabular-nums">{fmt(ex.totalPay)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Glossary ── */}
      <div className="rounded-xl border bg-card overflow-hidden divide-y">
        <div className="px-4 py-3 text-sm font-semibold">What each term means</div>
        <GlossaryItem
          term="Crew pool"
          def="The portion of a service's revenue shared among the crew. Different service types have different crew percentages — so more specialized work may put more into the pool."
        />
        <GlossaryItem
          term="Split %"
          def="Your share of the crew pool for that job, divided equally among everyone who worked it. Two people on a job = 50% each. Three people = ~33% each."
        />
        {ex && ex.deductionPct > 0 && (
          <GlossaryItem
            term={`Tier deduction (${ex.deductionPct}%)`}
            def={`A percentage held back from your split based on your tier. Your effective rate is ${ex.splitPct}% split − ${ex.deductionPct}% deduction = ${ex.effectivePct}% of the pool.`}
          />
        )}
        <GlossaryItem
          term="Effective rate"
          def="Your split minus any tier deduction. This is the actual % of the crew pool that becomes your take-home pay."
        />
        <GlossaryItem
          term="Tip share"
          def="If a tip is recorded for a service, it's split equally among everyone who worked that job and added on top of your pay."
        />
      </div>

      {!hasData && rows != null && (
        <p className="text-xs text-muted-foreground text-center">
          Navigate to a period with saved payroll to see your personalized numbers.
        </p>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function EmployeePayView() {
  const [periodOffset, setPeriodOffset] = useState(0)
  const [tab, setTab] = useState<'services' | 'how-it-works'>('services')
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

  const totalEarnings = rows?.reduce((sum, r) => sum + r.totalPay, 0) ?? 0

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
          <span className="text-lg font-bold tabular-nums">{fmt(totalEarnings)}</span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex border-b">
        {(['services', 'how-it-works'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'services' ? 'Services' : 'How it works'}
          </button>
        ))}
      </div>

      {/* Services tab */}
      {tab === 'services' && (
        <>
          {loading && (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
          )}

          {rows !== null && !loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No payroll records for this period yet — check back once the manager saves the period.
            </p>
          )}

          {rows && rows.length > 0 && (
            <>
              <div className="divide-y rounded-xl border bg-card overflow-hidden text-sm">
                {rows.map((row) => {
                  const crewSharePct = row.totalPrice > 0
                    ? Math.round(row.employeePool / row.totalPrice * 100)
                    : null
                  return (
                    <div key={row.serviceId} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium leading-tight">{row.customerName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtDate(row.serviceDate)}
                            {' · '}
                            {SERVICE_TYPE_LABELS[row.serviceType] ?? row.serviceType}
                          </p>
                          {row.boats.length > 0 && (
                            <p className="text-xs text-muted-foreground">{row.boats.join(', ')}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold tabular-nums">{fmt(row.totalPay)}</p>
                          <span className={
                            row.approved
                              ? 'inline-block text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 mt-1'
                              : 'inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1'
                          }>
                            {row.approved ? '✓ Approved' : 'Draft'}
                          </span>
                        </div>
                      </div>

                      {/* Pay math breakdown */}
                      <div className="text-[11px] text-muted-foreground space-y-0.5 tabular-nums">
                        {crewSharePct !== null && row.employeePool > 0 && (
                          <p>
                            Revenue {fmt(row.totalPrice)} · {crewSharePct}% to crew = pool {fmt(row.employeePool)}
                          </p>
                        )}
                        <p>
                          {row.deductionPct > 0
                            ? `${row.splitPct}% split − ${row.deductionPct}% tier deduction = ${row.effectivePct}% of pool = ${fmt(row.netPay)}`
                            : `Your ${row.splitPct}% of pool = ${fmt(row.netPay)}`
                          }
                          {row.tipShare > 0 && ` + ${fmt(row.tipShare)} tip`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {rows.some((r) => !r.approved) && (
                <p className="text-xs text-muted-foreground">
                  Draft entries are saved but not yet approved — amounts may still change.
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* How it works tab */}
      {tab === 'how-it-works' && (
        <>
          {loading && (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          )}
          {!loading && <ExplanationTab rows={rows} />}
        </>
      )}
    </div>
  )
}
