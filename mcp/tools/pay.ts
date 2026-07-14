// Pay tools: pay-period summary, effective-dated rate lookup/edit, retroactive
// recompute, and a boats-per-employee report. Payroll *approval* is intentionally
// left to the UI — recompute only ever touches UNAPPROVED rows, never approved ones.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  services, payroll, rateChanges, serviceTypeShares, tierConfig,
  serviceBoatAssignments, users,
} from '../../lib/db/schema'
import { getCurrentPeriod } from '../../lib/pay/periods'
import { todayET } from '../../lib/date'
import {
  resolveRateAsOf, DEFAULT_SERVICE_TYPE_SHARE, DEFAULT_TIER_DEDUCTION,
  type RateChangeRow,
} from '../../lib/pay/rates'
import { refreshServicePayroll } from '../../lib/pay/payroll-projection'
import { tool, YMD } from './_util'

const TIERS = ['top', 'mid', 'low'] as const

async function loadRateHistory(): Promise<RateChangeRow[]> {
  const rows = await db.select().from(rateChanges)
  return rows.map((r) => ({
    kind: r.kind as RateChangeRow['kind'],
    key: r.key,
    pct: Number(r.pct),
    effectiveFrom: r.effectiveFrom,
  }))
}

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

  tool(
    server,
    'get_rates_as_of',
    'Show the pay rates in effect on a given date: the crew-pool share % per service type, and the deduction % per employee tier. Defaults to today. Use to verify historical rates before recomputing payroll.',
    {
      date: z.string().regex(YMD).optional().describe('As-of date (YYYY-MM-DD). Defaults to today.'),
    },
    async ({ date }) => {
      const asOf = date ?? todayET()
      const history = await loadRateHistory()
      const shareKeys = Array.from(new Set(history.filter((r) => r.kind === 'service_type_share').map((r) => r.key))).sort()
      const tierKeys = Array.from(new Set(history.filter((r) => r.kind === 'tier_deduction').map((r) => r.key))).sort()
      const serviceTypeShares: Record<string, number> = {}
      for (const k of shareKeys) serviceTypeShares[k] = resolveRateAsOf(history, 'service_type_share', k, asOf, DEFAULT_SERVICE_TYPE_SHARE)
      const tierDeductions: Record<string, number> = {}
      for (const k of tierKeys) tierDeductions[k] = resolveRateAsOf(history, 'tier_deduction', k, asOf, DEFAULT_TIER_DEDUCTION)
      return { ok: true, asOf, serviceTypeShares, tierDeductions }
    }
  )

  tool(
    server,
    'set_rate',
    'Set an effective-dated pay rate. kind "service_type_share" (key = service type name, e.g. "Recurring Services" or legacy "recurring") or "tier_deduction" (key = tier "top"|"mid"|"low"). pct is a percent (0-100). effectiveFrom (YYYY-MM-DD) is the date the rate starts applying — services before it keep the prior rate. Re-setting the same key+date overwrites it. NOTE: for service_type_share, set BOTH the QBO name and the legacy key if both are in use.',
    {
      kind: z.enum(['service_type_share', 'tier_deduction']),
      key: z.string().min(1).describe('Service type name, or tier (top|mid|low)'),
      pct: z.number().min(0).max(100),
      effectiveFrom: z.string().regex(YMD).describe('Date the rate takes effect (YYYY-MM-DD)'),
      note: z.string().optional(),
    },
    async ({ kind, key, pct, effectiveFrom, note }) => {
      if (kind === 'tier_deduction' && !TIERS.includes(key as (typeof TIERS)[number])) {
        return { ok: false, error: `tier_deduction key must be one of ${TIERS.join(', ')}` }
      }

      await db
        .insert(rateChanges)
        .values({ kind, key, pct: String(pct), effectiveFrom, note: note ?? null })
        .onConflictDoUpdate({
          target: [rateChanges.kind, rateChanges.key, rateChanges.effectiveFrom],
          set: { pct: String(pct), note: note ?? null },
        })

      // Sync the current-value table (UI display) to whatever is in effect today.
      const history = await loadRateHistory()
      if (kind === 'service_type_share') {
        const cur = resolveRateAsOf(history, 'service_type_share', key, todayET(), DEFAULT_SERVICE_TYPE_SHARE)
        await db
          .insert(serviceTypeShares)
          .values({ serviceType: key, employeeSharePct: String(cur) })
          .onConflictDoUpdate({ target: serviceTypeShares.serviceType, set: { employeeSharePct: String(cur) } })
      } else {
        const cur = resolveRateAsOf(history, 'tier_deduction', key, todayET(), DEFAULT_TIER_DEDUCTION)
        await db
          .update(tierConfig)
          .set({ deductionPct: String(cur), updatedAt: new Date() })
          .where(eq(tierConfig.tier, key as (typeof TIERS)[number]))
      }

      return { ok: true, kind, key, pct, effectiveFrom }
    }
  )

  tool(
    server,
    'recompute_pay_period',
    'Recompute UNAPPROVED payroll rows for completed services in a date range using the current effective-dated rates. Approved (locked) rows are NOT changed — unapprove them in the app first, then run this. Returns per-employee pay before and after so you can verify the retroactive change.',
    {
      startDate: z.string().regex(YMD),
      endDate: z.string().regex(YMD),
    },
    async ({ startDate, endDate }) => {
      const byEmployee = () =>
        db
          .select({
            userId: payroll.userId,
            displayName: payroll.displayName,
            rows: sql<number>`count(*)`,
            totalPay: sql<string>`coalesce(sum(${payroll.totalPay}), 0)`,
          })
          .from(payroll)
          .where(and(gte(payroll.serviceDate, startDate), lte(payroll.serviceDate, endDate)))
          .groupBy(payroll.userId, payroll.displayName)

      const before = await byEmployee()

      const svc = await db
        .select({ id: services.id })
        .from(services)
        .where(and(gte(services.serviceDate, startDate), lte(services.serviceDate, endDate), eq(services.status, 'complete')))

      const approved = await db
        .select({ n: sql<number>`count(*)` })
        .from(payroll)
        .where(and(gte(payroll.serviceDate, startDate), lte(payroll.serviceDate, endDate), sql`${payroll.approvedAt} is not null`))

      for (const s of svc) {
        await refreshServicePayroll(s.id, 'retroactive_rate_change')
      }

      const after = await byEmployee()
      return {
        ok: true,
        range: { startDate, endDate },
        completedServicesInRange: svc.length,
        approvedRowsSkipped: Number(approved[0]?.n ?? 0),
        note: 'Only UNAPPROVED rows were recomputed. Approved rows are frozen — unapprove them in the app to include them, then re-run.',
        before,
        after,
      }
    }
  )

  tool(
    server,
    'employee_boat_counts',
    'Boats cleaned per employee — counts each boat on a completed service (not per job). Pass employeeName to filter (partial, case-insensitive). Pass milestone (e.g. 40) with an employeeName to get the date that employee reached that many cumulative boats.',
    {
      employeeName: z.string().optional(),
      milestone: z.number().int().positive().optional().describe('Return the date this many cumulative boats was reached.'),
    },
    async ({ employeeName, milestone }) => {
      const rows = await db
        .select({
          userId: serviceBoatAssignments.userId,
          displayName: users.displayName,
          serviceDate: services.serviceDate,
        })
        .from(serviceBoatAssignments)
        .innerJoin(services, and(eq(services.id, serviceBoatAssignments.serviceId), eq(services.status, 'complete')))
        .innerJoin(users, sql`${users.id}::text = ${serviceBoatAssignments.userId}`)
        .orderBy(services.serviceDate)

      const byUser = new Map<string, { displayName: string; dates: string[] }>()
      for (const r of rows) {
        const a = byUser.get(r.userId) ?? { displayName: r.displayName, dates: [] }
        a.dates.push(r.serviceDate)
        byUser.set(r.userId, a)
      }

      let employees = Array.from(byUser.values())
      if (employeeName) {
        const q = employeeName.toLowerCase()
        employees = employees.filter((e) => e.displayName.toLowerCase().includes(q))
      }

      const result = employees
        .map((e) => {
          const out: { displayName: string; boats: number; milestoneDate?: string | null } = {
            displayName: e.displayName,
            boats: e.dates.length,
          }
          if (milestone) out.milestoneDate = e.dates.length >= milestone ? e.dates[milestone - 1] : null
          return out
        })
        .sort((a, b) => b.boats - a.boats)

      return { ok: true, milestone: milestone ?? null, employees: result }
    }
  )
}
