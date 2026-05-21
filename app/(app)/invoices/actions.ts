'use server'

import { db } from '@/lib/db'
import { services, customers, serviceBoats, boats, invoices, customerReminderContacts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getQboClient, fetchQboInvoiceLink } from '@/lib/qbo/client'
import { voidQboInvoice } from '@/lib/qbo/void-invoice'
import { findBestQboItem, getCachedQboItems } from '@/lib/qbo/items'
import { getNextQboDocNumber } from '@/lib/qbo/doc-number'
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
      docNumber:     invoices.docNumber,
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

    const docNumber = inv.docNumber ? String(inv.docNumber) : await getNextQboDocNumber(qbo)
    const created = await new Promise<{ Id: string; DocNumber?: string }>(
      (resolve, reject) =>
        qbo.createInvoice(
          {
            DocNumber: docNumber,
            CustomerRef: { value: service.qboCustomerId! },
            TxnDate: service.serviceDate,
            DueDate: dueDate.toISOString().split('T')[0],
            Line: lines,
            AllowOnlinePayment: true,
            // BillEmail required for QBO to generate InvoiceLink; fall back to business email
            BillEmail: { Address: service.email || process.env.GMAIL_USER || '' },
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
        lastSyncedAt: new Date(),
        ...(paymentLink ? { qboPaymentLink: paymentLink } : {}),
      })
      .where(eq(invoices.id, invoiceId))

    await log({ action: 'create_qbo_invoice', entityType: 'invoice', entityId: invoiceId, metadata: { qboInvoiceId: created.Id, hasPaymentLink: !!paymentLink } })

    const createUser = await getCurrentUser()
    if (createUser) {
      const posthog = getPostHogClient()
      posthog.capture({ distinctId: createUser.id, event: 'invoice_created_in_qbo', properties: { invoice_id: invoiceId, qbo_invoice_id: created.Id, amount: inv.amount } })
      await posthog.shutdown()
    }
  } catch (err: unknown) {
    // QBO returns fault details in the response body — surface them instead of the generic axios message
    const fault = (err as any)?.response?.data?.Fault ?? (err as any)?.Fault
    if (fault?.Error?.length) {
      const e = fault.Error[0]
      const detail = [e.Message, e.Detail].filter(Boolean).join(' — ')
      console.error('[QBO] createInvoice fault', JSON.stringify(fault))
      return { ok: false, error: `QBO error: ${detail}` }
    }
    console.error('[QBO] createInvoice error', err)
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
  { amount, notes, status, docNumber }: { amount: string; notes: string; status: string; docNumber?: string }
): Promise<ActionResult> {
  const parsed = Number(amount)
  if (isNaN(parsed) || parsed < 0) return { ok: false, error: 'Invalid amount.' }

  const parsedDocNumber = docNumber && docNumber.trim() !== '' ? parseInt(docNumber, 10) : undefined
  if (parsedDocNumber !== undefined && (isNaN(parsedDocNumber) || parsedDocNumber <= 0)) {
    return { ok: false, error: 'Invoice number must be a positive number.' }
  }

  await db
    .update(invoices)
    .set({
      amount: String(parsed),
      notes: notes || null,
      status: status as never,
      qboNeedsSync: true,
      ...(parsedDocNumber !== undefined ? { docNumber: parsedDocNumber } : {}),
    })
    .where(eq(invoices.id, invoiceId))

  await log({ action: 'update_invoice', entityType: 'invoice', entityId: invoiceId, metadata: { amount, status, docNumber: parsedDocNumber } })
  revalidatePath('/invoices')
  return { ok: true }
}

// ─── Send invoice via QBO (emails the customer) ───────────────────────────────

export async function sendQboInvoice(invoiceId: string): Promise<ActionResult> {
  const [inv] = await db
    .select({
      id:             invoices.id,
      qboInvoiceId:   invoices.qboInvoiceId,
      qboPaymentLink: invoices.qboPaymentLink,
      status:         invoices.status,
      serviceId:      invoices.serviceId,
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

  // No primary email — fall back to sending the QBO invoice link to reminder contacts via Gmail
  // (reminder contacts are often vtext addresses — plain text + link, no PDF attachment)
  if (!svc.email) {
    const reminderContacts = await db
      .select({ email: customerReminderContacts.email })
      .from(customerReminderContacts)
      .where(eq(customerReminderContacts.customerId, svc.customerId))

    if (reminderContacts.length === 0) {
      return { ok: false, error: "Customer has no email address and no reminder contacts on file. Add one to their record and try again." }
    }

    // Use the stored payment link; fall back to a live fetch for older invoices
    let invoiceUrl: string = inv.qboPaymentLink ?? ''
    if (!invoiceUrl) {
      try {
        invoiceUrl = await fetchQboInvoiceLink(inv.qboInvoiceId!) ?? ''
        if (invoiceUrl) {
          await db.update(invoices).set({ qboPaymentLink: invoiceUrl }).where(eq(invoices.id, invoiceId))
        }
      } catch {
        invoiceUrl = ''
      }
    }

    if (!invoiceUrl) {
      return { ok: false, error: 'Could not retrieve the invoice payment link from QuickBooks. Try re-syncing the invoice to QBO first.' }
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
