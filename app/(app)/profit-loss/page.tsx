import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { services, payroll, salariedPayroll } from '@/lib/db/schema'
import { eq, gte, lte, and, ne, sql } from 'drizzle-orm'
import { todayET } from '@/lib/date'

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function pct(num: number, den: number) {
  if (den === 0) return '—'
  return (num / den * 100).toFixed(1) + '%'
}

function parseNum(v: string | null | undefined): number {
  return parseFloat(v ?? '0') || 0
}

type Period = { label: string; start: string; end: string }

function buildPeriods(): Period[] {
  const today = todayET()
  const [y, m] = today.split('-').map(Number)

  const periods: Period[] = []

  // Last 6 months (current month + 5 prior)
  for (let i = 0; i < 6; i++) {
    let month = m - i
    let year = y
    if (month <= 0) { month += 12; year -= 1 }
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const label = new Date(start + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    periods.push({ label, start, end })
  }

  return periods
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProfitLossPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') redirect('/dashboard')

  const periods = buildPeriods()

  // Full date range: earliest start to latest end
  const rangeStart = periods[periods.length - 1].start
  const rangeEnd = periods[0].end

  // ── Query completed services ─────────────────────────────────────────────
  const serviceRows = await db
    .select({
      id: services.id,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      totalPrice: services.totalPrice,
      tipAmount: services.tipAmount,
    })
    .from(services)
    .where(
      and(
        eq(services.status, 'complete'),
        gte(services.serviceDate, rangeStart),
        lte(services.serviceDate, rangeEnd),
      )
    )

  // ── Query variable payroll ───────────────────────────────────────────────
  const payrollRows = await db
    .select({
      serviceId: payroll.serviceId,
      serviceDate: payroll.serviceDate,
      totalPay: payroll.totalPay,
      tipShare: payroll.tipShare,
    })
    .from(payroll)
    .where(
      and(
        gte(payroll.serviceDate, rangeStart),
        lte(payroll.serviceDate, rangeEnd),
      )
    )

  // ── Query approved salaried payroll ──────────────────────────────────────
  const salariedRows = await db
    .select({
      periodStart: salariedPayroll.periodStart,
      periodEnd: salariedPayroll.periodEnd,
      type: salariedPayroll.type,
      displayName: salariedPayroll.displayName,
      amount: salariedPayroll.amount,
    })
    .from(salariedPayroll)
    .where(eq(salariedPayroll.status, 'approved'))

  // ── Build per-period rollup ───────────────────────────────────────────────
  type MonthRow = {
    label: string
    start: string
    end: string
    revenue: number
    tips: number
    variableLaborBase: number  // netPay (no tips)
    variableLaborTips: number  // tip share to employees
    salariedLabor: number
    jobCount: number
  }

  const rows: MonthRow[] = periods.map((period) => {
    // Services in this month
    const svcs = serviceRows.filter(
      (s) => s.serviceDate >= period.start && s.serviceDate <= period.end
    )
    const revenue = svcs.reduce((sum, s) => sum + parseNum(s.totalPrice), 0)
    const tips = svcs.reduce((sum, s) => sum + parseNum(s.tipAmount), 0)

    // Payroll in this month
    const pr = payrollRows.filter(
      (p) => p.serviceDate >= period.start && p.serviceDate <= period.end
    )
    const totalPay = pr.reduce((sum, p) => sum + parseNum(p.totalPay), 0)
    const tipShare = pr.reduce((sum, p) => sum + parseNum(p.tipShare), 0)
    const variableLaborBase = totalPay - tipShare
    const variableLaborTips = tipShare

    // Salaried: a salaried row applies to a period if its range overlaps this month
    const sal = salariedRows.filter(
      (r) => r.periodStart <= period.end && r.periodEnd >= period.start
    )
    const salariedLabor = sal.reduce((sum, r) => sum + parseNum(r.amount), 0)

    return {
      label: period.label,
      start: period.start,
      end: period.end,
      revenue,
      tips,
      variableLaborBase,
      variableLaborTips,
      salariedLabor,
      jobCount: svcs.length,
    }
  })

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      tips: acc.tips + r.tips,
      variableLaborBase: acc.variableLaborBase + r.variableLaborBase,
      variableLaborTips: acc.variableLaborTips + r.variableLaborTips,
      salariedLabor: acc.salariedLabor + r.salariedLabor,
      jobCount: acc.jobCount + r.jobCount,
    }),
    { revenue: 0, tips: 0, variableLaborBase: 0, variableLaborTips: 0, salariedLabor: 0, jobCount: 0 }
  )

  // ── Service type breakdown (all-time in range) ────────────────────────────
  type TypeBreakdown = { type: string; revenue: number; labor: number; count: number }
  const typeMap: Record<string, TypeBreakdown> = {}

  for (const s of serviceRows) {
    const t = s.serviceType ?? 'other'
    if (!typeMap[t]) typeMap[t] = { type: t, revenue: 0, labor: 0, count: 0 }
    typeMap[t].revenue += parseNum(s.totalPrice)
    typeMap[t].count += 1
  }
  for (const p of payrollRows) {
    const svc = serviceRows.find((s) => s.id === p.serviceId)
    const t = svc?.serviceType ?? 'other'
    if (!typeMap[t]) typeMap[t] = { type: t, revenue: 0, labor: 0, count: 0 }
    typeMap[t].labor += parseNum(p.totalPay) - parseNum(p.tipShare)
  }

  const typeBreakdown = Object.values(typeMap).sort((a, b) => b.revenue - a.revenue)

  // Filter to months with any activity
  const activeRows = rows.filter((r) => r.revenue > 0 || r.salariedLabor > 0)

  return (
    <div className="space-y-8 max-w-5xl">
      <h1 className="text-2xl font-semibold">Profit & Loss — Labor View</h1>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Revenue (6 mo)"
          value={fmt(totals.revenue)}
          sub={`${totals.jobCount} jobs`}
        />
        <StatCard
          label="Total Labor"
          value={fmt(totals.variableLaborBase + totals.salariedLabor)}
          sub={`${pct(totals.variableLaborBase + totals.salariedLabor, totals.revenue)} of revenue`}
          highlight="red"
        />
        <StatCard
          label="Gross Profit"
          value={fmt(totals.revenue - totals.variableLaborBase - totals.salariedLabor)}
          sub={pct(totals.revenue - totals.variableLaborBase - totals.salariedLabor, totals.revenue) + ' margin'}
          highlight="green"
        />
        <StatCard
          label="Tips (pass-through)"
          value={fmt(totals.tips)}
          sub="customer → employee"
        />
      </div>

      {/* ── Monthly breakdown ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold mb-3">Monthly Breakdown</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Month</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Jobs</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Variable Labor</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Salaried</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Labor</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Labor %</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {activeRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground text-sm">
                    No completed services in the last 6 months.
                  </td>
                </tr>
              ) : (
                activeRows.map((row) => {
                  const totalLabor = row.variableLaborBase + row.salariedLabor
                  const grossProfit = row.revenue - totalLabor
                  const laborPct = row.revenue > 0 ? totalLabor / row.revenue * 100 : null
                  return (
                    <tr key={row.start} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{row.label}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.jobCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.revenue > 0 ? fmt(row.revenue) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {row.variableLaborBase > 0 ? fmt(row.variableLaborBase) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {row.salariedLabor > 0 ? fmt(row.salariedLabor) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {totalLabor > 0 ? fmt(totalLabor) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {laborPct !== null ? (
                          <span className={laborPct > 50 ? 'text-red-600' : laborPct > 35 ? 'text-amber-600' : 'text-green-700'}>
                            {laborPct.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {row.revenue > 0 ? (
                          <span className={grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}>
                            {fmt(grossProfit)}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {activeRows.length > 0 && (
              <tfoot className="bg-muted/50 border-t font-semibold">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.jobCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.variableLaborBase)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.salariedLabor)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.variableLaborBase + totals.salariedLabor)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {pct(totals.variableLaborBase + totals.salariedLabor, totals.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-700">
                    {fmt(totals.revenue - totals.variableLaborBase - totals.salariedLabor)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Variable labor = employee net pay (tips excluded — they pass through from customer to employee). Salaried = approved GM salary & bonus lines only.
        </p>
      </section>

      {/* ── By service type ───────────────────────────────────────────────── */}
      {typeBreakdown.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">By Service Type</h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Jobs</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Variable Labor</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Labor %</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {typeBreakdown.map((row) => {
                  const grossProfit = row.revenue - row.labor
                  const laborPct = row.revenue > 0 ? row.labor / row.revenue * 100 : null
                  return (
                    <tr key={row.type} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium capitalize">{row.type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(row.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(row.labor)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {laborPct !== null ? (
                          <span className={laborPct > 50 ? 'text-red-600' : laborPct > 35 ? 'text-amber-600' : 'text-green-700'}>
                            {laborPct.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <span className={grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}>
                          {fmt(grossProfit)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: 'green' | 'red'
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p
        className={`text-2xl font-semibold tabular-nums ${
          highlight === 'green'
            ? 'text-green-700'
            : highlight === 'red'
            ? 'text-red-600'
            : ''
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
