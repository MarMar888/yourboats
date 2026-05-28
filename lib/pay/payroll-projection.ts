import { db } from '@/lib/db'
import {
  customers,
  payroll,
  serviceBoatAssignments,
  services,
  tierConfig,
  users,
} from '@/lib/db/schema'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { getServiceTypeShareMap, lookupSharePct } from './service-type-shares'

function splitEvenly(userIds: string[]): Record<string, number> {
  if (userIds.length === 0) return {}

  const basePct = Math.floor(100 / userIds.length)
  const remainder = 100 - basePct * userIds.length

  return Object.fromEntries(
    userIds.map((userId, index) => [
      userId,
      index === userIds.length - 1 ? basePct + remainder : basePct,
    ])
  )
}

export async function refreshServicePayroll(
  serviceId: string,
  reason: string
): Promise<void> {
  const existingRows = await db
    .select({
      userId: payroll.userId,
      splitPct: payroll.splitPct,
      savedByUserId: payroll.savedByUserId,
      approvedAt: payroll.approvedAt,
    })
    .from(payroll)
    .where(eq(payroll.serviceId, serviceId))

  if (existingRows.length === 0) return

  const now = new Date()
  const approvedRows = existingRows.filter((row) => row.approvedAt)
  if (approvedRows.length > 0) {
    await db
      .update(payroll)
      .set({ staleAt: now, staleReason: reason })
      .where(and(eq(payroll.serviceId, serviceId), isNotNull(payroll.approvedAt)))
  }

  const unapprovedRows = existingRows.filter((row) => !row.approvedAt)
  if (unapprovedRows.length === 0) return

  await db
    .delete(payroll)
    .where(and(eq(payroll.serviceId, serviceId), isNull(payroll.approvedAt)))

  const [service] = await db
    .select({
      id: services.id,
      status: services.status,
      invoiceId: services.invoiceId,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      totalPrice: services.totalPrice,
      tipAmount: services.tipAmount,
      customerName: customers.name,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(eq(services.id, serviceId))
    .limit(1)

  if (!service || service.status !== 'complete') return

  const assignmentRows = await db
    .select({
      userId: serviceBoatAssignments.userId,
      displayName: users.displayName,
      tier: users.tier,
    })
    .from(serviceBoatAssignments)
    .innerJoin(users, sql`${users.id}::text = ${serviceBoatAssignments.userId}`)
    .where(eq(serviceBoatAssignments.serviceId, serviceId))

  const assignmentsByUser = new Map<string, {
    userId: string
    displayName: string
    tier: 'top' | 'mid' | 'low' | null
  }>()
  for (const row of assignmentRows) {
    if (!assignmentsByUser.has(row.userId)) {
      assignmentsByUser.set(row.userId, row)
    }
  }

  const approvedUserIds = new Set(approvedRows.map((row) => row.userId))
  const assignments = Array.from(assignmentsByUser.values())
    .filter((assignment) => !approvedUserIds.has(assignment.userId))
    .sort((a, b) => a.userId.localeCompare(b.userId))
  if (assignments.length === 0) return

  const [tierRows, shareMap] = await Promise.all([
    db.select().from(tierConfig),
    getServiceTypeShareMap(),
  ])
  const deductionByTier = Object.fromEntries(
    tierRows.map((row) => [row.tier, Number(row.deductionPct)])
  )

  const existingSplitByUser = new Map(
    unapprovedRows.map((row) => [row.userId, Number(row.splitPct)])
  )
  const assignmentUserIds = assignments.map((row) => row.userId)
  const canPreserveSplits =
    assignmentUserIds.every((userId) => existingSplitByUser.has(userId)) &&
    Math.abs(assignmentUserIds.reduce((sum, userId) => sum + (existingSplitByUser.get(userId) ?? 0), 0) - 100) < 0.01

  const defaultSplits = splitEvenly(assignmentUserIds)
  const totalPrice = Number(service.totalPrice ?? 0)
  const tipAmount = Number(service.tipAmount ?? 0)
  const serviceTypeShare = lookupSharePct(shareMap, service.serviceType)
  const employeePool = totalPrice * (serviceTypeShare / 100)
  const tipShare = assignments.length > 0 ? tipAmount / assignments.length : 0
  const savedByUserId = unapprovedRows[0]?.savedByUserId ?? null

  await db.insert(payroll).values(
    assignments.map((assignment) => {
      const splitPct = canPreserveSplits
        ? existingSplitByUser.get(assignment.userId)!
        : defaultSplits[assignment.userId]
      const deductionPct = assignment.tier ? (deductionByTier[assignment.tier] ?? 0) : 0
      const effectivePct = Math.max(0, splitPct - deductionPct)
      const netPay = employeePool * (effectivePct / 100)

      return {
        serviceId,
        invoiceId: service.invoiceId,
        userId: assignment.userId,
        displayName: assignment.displayName,
        serviceDate: service.serviceDate,
        serviceType: service.serviceType,
        customerName: service.customerName,
        totalPrice: String(totalPrice),
        employeePool: String(employeePool),
        splitPct: String(splitPct),
        deductionPct: String(deductionPct),
        effectivePct: String(effectivePct),
        netPay: String(netPay),
        tipShare: tipShare > 0 ? String(tipShare) : null,
        totalPay: String(netPay + tipShare),
        savedByUserId,
        savedAt: now,
        staleAt: null,
        staleReason: null,
      }
    })
  )
}

export async function markApprovedPayrollStale(
  serviceId: string,
  reason: string
): Promise<void> {
  await db
    .update(payroll)
    .set({ staleAt: new Date(), staleReason: reason })
    .where(and(eq(payroll.serviceId, serviceId), isNotNull(payroll.approvedAt)))
}
