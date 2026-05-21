'use server'

import { db } from '@/lib/db'
import { invoices, services, customers, serviceBoats, boats, qboTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getQboClient, fetchQboInvoiceLink } from './client'
import { findBestQboItem } from './items'
import { log } from '@/lib/log'
import { revalidatePath } from 'next/cache'
import { getNextQboDocNumber } from './doc-number'

type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Push the current state of an invoice to QBO.
 * - If the invoice already has a qboInvoiceId, updates the existing QBO invoice.
 * - If not, creates it in QBO and saves the ID back to DB.
 * Returns early (ok: true) if QBO is not connected — never throws.
 */
export async function syncInvoiceToQbo(invoiceId: string): Promise<ActionResult> {
  // Guard: check QBO is connected
  const [tokens] = await db.select({ id: qboTokens.id }).from(qboTokens).where(eq(qboTokens.id, 1)).limit(1)
  if (!tokens) return { ok: true } // QBO not connected — silently skip

  const [inv] = await db
    .select({
      id:           invoices.id,
      serviceId:    invoices.serviceId,
      qboInvoiceId: invoices.qboInvoiceId,
      amount:       invoices.amount,
      docNumber:    invoices.docNumber,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (!inv) return { ok: false, error: 'Invoice not found.' }

  const [service] = await db
    .select({
      serviceDate:   services.serviceDate,
      serviceType:   services.serviceType,
      qboItemId:     services.qboItemId,
      qboCustomerId: customers.qboCustomerId,
      customerEmail: customers.email,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(eq(services.id, inv.serviceId))
    .limit(1)

  if (!service?.qboCustomerId) {
    // Customer not in QBO — skip silently, not an error we can fix here
    return { ok: true }
  }

  const sbRows = await db
    .select({
      boatId:      serviceBoats.boatId,
      description: serviceBoats.description,
      rateType:    serviceBoats.rateType,
      rate:        serviceBoats.rate,
      lengthFt:    boats.lengthFt,
      nickname:    boats.nickname,
    })
    .from(serviceBoats)
    .leftJoin(boats, eq(boats.id, serviceBoats.boatId))
    .where(eq(serviceBoats.serviceId, inv.serviceId))

  if (sbRows.length === 0) return { ok: false, error: 'No boats on this service.' }

  // Use the stored QBO item ID if available, else fall back to fuzzy match
  let qboItem: { id: string; name: string } | null = null
  if (service.qboItemId) {
    const { getCachedQboItems } = await import('./items')
    const cached = await getCachedQboItems()
    const found = cached.find((i) => i.qboItemId === service.qboItemId)
    if (found) qboItem = { id: found.qboItemId, name: found.name }
  }
  if (!qboItem) {
    qboItem = await findBestQboItem(service.serviceType)
  }
  if (!qboItem) {
    return { ok: false, error: 'No QBO items found in cache. Sync items from Settings first.' }
  }

  const resolvedItem = qboItem  // narrowed non-null for use inside callbacks

  const dueDate = new Date(service.serviceDate + 'T00:00:00')
  dueDate.setDate(dueDate.getDate() + 30)

  const lines = sbRows.map((b) => {
    const rate = Number(b.rate ?? 0)
    const qty = b.rateType === 'per_ft' ? (b.lengthFt ?? 1) : 1
    return {
      Amount: rate * qty,
      DetailType: 'SalesItemLineDetail',
      Description: b.description ?? b.nickname ?? '',
      SalesItemLineDetail: {
        ItemRef: { value: resolvedItem.id, name: resolvedItem.name },
        UnitPrice: rate,
        Qty: qty,
        ServiceDate: service.serviceDate,
      },
    }
  })

  try {
    const qbo = await getQboClient()

    if (inv.qboInvoiceId) {
      // Update existing QBO invoice
      const existing = await new Promise<{ Id: string; SyncToken: string }>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qbo.getInvoice(inv.qboInvoiceId!, (err: unknown, result: any) =>
          err ? reject(err) : resolve(result)
        )
      })

      await new Promise<void>((resolve, reject) =>
        qbo.updateInvoice(
          {
            Id: existing.Id,
            SyncToken: existing.SyncToken,
            sparse: true,
            CustomerRef: { value: service.qboCustomerId! },
            TxnDate: service.serviceDate,
            DueDate: dueDate.toISOString().split('T')[0],
            Line: lines,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, _result: any) => (err ? reject(err) : resolve())
        )
      )

      const paymentLink = await fetchQboInvoiceLink(inv.qboInvoiceId!).catch(() => null)
      await db
        .update(invoices)
        .set({ qboNeedsSync: false, lastSyncedAt: new Date(), ...(paymentLink ? { qboPaymentLink: paymentLink } : {}) })
        .where(eq(invoices.id, invoiceId))

      await log({ action: 'sync_invoice_to_qbo', entityType: 'invoice', entityId: invoiceId, metadata: { qboInvoiceId: inv.qboInvoiceId } })
    } else {
      // Create new QBO invoice
      const docNumber = inv.docNumber ? String(inv.docNumber) : await getNextQboDocNumber(qbo)
      const created = await new Promise<{ Id: string; DocNumber?: string }>((resolve, reject) =>
        qbo.createInvoice(
          {
            DocNumber: docNumber,
            CustomerRef: { value: service.qboCustomerId! },
            TxnDate: service.serviceDate,
            DueDate: dueDate.toISOString().split('T')[0],
            Line: lines,
            AllowOnlinePayment: true,
            BillEmail: { Address: service.customerEmail || process.env.GMAIL_USER || '' },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, result: any) => (err ? reject(err) : resolve(result))
        )
      )

      const paymentLink = await fetchQboInvoiceLink(created.Id).catch(() => null)
      await db
        .update(invoices)
        .set({
          qboInvoiceId: created.Id,
          docNumber: created.DocNumber ? parseInt(created.DocNumber, 10) : null,
          qboNeedsSync: false,
          lastSyncedAt: new Date(),
          ...(paymentLink ? { qboPaymentLink: paymentLink } : {}),
        })
        .where(eq(invoices.id, invoiceId))

      await log({ action: 'create_qbo_invoice', entityType: 'invoice', entityId: invoiceId, metadata: { qboInvoiceId: created.Id } })
    }
  } catch (err) {
    return { ok: false, error: `QBO sync failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  revalidatePath('/invoices')
  revalidatePath('/schedule')
  revalidatePath('/settings')
  return { ok: true }
}
