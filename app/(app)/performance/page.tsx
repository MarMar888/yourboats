import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { users, payroll, timeEntries } from '@/lib/db/schema'
import { eq, and, gte, lte, isNotNull, sql, asc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { cn } from '@/lib/utils'
import { todayET } from '@/lib/date'

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

function prevMonth(year: number, month: number) {
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

function nextMonth(year: number, month: number) {
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtHours(h: number) { return `${h.toFixed(1)}h` }

const TIER_LABELS: Record<string, string> = {
  solo:   'Solo',
  senior: 'Senior',
  lead:   'Lead',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function PerformancePage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (currentUser.role !== 'owner' && currentUser.role !== 'manager') redirect('/dashboard')

  const params = await searchParams
  const { year, month } = parseMonthParam(params.month)
  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  // First and last day of the month as YYYY-MM-DD
  const startDate = `${monthKey}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getDate() // day 0 of next month = last day of this
  const endDate = `${monthKey}-${String(lastDay).padStart(2, '0')}`

  // ── All active employees ──────────────────────────────────────────────────
  const employeeRows = await db
    .select({ id: users.id, displayName: users.displayName, role: users.role, tier: users.tier })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.displayName))

  // ── Payroll stats by userId for the month ─────────────────────────────────
  // payroll.userId is text (auth user ID), payroll.serviceDate is date stored as string
  const payrollStats = await db
    .select({
      userId:    payroll.userId,
      services:  sql<number>`count(*)::int`,
      totalPay:  sql<number>`coalesce(sum(${payroll.netPay}::numeric), 0)`,
      avgPay:    sql<number>`coalesce(avg(${payroll.netPay}::numeric), 0)`,
      approved:  sql<number>`count(*) filter (where ${payroll.approvedAt} is not null)::int`,
    })
    .from(payroll)
    .where(
      and(
        gte(payroll.serviceDate, startDate),
        lte(payroll.serviceDate, endDate),
      )
    )
    .groupBy(payroll.userId)

  const payrollByUser = new Map(payrollStats.map((r) => [r.userId, r]))

  // ── Time entry hours by userId for the month ──────────────────────────────
  // time_entries.userId is UUID; clock_in/clock_out are timestamps.
  // We filter by clock_in falling in the month range (convert date to timestamp start-of-day).
  const timeStats = await db
    .select({
      userId:     timeEntries.userId,
      totalHours: sql<number>`coalesce(
        sum(
          extract(epoch from (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0
        ),
        0
      )`,
    })
    .from(timeEntries)
    .where(
      and(
        isNotNull(timeEntries.clockOut),
        gte(timeEntries.clockIn, sql`${startDate}::date`),
        lte(timeEntries.clockIn, sql`(${endDate}::date + interval '1 day')`),
      )
    )
    .groupBy(timeEntries.userId)

  const timeByUser = new Map(timeStats.map((r) => [r.userId, r]))

  // ── Merge into rows ───────────────────────────────────────────────────────
  type EmployeeStats = {
    id: string
    displayName: string
    role: string
    tier: string | null
    services: number
    approved: number
    totalPay: number
    avgPay: number
    totalHours: number
  }

  const rows: EmployeeStats[] = employeeRows
    .map((emp) => {
      // payroll userId is text; may equal emp.id (UUID string) for most entries
      const pay = payrollByUser.get(emp.id) ?? null
      const time = timeByUser.get(emp.id) ?? null
      return {
        id: emp.id,
        displayName: emp.displayName,
        role: emp.role,
        tier: emp.tier,
        services: pay?.services ?? 0,
        approved: pay?.approved ?? 0,
        totalPay: Number(pay?.totalPay ?? 0),
        avgPay: Number(pay?.avgPay ?? 0),
        totalHours: Number(time?.totalHours ?? 0),
      }
    })
    // Sort: most services first, then alphabetically
    .sort((a, b) => b.services - a.services || a.displayName.localeCompare(b.displayName))

  const totalServices = rows.reduce((s, r) => s + r.services, 0)
  const totalPay = rows.reduce((s, r) => s + r.totalPay, 0)
  const totalHours = rows.reduce((s, r) => s + r.totalHours, 0)

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Team Performance</h1>

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

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total services', value: String(totalServices) },
          { label: 'Total payroll', value: fmt(totalPay) },
          { label: 'Total hours', value: fmtHours(totalHours) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border bg-card px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold tabular-nums mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Employee table */}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No employees found.</p>
      ) : (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        Pay figures include both draft and approved entries. Hours are from the clock-in/out records for this month.
      </p>
    </div>
  )
}
