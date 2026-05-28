'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { tierConfig, users, services, timeEntries, boats, serviceTypeShares, invoices, qboItems } from '@/lib/db/schema'
import { and, eq, gte, lte, inArray, isNotNull } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { refreshServicePayroll } from '@/lib/pay/payroll-projection'
import { log } from '@/lib/log'

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
    .select({ employeeSharePct: serviceTypeShares.employeeSharePct })
    .from(serviceTypeShares)
    .where(eq(serviceTypeShares.serviceType, serviceType))
    .limit(1)

  if (!shareRow) return { ok: false, error: 'Unknown service type' }

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

  return { ok: true, serviceTypeShare: Number(shareRow.employeeSharePct) }
}

export async function updateTierConfig(
  tier: 'top' | 'mid' | 'low',
  deductionPct: number
): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') throw new Error('Unauthorized')

  await db
    .update(tierConfig)
    .set({ deductionPct: String(deductionPct), updatedAt: new Date() })
    .where(eq(tierConfig.tier, tier))

  revalidatePath('/pay')
  revalidatePath('/team')
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
