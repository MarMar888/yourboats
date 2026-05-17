'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { services, invoices } from '@/lib/db/schema'
import { and, eq, gte, lte } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'

/**
 * Void a QBO invoice by ID. Non-fatal — logs errors but does not throw.
 */
async function voidQboInvoice(qboInvoiceId: string): Promise<void> {
  try {
    const qbo = await getQboClient()

    const existing = await new Promise<{ Id: string; SyncToken: string }>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qbo.getInvoice(qboInvoiceId, (err: unknown, result: any) =>
        err ? reject(err) : resolve(result)
      )
    })

    await new Promise<void>((resolve, reject) => {
      qbo.updateInvoice(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { Id: existing.Id, SyncToken: existing.SyncToken, sparse: true, void: true } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: unknown, _result: any) => (err ? reject(err) : resolve())
      )
    })
  } catch (err) {
    console.error('[QBO] Failed to void invoice', qboInvoiceId, err)
  }
}

export async function markComplete(serviceId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const [service] = await db
    .select({ id: services.id, status: services.status })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)

  if (!service) return { error: 'Service not found' }
  if (service.status !== 'scheduled') return { error: 'Service is not scheduled' }

  await db
    .update(services)
    .set({ status: 'complete', completedAt: new Date(), completedByUserId: null })
    .where(eq(services.id, serviceId))

  await log({ action: 'mark_complete', entityType: 'service', entityId: serviceId })
  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  return {}
}

export async function deleteService(serviceId: string, redirectTo?: string): Promise<void> {
  const [linkedInvoice] = await db
    .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.serviceId, serviceId))
    .limit(1)

  if (linkedInvoice?.qboInvoiceId) {
    await voidQboInvoice(linkedInvoice.qboInvoiceId)
  }

  await db.delete(services).where(eq(services.id, serviceId))
  await log({ action: 'delete_service', entityType: 'service', entityId: serviceId })

  revalidatePath('/schedule')
  revalidatePath('/invoices')
  if (redirectTo) redirect(redirectTo)
}

export async function approveWeek(startDate: string, endDate: string): Promise<void> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) return

  await db
    .update(services)
    .set({ approvedAt: new Date(), approvedByUserId: currentUser.id })
    .where(
      and(
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'scheduled')
      )
    )

  await log({ action: 'approve_week', entityType: 'week', entityId: startDate, meta: { startDate, endDate } })
  revalidatePath('/schedule')
}

export async function unapproveWeek(formData: FormData) {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const devUser = DEV_USERS.find((u) => u.id === devUserId)
  if (!devUser || (devUser.role !== 'owner' && devUser.role !== 'manager')) return

  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string

  await db
    .update(services)
    .set({ approvedAt: null, approvedByUserId: null })
    .where(
      and(
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'scheduled')
      )
    )

  await log({ action: 'unapprove_week', entityType: 'week', entityId: startDate, meta: { startDate, endDate } })
  revalidatePath('/schedule')
}

export async function unapproveWeek(startDate: string, endDate: string): Promise<void> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) return

  await db
    .update(services)
    .set({ approvedAt: null, approvedByUserId: null })
    .where(
      and(
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'scheduled')
      )
    )

  revalidatePath('/schedule')
}

// TODO: Amount-change sync
// When serviceBoats.rate or serviceBoats.rateType is updated after a QBO invoice
// has already been created for the parent service, the QBO invoice becomes stale.
// This action (or a dedicated updateServiceBoat action) should:
//   1. Detect that invoices.qboInvoiceId is set for the service
//   2. Rebuild the Line[] array from the updated serviceBoats rows
//   3. Call qbo.updateInvoice({ Id, SyncToken, sparse: true, Line: [...] }) to
//      push the new amounts to QBO
//   4. Update invoices.amount and invoices.lastSyncedAt locally

// TODO: Invoice status sync (paid/overdue)
// QBO is the source of truth for payment status. A nightly Vercel Cron job should:
//   - Call qbo.findInvoices([{ field: 'Status', value: 'Paid' }]) (paginated)
//   - For each paid QBO invoice, update the local invoices row:
//       status = 'paid', paidAt = QBO TxnDate or current time, lastSyncedAt = now
//   - Additionally query for overdue invoices (DueDate < today, Balance > 0)
//     and set status = 'overdue' locally
