'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { tierConfig, users, services, timeEntries, boats, serviceTypeShares, invoices, qboItems, customers, serviceBoats } from '@/lib/db/schema'
import { and, eq, gte, lte, inArray, isNotNull } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { refreshServicePayroll } from '@/lib/pay/payroll-projection'
import {
  getRateHistory,
  insertRateChange,
  resolveSharePctAsOf,
  resolveDeductionPctAsOf,
  DEFAULT_SERVICE_TYPE_SHARE,
} from '@/lib/pay/rates'
import { log } from '@/lib/log'

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function saveTip(serviceId: string, tipAmount: number): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) throw new Error('Unauthorized')

  await db
    .update(services)
    .set({ tipAmount: tipAmount > 0 ? String(tipAmount) : null })
    .where(eq(services.id, serviceId))

  await refreshServicePayroll(serviceId, 'service_tip_updated')
  revalidatePath('/pay')
}

export async function updatePayrollServiceType(
  serviceId: string,
  serviceType: string
): Promise<{ ok: true; serviceTypeShare: number } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { ok: false, error: 'Unauthorized' }
  }

  const [shareRow] = await db
    .select({ serviceType: serviceTypeShares.serviceType })
    .from(serviceTypeShares)
    .where(eq(serviceTypeShares.serviceType, serviceType))
    .limit(1)

  if (!shareRow) return { ok: false, error: 'Unknown service type' }

  // Report the share in effect on this service's own date.
  const [svc] = await db
    .select({ serviceDate: services.serviceDate })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)
  const serviceTypeShare = svc
    ? resolveSharePctAsOf(await getRateHistory(), serviceType, svc.serviceDate)
    : DEFAULT_SERVICE_TYPE_SHARE

  const [qboItem] = await db
    .select({ qboItemId: qboItems.qboItemId })
    .from(qboItems)
    .where(eq(qboItems.name, serviceType))
    .limit(1)

  await db
    .update(services)
    .set({
      serviceType,
      qboItemId: qboItem?.qboItemId ?? null,
    })
    .where(eq(services.id, serviceId))

  await db
    .update(invoices)
    .set({ qboNeedsSync: true })
    .where(eq(invoices.serviceId, serviceId))

  await refreshServicePayroll(serviceId, 'payroll_service_type_updated')
  await log({
    action: 'update_payroll_service_type',
    entityType: 'service',
    entityId: serviceId,
    metadata: { serviceType },
  })

  revalidatePath('/pay')
  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/schedule')

  return { ok: true, serviceTypeShare }
}

export async function updateTierConfig(
  tier: 'top' | 'mid' | 'low',
  deductionPct: number,
  effectiveFrom?: string,   // YYYY-MM-DD; defaults to today
): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') throw new Error('Unauthorized')

  // Record the dated change (drives all payroll math), then sync the current-value
  // table that the Pay page displays to whatever is in effect today.
  await insertRateChange({
    kind: 'tier_deduction',
    key: tier,
    pct: deductionPct,
    effectiveFrom: effectiveFrom ?? todayYMD(),
    createdByUserId: user.id,
  })

  const currentPct = resolveDeductionPctAsOf(await getRateHistory(), tier, todayYMD())
  await db
    .update(tierConfig)
    .set({ deductionPct: String(currentPct), updatedAt: new Date() })
    .where(eq(tierConfig.tier, tier))

  revalidatePath('/pay')
  revalidatePath('/team')
}

export async function setServiceTypeShare(
  serviceType: string,
  pct: number,
  effectiveFrom?: string,   // YYYY-MM-DD; defaults to today
): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') throw new Error('Unauthorized')

  await insertRateChange({
    kind: 'service_type_share',
    key: serviceType,
    pct,
    effectiveFrom: effectiveFrom ?? todayYMD(),
    createdByUserId: user.id,
  })

  // Sync the current-value table (UI display) to today's effective share.
  const currentPct = resolveSharePctAsOf(await getRateHistory(), serviceType, todayYMD())
  await db
    .insert(serviceTypeShares)
    .values({ serviceType, employeeSharePct: String(currentPct) })
    .onConflictDoUpdate({
      target: serviceTypeShares.serviceType,
      set: { employeeSharePct: String(currentPct) },
    })

  revalidatePath('/pay')
}

// ─── Labor analytics ──────────────────────────────────────────────────────────

export type LaborTimeEntry = {
  serviceId: string
  boatId: string
  userId: string
  hours: number
  boatNickname: string
  displayName: string
}

/**
 * Return all completed, clocked-out time entries with a boat for services
 * whose serviceDate falls within [startDate, endDate].
 * Entries without a clockOut or without a boatId are excluded.
 */
export async function getLaborEntriesForPeriod(
  startDate: string,
  endDate: string
): Promise<LaborTimeEntry[]> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) return []

  const svcRows = await db
    .select({ id: services.id })
    .from(services)
    .where(and(
      gte(services.serviceDate, startDate),
      lte(services.serviceDate, endDate),
      eq(services.status, 'complete'),
    ))

  if (svcRows.length === 0) return []
  const svcIds = svcRows.map((s) => s.id)

  const entries = await db
    .select({
      serviceId:   timeEntries.serviceId,
      boatId:      timeEntries.boatId,
      userId:      timeEntries.userId,
      clockIn:     timeEntries.clockIn,
      clockOut:    timeEntries.clockOut,
      boatNickname: boats.nickname,
      displayName: users.displayName,
    })
    .from(timeEntries)
    .leftJoin(boats, eq(timeEntries.boatId, boats.id))
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .where(and(
      inArray(timeEntries.serviceId, svcIds),
      isNotNull(timeEntries.clockOut),
      isNotNull(timeEntries.boatId),
    ))

  return entries.map((e) => ({
    serviceId:    e.serviceId,
    boatId:       e.boatId!,
    userId:       e.userId,
    hours:        (e.clockOut!.getTime() - e.clockIn.getTime()) / (1000 * 60 * 60),
    boatNickname: e.boatNickname ?? 'Unknown boat',
    displayName:  e.displayName,
  }))
}

// ─── Unclocked boats ──────────────────────────────────────────────────────────

export type UnclockedBoat = {
  serviceId: string
  serviceDate: string
  customerName: string
  boatId: string
  boatNickname: string
}

/**
 * Return boats that appear on a completed service (and were paid for) but have
 * no clocked-out time entry for that service during the period.
 */
export async function getUnclockedBoatsForPeriod(
  startDate: string,
  endDate: string
): Promise<UnclockedBoat[]> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) return []

  const svcRows = await db
    .select({
      id:          services.id,
      serviceDate: services.serviceDate,
      customerName: customers.name,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(and(
      gte(services.serviceDate, startDate),
      lte(services.serviceDate, endDate),
      eq(services.status, 'complete'),
    ))

  if (svcRows.length === 0) return []
  const svcIds = svcRows.map((s) => s.id)

  const [allServiceBoats, clockedEntries] = await Promise.all([
    db
      .select({
        serviceId:    serviceBoats.serviceId,
        boatId:       serviceBoats.boatId,
        boatNickname: boats.nickname,
      })
      .from(serviceBoats)
      .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
      .where(inArray(serviceBoats.serviceId, svcIds)),
    db
      .select({
        serviceId: timeEntries.serviceId,
        boatId:    timeEntries.boatId,
      })
      .from(timeEntries)
      .where(and(
        inArray(timeEntries.serviceId, svcIds),
        isNotNull(timeEntries.clockOut),
        isNotNull(timeEntries.boatId),
      )),
  ])

  const clockedSet = new Set<string>()
  for (const e of clockedEntries) {
    if (e.boatId) clockedSet.add(`${e.serviceId}:${e.boatId}`)
  }

  const svcMap = Object.fromEntries(svcRows.map((s) => [s.id, s]))
  const result: UnclockedBoat[] = []
  for (const b of allServiceBoats) {
    if (!clockedSet.has(`${b.serviceId}:${b.boatId}`)) {
      const svc = svcMap[b.serviceId]
      if (svc) {
        result.push({
          serviceId:    b.serviceId,
          serviceDate:  svc.serviceDate,
          customerName: svc.customerName,
          boatId:       b.boatId,
          boatNickname: b.boatNickname,
        })
      }
    }
  }

  result.sort((a, b) =>
    a.serviceDate.localeCompare(b.serviceDate) ||
    a.boatNickname.localeCompare(b.boatNickname)
  )
  return result
}

export async function updateEmployeeTier(
  userId: string,
  tier: 'top' | 'mid' | 'low' | null
): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') throw new Error('Unauthorized')

  await db
    .update(users)
    .set({ tier })
    .where(eq(users.id, userId))

  revalidatePath('/pay')
  revalidatePath('/team')
}
