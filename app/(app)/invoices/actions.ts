'use server'

import { db } from '@/lib/db'
import { services, customers, serviceBoats, boats, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'
import { log } from '@/lib/log'
import { revalidatePath } from 'next/cache'

// ─── Delete invoice ───────────────────────────────────────────────────────────

export async function deleteInvoice(invoiceId: string): Promise<void> {
  await db.delete(invoices).where(eq(invoices.id, invoiceId))
  await log({ action: 'delete_invoice', entityType: 'invoice', entityId: invoiceId })
  revalidatePath('/invoices')
}

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

// ─── Create invoice in QBO (draft stays draft, just gets a qboInvoiceId) ──────

export async function createQboInvoice(invoiceId: string): Promise<ActionResult> {
  const [inv] = await db
    .select({
      id:            invoices.id,
      serviceId:     invoices.serviceId,
      qboInvoiceId:  invoices.qboInvoiceId,
      amount:        invoices.amount,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (!inv) return { ok: false, error: 'Invoice not found.' }
  if (inv.qboInvoiceId) return { ok: false, error: 'Already created in QuickBooks.' }

  const [service] = await db
    .select({
      serviceDate:   services.serviceDate,
      customerName:  customers.name,
      qboCustomerId: customers.qboCustomerId,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(eq(services.id, inv.serviceId))
    .limit(1)

  if (!service?.qboCustomerId) {
    return { ok: false, error: `Customer doesn't have a QuickBooks ID. Import them from QBO first.` }
  }

  const sbRows = await db
    .select({
      boatId:      serviceBoats.boatId,
      description: serviceBoats.description,
      rateType:    serviceBoats.rateType,
      rate:        serviceBoats.rate,
      nickname:    boats.nickname,
      lengthFt:    boats.lengthFt,
    })
    .from(serviceBoats)
    .leftJoin(boats, eq(boats.id, serviceBoats.boatId))
    .where(eq(serviceBoats.serviceId, inv.serviceId))

  if (sbRows.length === 0) return { ok: false, error: 'No boats on this service.' }

  // Look up QBO item
  let qboItemId: string
  let qboItemName = 'Services'
  try {
    const qbo = await getQboClient()
    const res = await new Promise<{ QueryResponse?: { Item?: { Id: string; Name: string }[] } }>(
      (resolve, reject) =>
        qbo.findItems(
          [{ field: 'fetchAll', value: true }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, result: any) => (err ? reject(err) : resolve(result))
        )
    )
    const items = res.QueryResponse?.Item ?? []
    const item =
      items.find((i) => i.Name.toLowerCase().includes('recurring') || i.Name.toLowerCase().includes('service')) ??
      items[0]
    if (!item) return { ok: false, error: 'No service items found in QuickBooks.' }
    qboItemId = item.Id
    qboItemName = item.Name
  } catch (err) {
    return { ok: false, error: `QuickBooks connection error: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Create invoice in QBO
  try {
    const qbo = await getQboClient()
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
          ItemRef: { value: qboItemId, name: qboItemName },
          UnitPrice: rate,
          Qty: qty,
          ServiceDate: service.serviceDate,
        },
      }
    })

    const created = await new Promise<{ Id: string }>(
      (resolve, reject) =>
        qbo.createInvoice(
          {
            CustomerRef: { value: service.qboCustomerId! },
            TxnDate: service.serviceDate,
            DueDate: dueDate.toISOString().split('T')[0],
            Line: lines,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, result: any) => (err ? reject(err) : resolve(result))
        )
    )

    await db
      .update(invoices)
      .set({ qboInvoiceId: created.Id, lastSyncedAt: new Date() })
      .where(eq(invoices.id, invoiceId))

    await log({ action: 'create_qbo_invoice', entityType: 'invoice', entityId: invoiceId, metadata: { qboInvoiceId: created.Id } })
  } catch (err) {
    return { ok: false, error: `Failed to create in QuickBooks: ${err instanceof Error ? err.message : String(err)}` }
  }

  revalidatePath('/invoices')
  return { ok: true }
}

// ─── Send invoice via QBO (emails the customer) ───────────────────────────────

export async function sendQboInvoice(invoiceId: string): Promise<ActionResult> {
  const [inv] = await db
    .select({
      id:           invoices.id,
      qboInvoiceId: invoices.qboInvoiceId,
      status:       invoices.status,
      serviceId:    invoices.serviceId,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (!inv) return { ok: false, error: 'Invoice not found.' }
  if (!inv.qboInvoiceId) return { ok: false, error: 'Invoice has not been created in QuickBooks yet.' }
  if (inv.status === 'sent' || inv.status === 'paid') return { ok: false, error: 'Invoice already sent.' }

  const [svc] = await db
    .select({ email: customers.email })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(eq(services.id, inv.serviceId))
    .limit(1)

  try {
    const qbo = await getQboClient()
    await new Promise<void>(
      (resolve, reject) =>
        // sendInvoicePdf sends the invoice email via QBO; pass customer email or undefined to use QBO's on-file address
        qbo.sendInvoicePdf(
          inv.qboInvoiceId!,
          svc?.email ?? undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, _result: any) => (err ? reject(err) : resolve())
        )
    )

    await db
      .update(invoices)
      .set({ status: 'sent', sentAt: new Date(), lastSyncedAt: new Date() })
      .where(eq(invoices.id, invoiceId))

    await log({ action: 'send_qbo_invoice', entityType: 'invoice', entityId: invoiceId })
  } catch (err) {
    return { ok: false, error: `Failed to send: ${err instanceof Error ? err.message : String(err)}` }
  }

  revalidatePath('/invoices')
  return { ok: true }
}
