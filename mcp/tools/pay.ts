// Pay tools: read-only pay-period summary. Payroll approval is intentionally
// left to the UI — the two-phase calculate/approve flow is high-risk to automate.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import { services, payroll } from '../../lib/db/schema'
import { getCurrentPeriod } from '../../lib/pay/periods'
import { tool, YMD } from './_util'

export function registerPayTools(server: McpServer): void {
  tool(
    server,
    'get_pay_period_summary',
    'Read-only summary of a pay period: completed services, total revenue, and saved/approved payroll rows. Defaults to the current pay period if no dates are given.',
    {
      startDate: z.string().regex(YMD).optional().describe('Period start (YYYY-MM-DD). Defaults to current period start.'),
      endDate: z.string().regex(YMD).optional().describe('Period end (YYYY-MM-DD). Defaults to current period end.'),
    },
    async ({ startDate, endDate }) => {
      const period = getCurrentPeriod()
      const start = startDate ?? period.startStr
      const end = endDate ?? period.endStr

      const completed = await db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<string>`coalesce(sum(${services.totalPrice}), 0)`,
          tips: sql<string>`coalesce(sum(${services.tipAmount}), 0)`,
        })
        .from(services)
        .where(and(gte(services.serviceDate, start), lte(services.serviceDate, end), eq(services.status, 'complete')))

      const scheduled = await db
        .select({ count: sql<number>`count(*)` })
        .from(services)
        .where(and(gte(services.serviceDate, start), lte(services.serviceDate, end), eq(services.status, 'scheduled')))

      const payrollRows = await db
        .select({
          total: sql<number>`count(*)`,
          approved: sql<number>`count(*) filter (where ${payroll.approvedAt} is not null)`,
          pending: sql<number>`count(*) filter (where ${payroll.approvedAt} is null)`,
          stale: sql<number>`count(*) filter (where ${payroll.staleAt} is not null)`,
          totalPay: sql<string>`coalesce(sum(${payroll.totalPay}), 0)`,
        })
        .from(payroll)
        .where(and(gte(payroll.serviceDate, start), lte(payroll.serviceDate, end)))

      // Per-employee pay breakdown for the period.
      const byEmployee = await db
        .select({
          userId: payroll.userId,
          displayName: payroll.displayName,
          rows: sql<number>`count(*)`,
          totalPay: sql<string>`coalesce(sum(${payroll.totalPay}), 0)`,
        })
        .from(payroll)
        .where(and(gte(payroll.serviceDate, start), lte(payroll.serviceDate, end)))
        .groupBy(payroll.userId, payroll.displayName)

      return {
        ok: true,
        period: { startDate: start, endDate: end, isCurrentPeriod: !startDate && !endDate, label: `${start} → ${end}` },
        completedServices: Number(completed[0]?.count ?? 0),
        scheduledServices: Number(scheduled[0]?.count ?? 0),
        revenue: completed[0]?.revenue ?? '0',
        tips: completed[0]?.tips ?? '0',
        payroll: {
          totalRows: Number(payrollRows[0]?.total ?? 0),
          approvedRows: Number(payrollRows[0]?.approved ?? 0),
          pendingRows: Number(payrollRows[0]?.pending ?? 0),
          staleRows: Number(payrollRows[0]?.stale ?? 0),
          totalPay: payrollRows[0]?.totalPay ?? '0',
        },
        byEmployee,
      }
    }
  )
}
