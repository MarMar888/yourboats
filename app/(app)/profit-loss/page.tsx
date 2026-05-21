import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { services, payroll, salariedPayroll, recurringSchedules, customers, salariedRules } from '@/lib/db/schema'
import { eq, gte, lte, and, sql, inArray } from 'drizzle-orm'
import { todayET } from '@/lib/date'
import ProjectionsClient, { type RecurringContract, type SalariedRuleProjection } from './projections-client'
import { getServiceTypeShareMap, lookupSharePct } from '@/lib/pay/service-type-shares'

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

// Extract YYYY-MM-DD from a date that might come back as a timestamp
function toYMD(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

type Period = { label: string; start: string; end: string }

function buildPeriods(): Period[] {
  const today = todayET()
  const [y, m] = today.split('-').map(Number)
  const periods: Period[] = []
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

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function ProfitLossPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') redirect('/dashboard')

  const { tab } = await searchParams
  const activeTab = tab === 'projections' ? 'projections' : 'actuals'

  const today = todayET()

  // ── Actuals data ──────────────────────────────────────────────────────────
  const periods = buildPeriods()
  const rangeStart = periods[periods.length - 1].start
  const rangeEnd = periods[0].end

  const [serviceRows, payrollRows, salariedRows] = await Promise.all([
    db.select({ id: services.id, serviceDate: services.serviceDate, serviceType: services.serviceType, totalPrice: services.totalPrice, tipAmount: services.tipAmount })
      .from(services)
      .where(and(eq(services.status, 'complete'), gte(services.serviceDate, rangeStart), lte(services.serviceDate, rangeEnd))),
    db.select({ serviceId: payroll.serviceId, serviceDate: payroll.serviceDate, totalPay: payroll.totalPay, tipShare: payroll.tipShare })
      .from(payroll)
      .where(and(gte(payroll.serviceDate, rangeStart), lte(payroll.serviceDate, rangeEnd))),
    db.select({ periodStart: salariedPayroll.periodStart, periodEnd: salariedPayroll.periodEnd, type: salariedPayroll.type, displayName: salariedPayroll.displayName, amount: salariedPayroll.amount })
      .from(salariedPayroll)
      .where(eq(salariedPayroll.status, 'approved')),
  ])

  const actuals = periods.map((period) => {
    const svcs = serviceRows.filter((s) => toYMD(s.serviceDate as unknown as Date) >= period.start && toYMD(s.serviceDate as unknown as Date) <= period.end)
    const revenue = svcs.reduce((s, x) => s + parseNum(x.totalPrice), 0)
    const tips = svcs.reduce((s, x) => s + parseNum(x.tipAmount), 0)
    const pr = payrollRows.filter((p) => toYMD(p.serviceDate as unknown as Date) >= period.start && toYMD(p.serviceDate as unknown as Date) <= period.end)
    const totalPay = pr.reduce((s, p) => s + parseNum(p.totalPay), 0)
    const tipShare = pr.reduce((s, p) => s + parseNum(p.tipShare), 0)
    const sal = salariedRows.filter((r) => toYMD(r.periodStart as unknown as Date) <= period.end && toYMD(r.periodEnd as unknown as Date) >= period.start)
    const salariedLabor = sal.reduce((s, r) => s + parseNum(r.amount), 0)
    return { label: period.label, start: period.start, revenue, tips, variableLaborBase: totalPay - tipShare, salariedLabor, jobCount: svcs.length }
  })

  const totals = actuals.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, variableLaborBase: acc.variableLaborBase + r.variableLaborBase, salariedLabor: acc.salariedLabor + r.salariedLabor, jobCount: acc.jobCount + r.jobCount, tips: acc.tips + r.tips }),
    { revenue: 0, variableLaborBase: 0, salariedLabor: 0, jobCount: 0, tips: 0 }
  )

  const typeMap: Record<string, { type: string; revenue: number; labor: number; count: number }> = {}
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
  const activeActuals = actuals.filter((r) => r.revenue > 0 || r.salariedLabor > 0)

  // ── Projections data ──────────────────────────────────────────────────────
  let projContracts: RecurringContract[] = []
  let projSalariedRules: SalariedRuleProjection[] = []

  if (activeTab === 'projections') {
    const [recRows, salRuleRows, shareMap] = await Promise.all([
      db.select({
        id: recurringSchedules.id,
        customerId: recurringSchedules.customerId,
        customerName: customers.name,
        serviceType: recurringSchedules.serviceType,
        frequencyWeeks: recurringSchedules.frequencyWeeks,
        dayOfWeek: recurringSchedules.dayOfWeek,
        startDate: recurringSchedules.startDate,
        endDate: recurringSchedules.endDate,
        defaultPrice: recurringSchedules.defaultPrice,
      })
        .from(recurringSchedules)
        .innerJoin(customers, eq(recurringSchedules.customerId, customers.id))
        .where(and(eq(recurringSchedules.active, true), gte(recurringSchedules.endDate, today))),
      db.select().from(salariedRules).where(and(eq(salariedRules.active, true), gte(salariedRules.effectiveTo, today))),
      getServiceTypeShareMap(),
    ])

    // Pull price from scheduled services (all services for a contract have the same price)
    const contractIds = recRows.map((r) => r.id)
    const scheduledPriceRows = contractIds.length > 0
      ? await db.select({
          recurringScheduleId: services.recurringScheduleId,
          totalPrice: services.totalPrice,
        })
        .from(services)
        .where(and(
          eq(services.status, 'scheduled'),
          inArray(services.recurringScheduleId, contractIds),
          sql`${services.totalPrice} is not null`,
        ))
        .limit(contractIds.length * 2)
      : []

    // One price per contract — take first match
    const priceByContract: Record<string, number> = {}
    for (const r of scheduledPriceRows) {
      if (r.recurringScheduleId && !(r.recurringScheduleId in priceByContract)) {
        priceByContract[r.recurringScheduleId] = parseFloat(r.totalPrice ?? '0') || 0
      }
    }

    projContracts = recRows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerName: r.customerName,
      serviceType: r.serviceType,
      frequencyWeeks: r.frequencyWeeks,
      dayOfWeek: r.dayOfWeek,
      startDate: toYMD(r.startDate as unknown as Date),
      endDate: toYMD(r.endDate as unknown as Date),
      sharePct: lookupSharePct(shareMap, r.serviceType),
      avgActualPrice: priceByContract[r.id] ?? null,
    }))

    projSalariedRules = salRuleRows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      type: r.type,
      amountPerWeek: r.amountPerWeek ? parseFloat(r.amountPerWeek) : null,
      amountFlat: r.amountFlat ? parseFloat(r.amountFlat) : null,
      effectiveFrom: toYMD(r.effectiveFrom as unknown as Date),
      effectiveTo: toYMD(r.effectiveTo as unknown as Date),
      frequencyWeeks: r.type === 'quality_bonus' ? 2 : 1,
    }))
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold">Profit & Loss</h1>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'actuals', label: 'Actuals' },
          { key: 'projections', label: 'Projections' },
        ].map(({ key, label }) => (
          <Link
            key={key}
            href={`/profit-loss?tab=${key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* ── Actuals tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'actuals' && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Revenue (6 mo)" value={fmt(totals.revenue)} sub={`${totals.jobCount} jobs`} />
            <StatCard label="Total Labor" value={fmt(totals.variableLaborBase + totals.salariedLabor)} sub={`${pct(totals.variableLaborBase + totals.salariedLabor, totals.revenue)} of revenue`} highlight="red" />
            <StatCard label="Gross Profit" value={fmt(totals.revenue - totals.variableLaborBase - totals.salariedLabor)} sub={pct(totals.revenue - totals.variableLaborBase - totals.salariedLabor, totals.revenue) + ' margin'} highlight="green" />
            <StatCard label="Tips (pass-through)" value={fmt(totals.tips)} sub="customer → employee" />
          </div>

          <section>
            <h2 className="text-base font-semibold mb-3">Monthly Breakdown</h2>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {['Month', 'Jobs', 'Revenue', 'Variable Labor', 'Salaried', 'Total Labor', 'Labor %', 'Gross Profit'].map((h, i) => (
                      <th key={h} className={`px-4 py-2.5 font-medium text-muted-foreground ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeActuals.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No completed services in the last 6 months.</td></tr>
                  ) : activeActuals.map((row) => {
                    const totalLabor = row.variableLaborBase + row.salariedLabor
                    const grossProfit = row.revenue - totalLabor
                    const laborPct = row.revenue > 0 ? totalLabor / row.revenue * 100 : null
                    return (
                      <tr key={row.start} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{row.label}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.jobCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.revenue > 0 ? fmt(row.revenue) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.variableLaborBase > 0 ? fmt(row.variableLaborBase) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.salariedLabor > 0 ? fmt(row.salariedLabor) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{totalLabor > 0 ? fmt(totalLabor) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {laborPct != null ? <span className={laborPct > 50 ? 'text-red-600' : laborPct > 35 ? 'text-amber-600' : 'text-green-700'}>{laborPct.toFixed(1)}%</span> : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {row.revenue > 0 ? <span className={grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}>{fmt(grossProfit)}</span> : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {activeActuals.length > 0 && (
                  <tfoot className="bg-muted/50 border-t font-semibold">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">{totals.jobCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.variableLaborBase)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.salariedLabor)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.variableLaborBase + totals.salariedLabor)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{pct(totals.variableLaborBase + totals.salariedLabor, totals.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700">{fmt(totals.revenue - totals.variableLaborBase - totals.salariedLabor)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Variable labor = employee net pay (tips excluded). Salaried = approved lines only.</p>
          </section>

          {typeBreakdown.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3">By Service Type</h2>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Type', 'Jobs', 'Revenue', 'Variable Labor', 'Labor %', 'Gross Profit'].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 font-medium text-muted-foreground ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
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
                            {laborPct != null ? <span className={laborPct > 50 ? 'text-red-600' : laborPct > 35 ? 'text-amber-600' : 'text-green-700'}>{laborPct.toFixed(1)}%</span> : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            <span className={grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}>{fmt(grossProfit)}</span>
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
      )}

      {/* ── Projections tab ──────────────────────────────────────────────────── */}
      {activeTab === 'projections' && (
        <ProjectionsClient
          contracts={projContracts}
          salariedRules={projSalariedRules}
          today={today}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${highlight === 'green' ? 'text-green-700' : highlight === 'red' ? 'text-red-600' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
