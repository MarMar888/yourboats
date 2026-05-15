'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qbo.updateInvoice(
        {
          Id: existing.Id,
          SyncToken: existing.SyncToken,
          sparse: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          void: true,
        } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: unknown, _result: any) => (err ? reject(err) : resolve())
      )
    })
  } catch (err) {
    // QBO errors are non-fatal — log and continue with local delete
    console.error('[QBO] Failed to void invoice', qboInvoiceId, err)
  }
}

export async function createQboInvoice(_invoiceId: string): Promise<void> {
  // TODO: implement QBO invoice creation
  // - Look up invoice + service + customer from DB
  // - Build QBO Invoice payload with line items from serviceBoats rates
  // - Call qbo.createInvoice() and store the returned Id in invoices.qboInvoiceId
  // - Update invoices.lastSyncedAt
  throw new Error('createQboInvoice not yet implemented')
}

export async function sendQboInvoice(_invoiceId: string): Promise<void> {
  // TODO: implement QBO invoice send
  // - Look up invoice.qboInvoiceId
  // - Call qbo.sendInvoicePdf(qboInvoiceId, customerEmail) or
  //   qbo.updateInvoice with EmailStatus = 'EmailSent'
  // - Update invoices.status = 'sent' and invoices.sentAt
  throw new Error('sendQboInvoice not yet implemented')
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  // Load the invoice to check for a QBO link
  const [invoice] = await db
    .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (!invoice) return

  // Attempt to void in QBO before local delete (non-fatal)
  if (invoice.qboInvoiceId) {
    await voidQboInvoice(invoice.qboInvoiceId)
  }

  // Delete locally (cascade handles related records)
  await db.delete(invoices).where(eq(invoices.id, invoiceId))

  revalidatePath('/invoices')
}
