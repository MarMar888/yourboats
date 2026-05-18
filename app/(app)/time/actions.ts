'use server'

import { db } from '@/lib/db'
import { timeEntries } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionResult = { ok: true } | { ok: false; error: string }

function requireUser() {
  return getCurrentUser().then((u) => {
    if (!u) throw new Error('Not authenticated')
    return u
  })
}

async function requireManager() {
  const u = await requireUser()
  if (u.role !== 'owner' && u.role !== 'manager') redirect('/dashboard')
  return u
}

// ─── Clock in ─────────────────────────────────────────────────────────────────

export async function clockIn(serviceId: string, boatId?: string): Promise<ActionResult> {
  const user = await requireUser()

  // Check if already clocked in for this service
  const [open] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.serviceId, serviceId),
        eq(timeEntries.userId, user.id),
        isNull(timeEntries.clockOut)
      )
    )
    .limit(1)

  if (open) return { ok: false, error: 'Already clocked in for this service.' }

  await db.insert(timeEntries).values({
    serviceId,
    boatId: boatId ?? null,
    userId: user.id,
    clockIn: new Date(),
    createdByUserId: user.id,
  })

  await log({ action: 'clock_in', entityType: 'service', entityId: serviceId })
  revalidatePath(`/schedule/${serviceId}`)
  return { ok: true }
}

// ─── Clock out ────────────────────────────────────────────────────────────────

export async function clockOut(entryId: string): Promise<ActionResult> {
  const user = await requireUser()

  const [entry] = await db
    .select({ id: timeEntries.id, userId: timeEntries.userId, serviceId: timeEntries.serviceId })
    .from(timeEntries)
    .where(eq(timeEntries.id, entryId))
    .limit(1)

  if (!entry) return { ok: false, error: 'Time entry not found.' }

  // Only the employee themselves or a manager can clock out
  const isOwn = entry.userId === user.id
  const isManager = user.role === 'owner' || user.role === 'manager'
  if (!isOwn && !isManager) return { ok: false, error: 'Not authorized.' }

  await db
    .update(timeEntries)
    .set({ clockOut: new Date() })
    .where(eq(timeEntries.id, entryId))

  await log({ action: 'clock_out', entityType: 'service', entityId: entry.serviceId, metadata: { entryId } })
  revalidatePath(`/schedule/${entry.serviceId}`)
  revalidatePath('/time')
  return { ok: true }
}

// ─── Manual entry (manager+) ──────────────────────────────────────────────────

export async function addManualEntry(data: {
  serviceId: string
  boatId: string | null
  userId: string
  clockIn: string   // ISO string
  clockOut: string  // ISO string
  notes: string
}): Promise<ActionResult> {
  const manager = await requireManager()

  const clockInDate = new Date(data.clockIn)
  const clockOutDate = new Date(data.clockOut)

  if (isNaN(clockInDate.getTime())) return { ok: false, error: 'Invalid clock-in time.' }
  if (isNaN(clockOutDate.getTime())) return { ok: false, error: 'Invalid clock-out time.' }
  if (clockOutDate <= clockInDate) return { ok: false, error: 'Clock-out must be after clock-in.' }

  await db.insert(timeEntries).values({
    serviceId: data.serviceId,
    boatId: data.boatId ?? null,
    userId: data.userId,
    clockIn: clockInDate,
    clockOut: clockOutDate,
    notes: data.notes || null,
    createdByUserId: manager.id,
  })

  await log({ action: 'add_manual_time_entry', entityType: 'service', entityId: data.serviceId, metadata: { userId: data.userId } })
  revalidatePath(`/schedule/${data.serviceId}`)
  revalidatePath('/time')
  return { ok: true }
}

// ─── Update entry (manager+) ──────────────────────────────────────────────────

export async function updateTimeEntry(
  entryId: string,
  data: { clockIn: string; clockOut: string; notes: string }
): Promise<ActionResult> {
  await requireManager()

  const clockInDate = new Date(data.clockIn)
  const clockOutDate = new Date(data.clockOut)

  if (isNaN(clockInDate.getTime())) return { ok: false, error: 'Invalid clock-in time.' }
  if (isNaN(clockOutDate.getTime())) return { ok: false, error: 'Invalid clock-out time.' }
  if (clockOutDate <= clockInDate) return { ok: false, error: 'Clock-out must be after clock-in.' }

  const [entry] = await db
    .select({ serviceId: timeEntries.serviceId })
    .from(timeEntries)
    .where(eq(timeEntries.id, entryId))
    .limit(1)

  if (!entry) return { ok: false, error: 'Entry not found.' }

  await db
    .update(timeEntries)
    .set({ clockIn: clockInDate, clockOut: clockOutDate, notes: data.notes || null })
    .where(eq(timeEntries.id, entryId))

  await log({ action: 'update_time_entry', entityType: 'service', entityId: entry.serviceId, metadata: { entryId } })
  revalidatePath(`/schedule/${entry.serviceId}`)
  revalidatePath('/time')
  return { ok: true }
}

// ─── Delete entry (manager+) ──────────────────────────────────────────────────

export async function deleteTimeEntry(entryId: string): Promise<ActionResult> {
  await requireManager()

  const [entry] = await db
    .select({ serviceId: timeEntries.serviceId })
    .from(timeEntries)
    .where(eq(timeEntries.id, entryId))
    .limit(1)

  if (!entry) return { ok: false, error: 'Entry not found.' }

  await db.delete(timeEntries).where(eq(timeEntries.id, entryId))
  await log({ action: 'delete_time_entry', entityType: 'service', entityId: entry.serviceId, metadata: { entryId } })
  revalidatePath(`/schedule/${entry.serviceId}`)
  revalidatePath('/time')
  return { ok: true }
}
