'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { serviceRequests, services } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { rescheduleService } from '@/app/(app)/schedule/actions'
import { voidInvoiceForService } from '@/lib/invoices/void-invoice'
import { refreshServicePayroll } from '@/lib/pay/payroll-projection'
import { log } from '@/lib/log'

type ActionResult = { ok: true } | { ok: false; error: string }

async function requireStaff() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) return null
  return user
}

async function loadRequest(id: string) {
  const [row] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id)).limit(1)
  return row ?? null
}

// Dev-auth users have non-UUID ids (e.g. "dev-owner") that would violate the
// users FK, same guard as uuidOrNull() in schedule/actions.ts.
function uuidOrNull(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

async function markResolved(id: string, status: 'approved' | 'denied', userId: string, staffResponse?: string) {
  await db
    .update(serviceRequests)
    .set({
      status,
      staffResponse: staffResponse?.trim() || null,
      resolvedByUserId: uuidOrNull(userId),
      resolvedAt: new Date(),
    })
    .where(eq(serviceRequests.id, id))
  revalidatePath('/client-requests')
  revalidatePath('/client/requests')
}

// Reschedule requests apply straight through the existing schedule action so
// the two paths (staff dragging a date, client requesting one) can never drift.
export async function approveRescheduleRequest(id: string): Promise<ActionResult> {
  const user = await requireStaff()
  if (!user) return { ok: false, error: 'Not authorized.' }

  const request = await loadRequest(id)
  if (!request || request.type !== 'reschedule' || !request.serviceId || !request.requestedDate) {
    return { ok: false, error: 'Invalid request.' }
  }
  if (request.status !== 'pending') return { ok: false, error: 'Already resolved.' }

  const result = await rescheduleService(request.serviceId, request.requestedDate)
  if (result.error) return { ok: false, error: result.error }

  await markResolved(id, 'approved', user.id)
  await log({ action: 'approve_client_reschedule', entityType: 'service_request', entityId: id })
  return { ok: true }
}

// Mirrors the cancel branch of updateService (schedule/[id]/actions.ts): void
// the linked invoice before flipping status, so QBO and pay stay consistent
// with a staff-initiated cancellation instead of just hiding the service.
export async function approveCancelRequest(id: string): Promise<ActionResult> {
  const user = await requireStaff()
  if (!user) return { ok: false, error: 'Not authorized.' }

  const request = await loadRequest(id)
  if (!request || request.type !== 'cancel' || !request.serviceId) return { ok: false, error: 'Invalid request.' }
  if (request.status !== 'pending') return { ok: false, error: 'Already resolved.' }

  const [service] = await db
    .select({ status: services.status })
    .from(services)
    .where(eq(services.id, request.serviceId))
    .limit(1)
  if (!service) return { ok: false, error: 'Service not found.' }
  if (service.status !== 'scheduled') return { ok: false, error: 'That service is no longer scheduled.' }

  const voidResult = await voidInvoiceForService(request.serviceId)
  if (!voidResult.ok) return { ok: false, error: voidResult.error }

  await db.update(services).set({ status: 'cancelled' }).where(eq(services.id, request.serviceId))
  await refreshServicePayroll(request.serviceId, 'service_cancelled')
  await markResolved(id, 'approved', user.id)
  await log({ action: 'approve_client_cancel', entityType: 'service_request', entityId: id })
  revalidatePath('/schedule')
  revalidatePath('/invoices')
  revalidatePath('/pay')
  return { ok: true }
}

// Generic resolve, used for notes (mark read + optional reply), new-service
// requests (staff creates the real service manually via the prefilled link,
// then marks this done), and denying any request type.
export async function resolveRequest(
  id: string,
  status: 'approved' | 'denied',
  staffResponse?: string
): Promise<ActionResult> {
  const user = await requireStaff()
  if (!user) return { ok: false, error: 'Not authorized.' }

  const request = await loadRequest(id)
  if (!request) return { ok: false, error: 'Not found.' }
  if (request.status !== 'pending') return { ok: false, error: 'Already resolved.' }

  await markResolved(id, status, user.id, staffResponse)
  await log({
    action: `client_request_${status}`,
    entityType: 'service_request',
    entityId: id,
    metadata: { type: request.type },
  })
  return { ok: true }
}
