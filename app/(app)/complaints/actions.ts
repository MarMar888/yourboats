'use server'

import { db } from '@/lib/db'
import { complaints, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { log } from '@/lib/log'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCurrentUser() {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const devUser = DEV_USERS.find((u) => u.id === devUserId)
  if (!devUser) return null

  // Look up the real DB user by email
  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, devUser.email))
    .limit(1)

  return dbUser ?? null
}

// ─── Log complaint ─────────────────────────────────────────────────────────────

export type LogComplaintResult =
  | { ok: true }
  | { ok: false; error: string }

export async function logComplaint(formData: FormData): Promise<LogComplaintResult> {
  const serviceId = (formData.get('serviceId') as string)?.trim()
  const customerId = (formData.get('customerId') as string)?.trim()
  const description = (formData.get('description') as string)?.trim()
  const severity = formData.get('severity') as 'minor' | 'major'

  if (!serviceId) return { ok: false, error: 'Service ID is required.' }
  if (!customerId) return { ok: false, error: 'Customer ID is required.' }
  if (!description) return { ok: false, error: 'Description is required.' }
  if (severity !== 'minor' && severity !== 'major') {
    return { ok: false, error: 'Severity must be minor or major.' }
  }

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return { ok: false, error: 'Could not identify current user. Make sure a user account exists for your dev email.' }
  }

  try {
    const [complaint] = await db
      .insert(complaints)
      .values({
        serviceId,
        customerId,
        description,
        severity,
        createdByUserId: currentUser.id,
      })
      .returning()

    await log({
      action: 'log_complaint',
      entityType: 'complaint',
      entityId: complaint.id,
      metadata: { serviceId, customerId, severity },
    })

    revalidatePath('/complaints')
    return { ok: true }
  } catch (err) {
    await log({
      action: 'log_complaint',
      entityType: 'complaint',
      error: String(err),
      metadata: { serviceId, customerId, severity },
    })
    return { ok: false, error: 'Failed to log complaint. Please try again.' }
  }
}

// ─── Resolve complaint ────────────────────────────────────────────────────────

export async function resolveComplaint(complaintId: string): Promise<void> {
  await db
    .update(complaints)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(complaints.id, complaintId))

  await log({
    action: 'resolve_complaint',
    entityType: 'complaint',
    entityId: complaintId,
  })

  revalidatePath('/complaints')
}
