'use server'

import { db } from '@/lib/db'
import { services, customers, serviceBoats, boats, invoices, customerReminderContacts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'
import { findBestQboItem, getCachedQboItems } from '@/lib/qbo/items'
import { syncInvoiceToQbo } from '@/lib/qbo/sync-invoice'
import { log } from '@/lib/log'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getPostHogClient } from '@/lib/posthog-server'
import { emailTransport } from '@/lib/email/client'

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

export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { ok: false, error: 'Not authorized.' }
  }

  try {
    const [invoice] = await db
      .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId, serviceId: invoices.serviceId })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1)

    if (!invoice) return { ok: false, error: 'Invoice not found.' }

    if (invoice.qboInvoiceId) {
      await voidQboInvoice(invoice.qboInvoiceId)
    }

    // Clear the FK on the service so markComplete can create a fresh invoice later
    if (invoice.serviceId) {
      await db.update(services).set({ invoiceId: null }).where(eq(services.id, invoice.serviceId))
    }

    await db.delete(invoices).where(eq(invoices.id, invoiceId))
    await log({ action: 'delete_invoice', entityType: 'invoice', entityId: invoiceId })

    const posthog = getPostHogClient()
    posthog.capture({ distinctId: user.id, event: 'invoice_deleted', properties: { invoice_id: invoiceId, had_qbo_invoice: !!invoice.qboInvoiceId } })
    await posthog.shutdown()

    revalidatePath('/invoices')
    revalidatePath('/schedule')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Failed to delete: ${err instanceof Error ? err.message : String(err)}` }
  }
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
      qboItemId:     services.qboItemId,
      customerName:  customers.name,
      qboCustomerId: customers.qboCustomerId,
      email:         customers.email,
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

  // Resolve the QBO item: prefer caller-provided ID, then stored service.qboItemId, then fuzzy match
  let qboItemId: string
  let qboItemName = 'Services'

  const cached = await getCachedQboItems()

  const resolveFromId = (id: string) => {
    const found = cached.find((i) => i.qboItemId === id)
    if (found) qboItemName = found.name
    return id
  }

  if (selectedQboItemId) {
    // Caller explicitly chose an item from the UI
    qboItemId = resolveFromId(selectedQboItemId)
  } else if (service.qboItemId) {
    // Service has a stored QBO item ID from when it was created
    qboItemId = resolveFromId(service.qboItemId)
  } else {
    // Old service without stored ID — fuzzy match by service type name
    const bestItem = await findBestQboItem(service.serviceType)
    if (!bestItem) {
      return { ok: false, error: 'No QBO items found in cache. Sync items from Settings first.' }
    }
    qboItemId = bestItem.id
    qboItemName = bestItem.name
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
            ...(service.email ? { BillEmail: { Address: service.email } } : {}),
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

    const createUser = await getCurrentUser()
    if (createUser) {
      const posthog = getPostHogClient()
      posthog.capture({ distinctId: createUser.id, event: 'invoice_created_in_qbo', properties: { invoice_id: invoiceId, qbo_invoice_id: created.Id, amount: inv.amount } })
      await posthog.shutdown()
    }
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
    .select({ email: customers.email, customerId: customers.id, customerName: customers.name })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(eq(services.id, inv.serviceId))
    .limit(1)

  if (!svc) return { ok: false, error: 'Service not found.' }

  // No primary email — fall back to sending the QBO invoice link to reminder contacts
  if (!svc.email) {
    const reminderContacts = await db
      .select({ email: customerReminderContacts.email })
      .from(customerReminderContacts)
      .where(eq(customerReminderContacts.customerId, svc.customerId))

    if (reminderContacts.length === 0) {
      return { ok: false, error: "Customer has no email address and no reminder contacts on file. Add one to their record and try again." }
    }

    // Fetch the invoice from QBO to get the client-facing InvoiceLink
    let invoiceUrl: string
    try {
      const qbo = await getQboClient()
      const qboInvoice = await new Promise<any>((resolve, reject) =>
        qbo.getInvoice(inv.qboInvoiceId!, (err: unknown, result: any) =>
          err ? reject(err) : resolve(result)
        )
      )
      invoiceUrl = qboInvoice?.InvoiceLink ?? qboInvoice?.invoice?.InvoiceLink ?? ''
    } catch {
      invoiceUrl = ''
    }

    if (!invoiceUrl) {
      return { ok: false, error: 'Could not retrieve the invoice payment link from QuickBooks. Make sure the invoice exists in QBO.' }
    }

    const to = reminderContacts.map((c) => c.email).join(', ')
    const subject = 'Your invoice from Squeaky Clean Boats'
    const text = `Hi ${svc.customerName}, your invoice from Squeaky Clean Boats is ready: ${invoiceUrl}`
    const html = `<p>Hi ${svc.customerName}, your invoice from Squeaky Clean Boats is ready: <a href="${invoiceUrl}">${invoiceUrl}</a></p>`

    try {
      await emailTransport.sendMail({
        from: `"Squeaky Clean Boats" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text,
        html,
      })
    } catch (err) {
      return { ok: false, error: `Failed to send: ${err instanceof Error ? err.message : String(err)}` }
    }

    await db.update(invoices).set({ status: 'sent', sentAt: new Date() }).where(eq(invoices.id, invoiceId))
    await log({ action: 'send_invoice_via_reminder_contacts', entityType: 'invoice', entityId: invoiceId, metadata: { to } })
    revalidatePath('/invoices')
    return { ok: true }
  }

  try {
    const qbo = await getQboClient()
    await new Promise<void>(
      (resolve, reject) =>
        qbo.sendInvoicePdf(
          inv.qboInvoiceId!,
          svc.email!,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, _result: any) => (err ? reject(err) : resolve())
        )
    )

    await db
      .update(invoices)
      .set({ status: 'sent', sentAt: new Date(), lastSyncedAt: new Date() })
      .where(eq(invoices.id, invoiceId))

    await log({ action: 'send_qbo_invoice', entityType: 'invoice', entityId: invoiceId })

    const sendUser = await getCurrentUser()
    if (sendUser) {
      const posthog = getPostHogClient()
      posthog.capture({ distinctId: sendUser.id, event: 'invoice_sent', properties: { invoice_id: invoiceId, qbo_invoice_id: inv.qboInvoiceId } })
      await posthog.shutdown()
    }
  } catch (err) {
    return { ok: false, error: `Failed to send: ${err instanceof Error ? err.message : String(err)}` }
  }

  revalidatePath('/invoices')
  return { ok: true }
}
