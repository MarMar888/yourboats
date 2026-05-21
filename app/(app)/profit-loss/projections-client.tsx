'use client'

import { useState, useMemo } from 'react'

export type RecurringContract = {
  id: string
  customerId: string
  customerName: string
  serviceType: string
  frequencyWeeks: number
  dayOfWeek: number       // 0=Sun…6=Sat
  startDate: string       // YYYY-MM-DD
  endDate: string         // YYYY-MM-DD
  sharePct: number        // employee pool %
  avgActualPrice: number | null
}

export type SalariedRuleProjection = {
  id: string
  displayName: string
  type: string            // 'gm_salary' | 'quality_bonus'
  amountPerWeek: number | null
  amountFlat: number | null
  effectiveFrom: string   // YYYY-MM-DD
  effectiveTo: string     // YYYY-MM-DD
  frequencyWeeks: number  // 1 for gm_salary, 2 for quality_bonus
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function pctColor(laborPct: number) {
  if (laborPct > 55) return 'text-red-600'
  if (laborPct > 40) return 'text-amber-600'
  return 'text-green-700'
}

// Monday-anchored week start for a given date string YYYY-MM-DD
function weekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay() // 0=Sun
  const daysToMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(d.getTime() + daysToMon * 86_400_000)
  return mon.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10)
}

function formatWeekLabel(monStr: string): string {
  const d = new Date(monStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// All occurrence dates for a recurring contract from today onward
function getOccurrences(contract: RecurringContract, today: string, seasonEnd: string): string[] {
  const results: string[] = []
  const start = contract.startDate > today ? contract.startDate : today
  const end = contract.endDate < seasonEnd ? contract.endDate : seasonEnd

  // Find first occurrence on or after `start` on the right dayOfWeek
  let cur = new Date(start + 'T12:00:00Z')
  const targetDow = contract.dayOfWeek
  while (cur.getUTCDay() !== targetDow) {
    cur = new Date(cur.getTime() + 86_400_000)
  }

  const endMs = new Date(end + 'T12:00:00Z').getTime()
  const stepMs = contract.frequencyWeeks * 7 * 86_400_000

  while (cur.getTime() <= endMs) {
    results.push(cur.toISOString().slice(0, 10))
    cur = new Date(cur.getTime() + stepMs)
  }
  return results
}

type WeekRow = {
  weekStart: string
  weekEnd: string
  occurrences: { contractId: string; customerName: string; date: string; price: number; sharePct: number }[]
  salariedCost: number
  salariedBreakdown: { name: string; amount: number }[]
}

export default function ProjectionsClient({
  contracts,
  salariedRules,
  today,
}: {
  contracts: RecurringContract[]
  salariedRules: SalariedRuleProjection[]
  today: string
}) {
  const SEASON_END = '2026-08-31'

  // Editable assumed price per contract
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const c of contracts) {
      init[c.id] = c.avgActualPrice != null ? String(c.avgActualPrice) : ''
    }
    return init
  })

  const weeks: WeekRow[] = useMemo(() => {
    // Collect all occurrence dates across all contracts
    const allOccurrences: { contractId: string; date: string }[] = []
    for (const c of contracts) {
      for (const d of getOccurrences(c, today, SEASON_END)) {
        allOccurrences.push({ contractId: c.id, date: d })
      }
    }

    if (allOccurrences.length === 0) return []

    // Build week buckets
    const weekMap: Record<string, WeekRow> = {}
    for (const occ of allOccurrences) {
      const ws = weekStart(occ.date)
      if (!weekMap[ws]) {
        weekMap[ws] = {
          weekStart: ws,
          weekEnd: addDays(ws, 6),
          occurrences: [],
          salariedCost: 0,
          salariedBreakdown: [],
        }
      }
      const contract = contracts.find((c) => c.id === occ.contractId)!
      const price = parseFloat(prices[occ.contractId] ?? '') || 0
      weekMap[ws].occurrences.push({
        contractId: occ.contractId,
        customerName: contract.customerName,
        date: occ.date,
        price,
        sharePct: contract.sharePct,
      })
    }

    // Compute salaried cost per week
    for (const ws of Object.keys(weekMap)) {
      const we = weekMap[ws].weekEnd
      let total = 0
      const breakdown: { name: string; amount: number }[] = []

      for (const rule of salariedRules) {
        // Check overlap
        if (rule.effectiveTo < ws || rule.effectiveFrom > we) continue

        if (rule.type === 'gm_salary' && rule.amountPerWeek != null) {
          total += rule.amountPerWeek
          breakdown.push({ name: `${rule.displayName} salary`, amount: rule.amountPerWeek })
        } else if (rule.type === 'quality_bonus' && rule.amountFlat != null) {
          // Biweekly — prorate to per-week
          const perWeek = rule.amountFlat / rule.frequencyWeeks
          total += perWeek
          breakdown.push({ name: `${rule.displayName} bonus (expected)`, amount: perWeek })
        }
      }

      weekMap[ws].salariedCost = total
      weekMap[ws].salariedBreakdown = breakdown
    }

    return Object.values(weekMap).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  }, [contracts, prices, today])

  // Season totals
  const totals = useMemo(() => {
    let revenue = 0, varLabor = 0, salariedCost = 0
    for (const w of weeks) {
      const wRev = w.occurrences.reduce((s, o) => s + o.price, 0)
      const wVar = w.occurrences.reduce((s, o) => s + o.price * (o.sharePct / 100), 0)
      revenue += wRev
      varLabor += wVar
      salariedCost += w.salariedCost
    }
    return { revenue, varLabor, salariedCost, totalLabor: varLabor + salariedCost, profit: revenue - varLabor - salariedCost }
  }, [weeks])

  const hasAnyPrices = contracts.some((c) => parseFloat(prices[c.id] ?? '') > 0)

  return (
    <div className="space-y-8">

      {/* ── Contract price assumptions ─────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold mb-1">Price assumptions per contract</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Defaults from most recent actuals. Edit to model different scenarios — changes update the projection live.
        </p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Freq</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Pool %</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Season end</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-36">Assumed price / visit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{c.customerName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize text-xs">
                    {c.serviceType.replace(/_/g, ' ').replace(/recurring services/i, 'recurring')}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">
                    every {c.frequencyWeeks === 1 ? 'week' : `${c.frequencyWeeks} wks`}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{c.sharePct}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                    {new Date(c.endDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-muted-foreground text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={prices[c.id] ?? ''}
                        onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="w-24 h-7 text-xs text-right border border-input rounded px-2 bg-background tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Season summary cards ───────────────────────────────────────────── */}
      {hasAnyPrices && (
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

                  return (
                    <tr key={week.weekStart} className={`align-top hover:bg-muted/20 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground font-medium tabular-nums">
                        {formatWeekLabel(week.weekStart)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {week.occurrences.map((o, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary/8 text-primary rounded px-1.5 py-0.5">
                              {o.customerName}
                              {o.price > 0 && <span className="text-primary/60">{fmt(o.price)}</span>}
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
                        {week.salariedCost > 0 ? (
                          <span title={week.salariedBreakdown.map((b) => `${b.name}: ${fmt(b.amount)}`).join('\n')}>
                            {fmt(week.salariedCost)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                        {laborPct != null ? (
                          <span className={pctColor(laborPct)}>{laborPct.toFixed(0)}%</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {revenue > 0 ? (
                          <span className={profit >= 0 ? 'text-green-700' : 'text-red-600'}>
                            {fmt(profit)}
                          </span>
                        ) : (
                          <span className="text-red-600 text-xs">{fmt(-week.salariedCost)}</span>
                        )}
                      </td>
                    </tr>
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
            Variable labor = contract price × pool % (60% for recurring). Salaried = GM salary ($75/wk) + expected quality bonus (prorated). Hover salaried cell for breakdown.
          </p>
        </section>
      )}

      {weeks.length === 0 && (
        <div className="rounded-lg border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          No upcoming recurring services found through {SEASON_END}.
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
