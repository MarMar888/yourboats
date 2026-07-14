import { db } from '@/lib/db'
import { users, payroll, timeEntries } from '@/lib/db/schema'
import { eq, and, gte, lte, isNotNull, sql, asc } from 'drizzle-orm'

export type EmployeeLaborStats = {
  id: string
  displayName: string
  role: string
  tier: string | null
  services: number
  approved: number
  totalPay: number
  avgPay: number
  totalHours: number
  avgHourlyWage: number | null
}

export type LaborStatsTotals = {
  totalServices: number
  totalPay: number
  totalHours: number
  avgHourlyWage: number | null
}

// Payroll is percentage-of-revenue based, not hourly — "hourly wage" here is derived
// as totalPay (from payroll) / totalHours (from clock in/out time entries).
export async function getEmployeeLaborStats(startDate: string, endDate: string): Promise<{
  rows: EmployeeLaborStats[]
  totals: LaborStatsTotals
}> {
  const employeeRows = await db
    .select({ id: users.id, displayName: users.displayName, role: users.role, tier: users.tier })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.displayName))

  const payrollStats = await db
    .select({
      userId:   payroll.userId,
      services: sql<number>`count(*)::int`,
      totalPay: sql<number>`coalesce(sum(${payroll.netPay}::numeric), 0)`,
      avgPay:   sql<number>`coalesce(avg(${payroll.netPay}::numeric), 0)`,
      approved: sql<number>`count(*) filter (where ${payroll.approvedAt} is not null)::int`,
    })
    .from(payroll)
    .where(and(gte(payroll.serviceDate, startDate), lte(payroll.serviceDate, endDate)))
    .groupBy(payroll.userId)

  const payrollByUser = new Map(payrollStats.map((r) => [r.userId, r]))

  const timeStats = await db
    .select({
      userId: timeEntries.userId,
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

  const rows: EmployeeLaborStats[] = employeeRows
    .map((emp) => {
      const pay = payrollByUser.get(emp.id) ?? null
      const time = timeByUser.get(emp.id) ?? null
      const totalPay = Number(pay?.totalPay ?? 0)
      const totalHours = Number(time?.totalHours ?? 0)
      return {
        id: emp.id,
        displayName: emp.displayName,
        role: emp.role,
        tier: emp.tier,
        services: pay?.services ?? 0,
        approved: pay?.approved ?? 0,
        totalPay,
        avgPay: Number(pay?.avgPay ?? 0),
        totalHours,
        avgHourlyWage: totalHours > 0 ? totalPay / totalHours : null,
      }
    })
    .sort((a, b) => b.services - a.services || a.displayName.localeCompare(b.displayName))

  const totalServices = rows.reduce((s, r) => s + r.services, 0)
  const totalPay = rows.reduce((s, r) => s + r.totalPay, 0)
  const totalHours = rows.reduce((s, r) => s + r.totalHours, 0)

  return {
    rows,
    totals: { totalServices, totalPay, totalHours, avgHourlyWage: totalHours > 0 ? totalPay / totalHours : null },
  }
}
