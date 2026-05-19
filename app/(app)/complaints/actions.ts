'use server'

import { db } from '@/lib/db'
import { complaints } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { getPostHogClient } from '@/lib/posthog-server'

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
    revalidatePath(`/schedule/${serviceId}`)
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

  const resolveUser = await getCurrentUser()
  if (resolveUser) {
    const posthog = getPostHogClient()
    posthog.capture({ distinctId: resolveUser.id, event: 'complaint_resolved', properties: { complaint_id: complaintId } })
    await posthog.shutdown()
  }

  revalidatePath('/complaints')
}
