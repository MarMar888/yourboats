'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { services, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'

/**
 * Void a QBO invoice by ID. Non-fatal — logs errors but does not throw.
 */
async function voidQboInvoice(qboInvoiceId: string): Promise<void> {
  try {
    const qbo = await getQboClient()

    // Step 1: fetch current SyncToken (required for any QBO update)
    const existing = await new Promise<{ Id: string; SyncToken: string }>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qbo.getInvoice(qboInvoiceId, (err: unknown, result: any) =>
        err ? reject(err) : resolve(result)
      )
    })

    // Step 2: void via sparse update with void:true
    await new Promise<void>((resolve, reject) => {
      qbo.updateInvoice(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { Id: existing.Id, SyncToken: existing.SyncToken, sparse: true, void: true } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: unknown, _result: any) => (err ? reject(err) : resolve())
      )
    })
  } catch (err) {
    // QBO errors are non-fatal — log and continue with local delete
    console.error('[QBO] Failed to void invoice', qboInvoiceId, err)
  }
}

export async function deleteService(serviceId: string): Promise<void> {
  // Look up any linked invoice with a QBO ID before deleting
  const [linkedInvoice] = await db
    .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.serviceId, serviceId))
    .limit(1)

  // Attempt to void the QBO invoice before local delete (non-fatal)
  if (linkedInvoice?.qboInvoiceId) {
    await voidQboInvoice(linkedInvoice.qboInvoiceId)
  }

  // Delete the service — cascade handles invoice, serviceBoats, serviceAssignments, complaints
  await db.delete(services).where(eq(services.id, serviceId))

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
