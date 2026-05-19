'use server'

import { db } from '@/lib/db'
import { recurringSchedules, services, serviceBoats, boats } from '@/lib/db/schema'
import { eq, and, gte, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { todayET } from '@/lib/date'

// Returns every occurrence of dayOfWeek between start and end at the given
// frequency in weeks, as YYYY-MM-DD strings.
function occurrenceDates(
  startDate: string,
  endDate: string,
  dayOfWeek: number,
  frequencyWeeks: number
): string[] {
  const dates: string[] = []
  const end = new Date(endDate + 'T00:00:00')
  const cur = new Date(startDate + 'T00:00:00')
  const diff = (dayOfWeek - cur.getDay() + 7) % 7
  cur.setDate(cur.getDate() + diff)
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + frequencyWeeks * 7)
  }
  return dates
}

export type RegenBoatRow = {
  boatId: string
  rateType: 'per_ft' | 'flat'
  rate: string | null
}

export type UpdateScheduleInput = {
  scheduleId: string
  serviceType: string
  frequencyWeeks: number
  dayOfWeek: number
  startDate: string
  endDate: string
  active: boolean
}

export async function updateRecurringSchedule(
  input: UpdateScheduleInput
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { error: 'Not authorized' }
  }

  const [schedule] = await db
    .select({ id: recurringSchedules.id, customerId: recurringSchedules.customerId })
    .from(recurringSchedules)
    .where(eq(recurringSchedules.id, input.scheduleId))
    .limit(1)

  if (!schedule) return { error: 'Schedule not found' }

  await db
    .update(recurringSchedules)
    .set({
      serviceType: input.serviceType,
      frequencyWeeks: input.frequencyWeeks,
      dayOfWeek: input.dayOfWeek,
      startDate: input.startDate,
      endDate: input.endDate,
      active: input.active,
    })
    .where(eq(recurringSchedules.id, input.scheduleId))

  await log({
    action: 'update_recurring_schedule',
    entityType: 'recurring_schedule',
    entityId: input.scheduleId,
    metadata: { frequencyWeeks: input.frequencyWeeks, dayOfWeek: input.dayOfWeek },
  })

  revalidatePath(`/customers/${schedule.customerId}`)
  return {}
}

// Deletes all future (status=scheduled) services tied to this schedule,
// then re-creates them based on the updated schedule definition.
export async function regenerateRecurringServices(
  scheduleId: string,
  boatRows: RegenBoatRow[] = []
): Promise<{ error?: string; created?: number }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { error: 'Not authorized' }
  }

  const [schedule] = await db
    .select()
    .from(recurringSchedules)
    .where(eq(recurringSchedules.id, scheduleId))
    .limit(1)

  if (!schedule) return { error: 'Schedule not found' }

  const today = todayET()

  // Delete future scheduled services for this recurring schedule
  await db
    .delete(services)
    .where(
      and(
        eq(services.recurringScheduleId, scheduleId),
        eq(services.status, 'scheduled'),
        gte(services.serviceDate, today)
      )
    )

  // Re-create from today forward (don't re-create past dates)
  const effectiveStart = schedule.startDate > today ? schedule.startDate : today
  const dates = occurrenceDates(
    effectiveStart,
    schedule.endDate,
    schedule.dayOfWeek,
    schedule.frequencyWeeks
  )

  if (dates.length > 0) {
    // Pre-fetch boat lengths for per_ft calculations
    let boatLengths: Record<string, number | null> = {}
    if (boatRows.length > 0) {
      const boatIds = boatRows.map((b) => b.boatId)
      const boatRecords = await db
        .select({ id: boats.id, lengthFt: boats.lengthFt })
        .from(boats)
        .where(inArray(boats.id, boatIds))
      boatLengths = Object.fromEntries(boatRecords.map((b) => [b.id, b.lengthFt]))
    }

    // Compute total price per visit
    const totalPerVisit = boatRows.reduce((sum, b) => {
      const rate = Number(b.rate ?? 0)
      const qty = b.rateType === 'per_ft' ? (boatLengths[b.boatId] ?? 0) : 1
      return sum + rate * qty
    }, 0)

    const inserted = await db.insert(services).values(
      dates.map((serviceDate) => ({
        customerId: schedule.customerId,
        serviceDate,
        serviceType: schedule.serviceType,
        status: 'scheduled' as const,
        recurringScheduleId: schedule.id,
        totalPrice: totalPerVisit > 0 ? String(totalPerVisit) : (schedule.defaultPrice ?? null),
      }))
    ).returning()

    // Insert serviceBoats for each new service
    if (boatRows.length > 0 && inserted.length > 0) {
      const sbRows = inserted.flatMap((svc) =>
        boatRows.map((b) => ({
          serviceId: svc.id,
          boatId: b.boatId,
          rateType: b.rateType,
          rate: b.rate ?? null,
        }))
      )
      await db.insert(serviceBoats).values(sbRows)
    }
  }

  await log({
    action: 'regenerate_recurring_services',
    entityType: 'recurring_schedule',
    entityId: scheduleId,
    metadata: { created: dates.length, boats: boatRows.length },
  })

  revalidatePath(`/customers/${schedule.customerId}`)
  revalidatePath('/schedule')
  return { created: dates.length }
}
