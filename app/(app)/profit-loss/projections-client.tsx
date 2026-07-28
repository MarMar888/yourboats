'use client'

import { useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  computeProjectionTotals,
  computeProjectionWeeks,
  SEASON_END,
  type SalariedRuleProjection,
  type ScheduledServiceRow,
} from '@/lib/pay/projections'

export type { SalariedRuleProjection, ScheduledServiceRow }

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function pctColor(laborPct: number) {
  if (laborPct > 55) return 'text-red-600'
  if (laborPct > 40) return 'text-amber-600'
  return 'text-green-700'
}

function formatWeekLabel(monStr: string): string {
  const d = new Date(monStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function ProjectionsClient({
  scheduledServices,
  salariedRules,
  today,
}: {
  scheduledServices: ScheduledServiceRow[]
  salariedRules: SalariedRuleProjection[]
  today: string
}) {
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({})
  const toggleWeek = useCallback((ws: string) => {
    setExpandedWeeks((prev) => ({ ...prev, [ws]: !prev[ws] }))
  }, [])

  const weeks = useMemo(
    () => computeProjectionWeeks(scheduledServices, salariedRules, SEASON_END),
    [scheduledServices, salariedRules],
  )

  const totals = useMemo(() => computeProjectionTotals(weeks), [weeks])

  const hasData = scheduledServices.some((s) => s.price > 0)

  return (
    <div className="space-y-8">

      {/* ── Season summary cards ───────────────────────────────────────────── */}
      {hasData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Projected Revenue" value={fmt(totals.revenue)} sub={`${weeks.length} weeks`} />
          <SummaryCard label="Variable Labor" value={fmt(totals.varLabor)} sub={`${totals.revenue > 0 ? ((totals.varLabor / totals.revenue) * 100).toFixed(1) : 0}% of rev`} color="amber" />
          <SummaryCard label="Salaried Costs" value={fmt(totals.salariedCost)} sub="GM salary + bonus" color="amber" />
          <SummaryCard
            label="Projected Profit"
            value={fmt(totals.profit)}
            sub={totals.revenue > 0 ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}% margin` : '—'}
            color={totals.profit >= 0 ? 'green' : 'red'}
          />
        </div>
      )}

      {/* ── Week-by-week table ─────────────────────────────────────────────── */}
      {weeks.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Week-by-week forecast</h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Week of</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Services</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Var. Labor</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Salaried</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Labor %</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {weeks.map((week, idx) => {
                  const revenue = week.occurrences.reduce((s, o) => s + o.price, 0)
                  const varLabor = week.occurrences.reduce((s, o) => s + o.price * (o.sharePct / 100), 0)
                  const totalLabor = varLabor + week.salariedCost
                  const profit = revenue - totalLabor
                  const laborPct = revenue > 0 ? (totalLabor / revenue) * 100 : null
                  const isExpanded = !!expandedWeeks[week.weekStart]
                  const rowBg = idx % 2 === 1 ? 'bg-muted/10' : ''

                  return (
                    <>
                      <tr
                        key={week.weekStart}
                        className={`align-top hover:bg-muted/20 transition-colors cursor-pointer select-none ${rowBg}`}
                        onClick={() => toggleWeek(week.weekStart)}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground font-medium tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-muted-foreground/40 text-[10px]">{isExpanded ? '▾' : '▸'}</span>
                            {formatWeekLabel(week.weekStart)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {week.occurrences.map((o, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 bg-primary/8 text-primary"
                              >
                                <Link
                                  href={`/schedule/${o.id}`}
                                  className="hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {o.customerName}
                                </Link>
                                {o.price > 0 && <span className="opacity-60">{fmt(o.price)}</span>}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {revenue > 0 ? fmt(revenue) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                          {varLabor > 0 ? fmt(varLabor) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                          {week.salariedCost > 0 ? fmt(week.salariedCost) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                          {laborPct != null
                            ? <span className={pctColor(laborPct)}>{laborPct.toFixed(0)}%</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                          {revenue > 0
                            ? <span className={profit >= 0 ? 'text-green-700' : 'text-red-600'}>{fmt(profit)}</span>
                            : <span className="text-red-600 text-xs">{fmt(-week.salariedCost)}</span>}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${week.weekStart}-detail`} className={rowBg}>
                          <td colSpan={7} className="px-6 pb-3 pt-0">
                            <div className="rounded-md border bg-muted/30 px-4 py-3 text-xs space-y-3">
                              {/* Per-service breakdown */}
                              <div>
                                <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1.5">Revenue breakdown</p>
                                <table className="w-full">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left font-normal pb-1">Customer</th>
                                      <th className="text-left font-normal pb-1">Date</th>
                                      <th className="text-right font-normal pb-1">Price</th>
                                      <th className="text-right font-normal pb-1">Pool %</th>
                                      <th className="text-right font-normal pb-1">Var. labor</th>
                                      <th className="text-right font-normal pb-1">Owner net</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/40">
                                    {week.occurrences.map((o, i) => {
                                      const oLabor = o.price * (o.sharePct / 100)
                                      return (
                                        <tr key={i}>
                                          <td className="py-0.5">
                                            <Link href={`/schedule/${o.id}`} className="hover:text-primary hover:underline">
                                              {o.customerName}
                                            </Link>
                                          </td>
                                          <td className="py-0.5 text-muted-foreground">{o.date}</td>
                                          <td className="py-0.5 text-right tabular-nums">{fmt(o.price)}</td>
                                          <td className="py-0.5 text-right tabular-nums text-muted-foreground">{o.sharePct}%</td>
                                          <td className="py-0.5 text-right tabular-nums text-amber-700">{fmt(oLabor)}</td>
                                          <td className="py-0.5 text-right tabular-nums text-green-700">{fmt(o.price - oLabor)}</td>
                                        </tr>
                                      )
                                    })}
                                    <tr className="font-semibold border-t border-border/60">
                                      <td className="pt-1" colSpan={2}>Total</td>
                                      <td className="pt-1 text-right tabular-nums">{fmt(revenue)}</td>
                                      <td />
                                      <td className="pt-1 text-right tabular-nums text-amber-700">{fmt(varLabor)}</td>
                                      <td className="pt-1 text-right tabular-nums text-green-700">{fmt(revenue - varLabor)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              {/* Salaried costs */}
                              {week.salariedBreakdown.length > 0 && (
                                <div>
                                  <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1.5">Salaried costs</p>
                                  <table className="w-full">
                                    <tbody className="divide-y divide-border/40">
                                      {week.salariedBreakdown.map((b, i) => (
                                        <tr key={i}>
                                          <td className="py-0.5 text-muted-foreground">{b.name}</td>
                                          <td className="py-0.5 text-right tabular-nums">{fmt(b.amount)}</td>
                                        </tr>
                                      ))}
                                      <tr className="font-semibold border-t border-border/60">
                                        <td className="pt-1">Total salaried</td>
                                        <td className="pt-1 text-right tabular-nums">{fmt(week.salariedCost)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              <div className="border-t border-border/60 pt-2 flex justify-between font-semibold">
                                <span>Week profit</span>
                                <span className={profit >= 0 ? 'text-green-700' : 'text-red-600'}>
                                  {fmt(revenue)} − {fmt(varLabor)} − {fmt(week.salariedCost)} = {fmt(profit)}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
              <tfoot className="border-t bg-muted/50 font-semibold">
                <tr>
                  <td className="px-4 py-2.5 text-sm" colSpan={2}>Season total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totals.revenue)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{fmt(totals.varLabor)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{fmt(totals.salariedCost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    {totals.revenue > 0 && (
                      <span className={pctColor((totals.totalLabor / totals.revenue) * 100)}>
                        {((totals.totalLabor / totals.revenue) * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{fmt(totals.profit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Click any row to expand the math. Variable labor = price × pool %. Salaried = GM salary + bonus (prorated).
          </p>
        </section>
      )}

      {weeks.length === 0 && (
        <div className="rounded-lg border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          No upcoming services found through {SEASON_END}.
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: 'green' | 'red' | 'amber' }) {
  const valueColor = color === 'green' ? 'text-green-700' : color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-700' : ''
  return (
    <div className="rounded-lg border bg-card px-4 py-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
