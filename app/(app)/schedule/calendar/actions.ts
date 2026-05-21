'use server'

import { db } from '@/lib/db'
import { calendarEvents } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { revalidatePath } from 'next/cache'
import { log } from '@/lib/log'

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function createCalendarEvent(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const title = (formData.get('title') as string)?.trim()
  const eventDate = (formData.get('eventDate') as string)?.trim()
  const endDate = (formData.get('endDate') as string)?.trim() || null
  const color = (formData.get('color') as string) || 'blue'
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!title) return { ok: false, error: 'Title is required.' }
  if (!eventDate) return { ok: false, error: 'Date is required.' }
  if (endDate && endDate < eventDate) return { ok: false, error: 'End date must be on or after the start date.' }

  const [event] = await db
    .insert(calendarEvents)
    .values({ title, eventDate, endDate, color, notes, createdByUserId: user.id })
    .returning()

  await log({ action: 'create_calendar_event', entityType: 'calendar_event', entityId: event.id, metadata: { title, eventDate } })

  revalidatePath('/schedule/calendar')
  return { ok: true }
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  await db.delete(calendarEvents).where(eq(calendarEvents.id, id))
  await log({ action: 'delete_calendar_event', entityType: 'calendar_event', entityId: id })
  revalidatePath('/schedule/calendar')
}
