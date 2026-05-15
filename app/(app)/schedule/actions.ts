'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { services, invoices } from '@/lib/db/schema'
import { and, eq, gte, lte } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
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

export async function approveWeek(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const devUser = DEV_USERS.find((u) => u.id === devUserId)
  if (!devUser || (devUser.role !== 'owner' && devUser.role !== 'manager')) return

  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string

  await db
    .update(services)
    .set({ approvedAt: new Date(), approvedByUserId: devUser.id })
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
