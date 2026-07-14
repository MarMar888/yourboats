import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { cn } from '@/lib/utils'
import { todayET } from '@/lib/date'
import { getEmployeeLaborStats, type EmployeeLaborStats, type LaborStatsTotals } from '@/lib/pay/labor-stats'
import { SEASON_END } from '@/lib/pay/projections'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMonthParam(param: string | undefined): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split('-').map(Number)
    if (m >= 1 && m <= 12) return { year: y, month: m }
  }
  const today = todayET() // YYYY-MM-DD
  const [y, m] = today.split('-').map(Number)
  return { year: y, month: m }
}

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function dateLabel(ymd: string) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function prevMonth(year: number, month: number) {
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

function nextMonth(year: number, month: number) {
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtHours(h: number) { return `${h.toFixed(1)}h` }
function fmtWage(n: number | null) { return n != null ? `$${n.toFixed(2)}/hr` : '—' }

const TIER_LABELS: Record<string, string> = {
  solo:   'Solo',
  senior: 'Senior',
  lead:   'Lead',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ month?: string; view?: string }>
}

export default async function PerformancePage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (currentUser.role !== 'owner' && currentUser.role !== 'manager') redirect('/dashboard')

  const params = await searchParams
  const activeView = params.view === 'season' ? 'season' : 'monthly'

  const { year, month } = parseMonthParam(params.month)
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const monthStart = `${monthKey}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getDate() // day 0 of next month = last day of this
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`

  const seasonStart = `${todayET().slice(0, 4)}-01-01`
  const seasonEnd = SEASON_END

  const { rows, totals } = activeView === 'season'
    ? await getEmployeeLaborStats(seasonStart, seasonEnd)
    : await getEmployeeLaborStats(monthStart, monthEnd)

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Team Performance</h1>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b mb-6">
        {[
          { key: 'monthly', label: 'Monthly' },
          { key: 'season', label: 'Season' },
        ].map(({ key, label }) => (
          <Link
            key={key}
            href={key === 'monthly' ? `/performance?view=monthly&month=${monthKey}` : '/performance?view=season'}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeView === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {activeView === 'monthly' ? (
        <>
          {/* Month navigation */}
          <div className="flex items-center gap-3 mb-6">
            <Link
              href={`/performance?month=${prevMonth(year, month)}`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              ← Prev
            </Link>
            <span className="text-sm font-medium flex-1 text-center">{monthLabel(year, month)}</span>
            <Link
              href={`/performance?month=${nextMonth(year, month)}`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              Next →
            </Link>
          </div>

          <SummaryBar totals={totals} />
          <EmployeeTable rows={rows} />

          <p className="text-xs text-muted-foreground mt-3">
            Pay figures include both draft and approved entries. Hours are from the clock-in/out records for this month.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            {dateLabel(seasonStart)} – {dateLabel(seasonEnd)}
          </p>

          <SummaryBar totals={totals} />
          <EmployeeTable rows={rows} />

          <p className="text-xs text-muted-foreground mt-3">
            Pay figures include both draft and approved entries. Hourly wage is derived as total pay ÷ clocked hours over the full season — it is not a set rate.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

function SummaryBar({ totals }: { totals: LaborStatsTotals }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Total services', value: String(totals.totalServices) },
        { label: 'Total payroll', value: fmt(totals.totalPay) },
        { label: 'Total hours', value: fmtHours(totals.totalHours) },
        { label: 'Avg hourly wage', value: fmtWage(totals.avgHourlyWage) },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-xl border bg-card px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  )
}

function EmployeeTable({ rows }: { rows: EmployeeLaborStats[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-10 text-center">No employees found.</p>
  }

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Jobs</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Approved</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total pay</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avg / job</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Hours</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avg hourly wage</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium">{row.displayName}</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                  {row.role}
                  {row.tier && (
                    <span className="ml-1.5 text-[10px] font-semibold bg-muted rounded px-1.5 py-0.5 uppercase tracking-wide">
                      {TIER_LABELS[row.tier] ?? row.tier}
                    </span>
                  )}
                </p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={cn('font-semibold', row.services === 0 && 'text-muted-foreground')}>
                  {row.services}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.services > 0 ? (
                  <span className={cn(
                    'text-xs font-semibold rounded px-1.5 py-0.5',
                    row.approved === row.services
                      ? 'text-green-700 bg-green-50 border border-green-200'
                      : row.approved > 0
                        ? 'text-amber-700 bg-amber-50 border border-amber-200'
                        : 'text-muted-foreground bg-muted border border-border'
                  )}>
                    {row.approved}/{row.services}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">
                {row.totalPay > 0 ? fmt(row.totalPay) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {row.services > 0 ? fmt(row.avgPay) : '—'}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {row.totalHours > 0 ? fmtHours(row.totalHours) : '—'}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium">
                {fmtWage(row.avgHourlyWage)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
