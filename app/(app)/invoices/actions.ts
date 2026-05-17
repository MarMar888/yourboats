'use server'

import { db } from '@/lib/db'
import { services, customers, serviceBoats, boats, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'
import { findBestQboItem, getCachedQboItems } from '@/lib/qbo/items'
import { syncInvoiceToQbo } from '@/lib/qbo/sync-invoice'
import { log } from '@/lib/log'
import { revalidatePath } from 'next/cache'

export { syncInvoiceToQbo }

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

// ─── QBO void helper (non-fatal) ─────────────────────────────────────────────

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

// ─── Delete invoice ───────────────────────────────────────────────────────────

export async function deleteInvoice(invoiceId: string): Promise<void> {
  const [invoice] = await db
    .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (!invoice) return

  if (invoice.qboInvoiceId) {
    await voidQboInvoice(invoice.qboInvoiceId)
  }

  await db.delete(invoices).where(eq(invoices.id, invoiceId))
  await log({ action: 'delete_invoice', entityType: 'invoice', entityId: invoiceId })
  revalidatePath('/invoices')
}

// ─── Create invoice in QBO (draft stays draft, just gets a qboInvoiceId) ──────

export async function createQboInvoice(invoiceId: string, selectedQboItemId?: string): Promise<ActionResult> {
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
  // If already in QBO, sync/update the existing invoice instead
  if (inv.qboInvoiceId) return syncInvoiceToQbo(invoiceId)

  const [service] = await db
    .select({
      serviceDate:   services.serviceDate,
      serviceType:   services.serviceType,
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

  // Resolve the QBO item: use the caller-provided ID, or auto-match from cache, or fall back to live lookup
  let qboItemId: string
  let qboItemName = 'Services'

  if (selectedQboItemId) {
    // Caller specified an item — look it up in the cache for the name
    const cached = await getCachedQboItems()
    const found = cached.find((i) => i.qboItemId === selectedQboItemId)
    qboItemId = selectedQboItemId
    if (found) qboItemName = found.name
  } else {
    // Auto-match from cache using service type
    const bestItem = await findBestQboItem(service.serviceType)
    if (bestItem) {
      qboItemId = bestItem.id
      qboItemName = bestItem.name
    } else {
      // Cache empty — fall back to live QBO lookup
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
        if (!item) return { ok: false, error: 'No service items found in QuickBooks. Sync items from Settings first.' }
        qboItemId = item.Id
        qboItemName = item.Name
      } catch (err) {
        return { ok: false, error: `QuickBooks connection error: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  }

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

// ─── Fetch cached QBO items for UI dropdowns ──────────────────────────────────

export async function getQboItemsForSelect(): Promise<{ qboItemId: string; name: string }[]> {
  const { getCachedQboItems: fetchItems } = await import('@/lib/qbo/items')
  const items = await fetchItems()
  return items.map((i) => ({ qboItemId: i.qboItemId, name: i.name }))
}

// ─── Edit invoice ─────────────────────────────────────────────────────────────

export async function updateInvoice(
  invoiceId: string,
  { amount, notes, status }: { amount: string; notes: string; status: string }
): Promise<ActionResult> {
  const parsed = Number(amount)
  if (isNaN(parsed) || parsed < 0) return { ok: false, error: 'Invalid amount.' }

  await db
    .update(invoices)
    .set({
      amount: String(parsed),
      notes: notes || null,
      status: status as never,
      qboNeedsSync: true,
    })
    .where(eq(invoices.id, invoiceId))

  await log({ action: 'update_invoice', entityType: 'invoice', entityId: invoiceId, metadata: { amount, status } })
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
