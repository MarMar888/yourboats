'use server'

import { db } from '@/lib/db'
import { recurringSchedules, services } from '@/lib/db/schema'
import { eq, and, gte } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'

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
  scheduleId: string
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

  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local

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
    await db.insert(services).values(
      dates.map((serviceDate) => ({
        customerId: schedule.customerId,
        serviceDate,
        serviceType: schedule.serviceType,
        status: 'scheduled' as const,
        recurringScheduleId: schedule.id,
        totalPrice: schedule.defaultPrice ?? null,
      }))
    )
  }

  await log({
    action: 'regenerate_recurring_services',
    entityType: 'recurring_schedule',
    entityId: scheduleId,
    metadata: { created: dates.length },
  })

  revalidatePath(`/customers/${schedule.customerId}`)
  revalidatePath('/schedule')
  return { created: dates.length }
}
