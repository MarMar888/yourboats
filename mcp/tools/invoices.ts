// Invoice tools: list invoices, push/sync to QuickBooks, send to customer, void.
// The QBO push logic is adapted from lib/qbo/sync-invoice.ts and
// app/(app)/invoices/actions.ts, stripped of Next.js cache/redirect calls.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import { invoices, services, customers, serviceBoats, boats, qboTokens, customerReminderContacts } from '../../lib/db/schema'
import { getQboClient, fetchQboInvoiceLink } from '../../lib/qbo/client'
import { findBestQboItem, getCachedQboItems } from '../../lib/qbo/items'
import { voidInvoiceById } from '../../lib/invoices/void-invoice'
import { emailTransport } from '../../lib/email/client'
import { getOwnerId } from '../owner'
import { mcpLog } from '../log'
import { tool, YMD } from './_util'

type Result = { ok: true; [k: string]: unknown } | { ok: false; error: string }

async function qboConnected(): Promise<boolean> {
  const [t] = await db.select({ id: qboTokens.id }).from(qboTokens).where(eq(qboTokens.id, 1)).limit(1)
  return !!t
}

// Build QBO Line[] from the service's boats. Returns null if the service has no boats.
async function buildLines(serviceId: string, serviceDate: string, itemId: string, itemName: string) {
  const sbRows = await db
    .select({ description: serviceBoats.description, rateType: serviceBoats.rateType, rate: serviceBoats.rate, nickname: boats.nickname, lengthFt: boats.lengthFt })
    .from(serviceBoats)
    .leftJoin(boats, eq(boats.id, serviceBoats.boatId))
    .where(eq(serviceBoats.serviceId, serviceId))
  if (sbRows.length === 0) return null
  return sbRows.map((b) => {
    const rate = Number(b.rate ?? 0)
    const qty = b.rateType === 'per_ft' ? (b.lengthFt ?? 1) : 1
    return {
      Amount: rate * qty,
      DetailType: 'SalesItemLineDetail',
      Description: b.description ?? b.nickname ?? '',
      SalesItemLineDetail: { ItemRef: { value: itemId, name: itemName }, UnitPrice: rate, Qty: qty, ServiceDate: serviceDate },
    }
  })
}

// Resolve the QBO item to use for an invoice's line items: explicit override,
// then the service's stored item, then a fuzzy match on the service type.
async function resolveItem(serviceType: string, storedItemId: string | null, overrideId?: string): Promise<{ id: string; name: string } | null> {
  const cached = await getCachedQboItems()
  const pickFromCache = (id: string) => {
    const found = cached.find((i) => i.qboItemId === id)
    return found ? { id: found.qboItemId, name: found.name } : { id, name: serviceType }
  }
  if (overrideId) return pickFromCache(overrideId)
  if (storedItemId) return pickFromCache(storedItemId)
  return findBestQboItem(serviceType)
}

// Push an invoice to QBO — updates the existing QBO invoice if one is linked,
// otherwise creates it and writes back the QBO id, doc number, and payment link.
async function pushInvoiceToQbo(invoiceId: string, overrideItemId?: string): Promise<Result> {
  const ownerId = await getOwnerId()
  if (!(await qboConnected())) return { ok: false, error: 'QuickBooks not connected.' }

  const [inv] = await db
    .select({ id: invoices.id, serviceId: invoices.serviceId, qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)
  if (!inv) return { ok: false, error: 'Invoice not found.' }

  const [service] = await db
    .select({ serviceDate: services.serviceDate, serviceType: services.serviceType, qboItemId: services.qboItemId, qboCustomerId: customers.qboCustomerId, email: customers.email })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(eq(services.id, inv.serviceId))
    .limit(1)
  if (!service) return { ok: false, error: 'Service not found.' }
  if (!service.qboCustomerId) return { ok: false, error: "Customer has no QuickBooks ID. Import them from QBO first." }

  const item = await resolveItem(service.serviceType, service.qboItemId, overrideItemId)
  if (!item) return { ok: false, error: 'No QBO items found in cache. Sync items from Settings first.' }

  const lines = await buildLines(inv.serviceId, service.serviceDate, item.id, item.name)
  if (!lines) return { ok: false, error: 'No boats on this service.' }

  const dueDate = new Date(service.serviceDate + 'T00:00:00')
  dueDate.setDate(dueDate.getDate() + 30)
  const dueStr = dueDate.toISOString().split('T')[0]

  try {
    const qbo = await getQboClient()
    if (inv.qboInvoiceId) {
      const existing = await new Promise<{ Id: string; SyncToken: string }>((resolve, reject) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qbo.getInvoice(inv.qboInvoiceId!, (err: unknown, result: any) => (err ? reject(err) : resolve(result)))
      )
      await new Promise<void>((resolve, reject) =>
        qbo.updateInvoice(
          { Id: existing.Id, SyncToken: existing.SyncToken, sparse: true, CustomerRef: { value: service.qboCustomerId! }, TxnDate: service.serviceDate, DueDate: dueStr, Line: lines },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, _r: any) => (err ? reject(err) : resolve())
        )
      )
      const paymentLink = await fetchQboInvoiceLink(inv.qboInvoiceId).catch(() => null)
      await db.update(invoices).set({ qboNeedsSync: false, lastSyncedAt: new Date(), ...(paymentLink ? { qboPaymentLink: paymentLink } : {}) }).where(eq(invoices.id, invoiceId))
      await mcpLog({ userId: ownerId, action: 'sync_invoice_to_qbo', entityType: 'invoice', entityId: invoiceId, metadata: { qboInvoiceId: inv.qboInvoiceId } })
      return { ok: true, qboInvoiceId: inv.qboInvoiceId, paymentLink: paymentLink ?? null, mode: 'updated' }
    }

    const created = await new Promise<{ Id: string; DocNumber?: string }>((resolve, reject) =>
      qbo.createInvoice(
        { CustomerRef: { value: service.qboCustomerId! }, TxnDate: service.serviceDate, DueDate: dueStr, Line: lines, AllowOnlinePayment: true, BillEmail: { Address: service.email || process.env.GMAIL_USER || '' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: unknown, result: any) => (err ? reject(err) : resolve(result))
      )
    )
    const paymentLink = await fetchQboInvoiceLink(created.Id).catch(() => null)
    await db.update(invoices).set({ qboInvoiceId: created.Id, docNumber: created.DocNumber ? parseInt(created.DocNumber, 10) : null, qboNeedsSync: false, lastSyncedAt: new Date(), ...(paymentLink ? { qboPaymentLink: paymentLink } : {}) }).where(eq(invoices.id, invoiceId))
    await mcpLog({ userId: ownerId, action: 'create_qbo_invoice', entityType: 'invoice', entityId: invoiceId, metadata: { qboInvoiceId: created.Id } })
    return { ok: true, qboInvoiceId: created.Id, docNumber: created.DocNumber ?? null, paymentLink: paymentLink ?? null, mode: 'created' }
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fault = (err as any)?.response?.data?.Fault ?? (err as any)?.Fault
    if (fault?.Error?.length) {
      const e = fault.Error[0]
      return { ok: false, error: `QBO error: ${[e.Message, e.Detail].filter(Boolean).join(' — ')}` }
    }
    return { ok: false, error: `QBO sync failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export function registerInvoiceTools(server: McpServer): void {
  tool(
    server,
    'list_invoices',
    'List invoices with customer name, amount, status, QBO link, and service date. Optionally filter by status and service-date range.',
    {
      status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void']).optional().describe('Filter by invoice status'),
      startDate: z.string().regex(YMD).optional().describe('Earliest service date (YYYY-MM-DD)'),
      endDate: z.string().regex(YMD).optional().describe('Latest service date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(500).optional().describe('Max rows (default 100)'),
    },
    async ({ status, startDate, endDate, limit }) => {
      const conds = []
      if (status) conds.push(eq(invoices.status, status))
      if (startDate) conds.push(gte(services.serviceDate, startDate))
      if (endDate) conds.push(lte(services.serviceDate, endDate))

      const rows = await db
        .select({
          id: invoices.id,
          docNumber: invoices.docNumber,
          amount: invoices.amount,
          status: invoices.status,
          qboInvoiceId: invoices.qboInvoiceId,
          qboNeedsSync: invoices.qboNeedsSync,
          qboPaymentLink: invoices.qboPaymentLink,
          serviceId: invoices.serviceId,
          serviceDate: services.serviceDate,
          customerName: customers.name,
        })
        .from(invoices)
        .innerJoin(services, eq(invoices.serviceId, services.id))
        .innerJoin(customers, eq(services.customerId, customers.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(services.serviceDate))
        .limit(limit ?? 100)
      return { ok: true, count: rows.length, invoices: rows }
    }
  )

  tool(
    server,
    'create_qbo_invoice',
    'Push a local draft invoice to QuickBooks Online. Creates the QBO invoice (or updates it if already linked) and saves back the QBO id and customer payment link.',
    {
      invoiceId: z.string().uuid().describe('Local invoice UUID'),
      qboItemId: z.string().optional().describe('Optional QBO item ID override for the line items'),
    },
    async ({ invoiceId, qboItemId }) => pushInvoiceToQbo(invoiceId, qboItemId)
  )

  tool(
    server,
    'sync_invoice_to_qbo',
    'Re-sync an existing invoice to QuickBooks — pushes current amounts, dates, and line items to the linked QBO invoice (or creates it if not yet linked).',
    {
      invoiceId: z.string().uuid().describe('Local invoice UUID'),
    },
    async ({ invoiceId }) => pushInvoiceToQbo(invoiceId)
  )

  tool(
    server,
    'send_invoice',
    'Send an invoice to the customer. Emails the QBO invoice PDF if the customer has an email; otherwise sends the payment link to their reminder contacts via Gmail. Marks the invoice as sent.',
    {
      invoiceId: z.string().uuid().describe('Local invoice UUID (must already be created in QBO)'),
    },
    async ({ invoiceId }): Promise<Result> => {
      const ownerId = await getOwnerId()
      const [inv] = await db
        .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId, qboPaymentLink: invoices.qboPaymentLink, status: invoices.status, serviceId: invoices.serviceId })
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

      if (!svc.email) {
        const contacts = await db.select({ email: customerReminderContacts.email }).from(customerReminderContacts).where(eq(customerReminderContacts.customerId, svc.customerId))
        if (contacts.length === 0) return { ok: false, error: 'Customer has no email and no reminder contacts on file.' }
        let url = inv.qboPaymentLink ?? ''
        if (!url) {
          url = (await fetchQboInvoiceLink(inv.qboInvoiceId).catch(() => '')) ?? ''
          if (url) await db.update(invoices).set({ qboPaymentLink: url }).where(eq(invoices.id, invoiceId))
        }
        if (!url) return { ok: false, error: 'Could not retrieve the payment link from QBO. Re-sync the invoice first.' }
        const to = contacts.map((c) => c.email).join(', ')
        await emailTransport.sendMail({
          from: `"Squeaky Clean Boats" <${process.env.GMAIL_USER}>`,
          to,
          subject: 'Your invoice from Squeaky Clean Boats',
          text: `Hi ${svc.customerName}, your invoice from Squeaky Clean Boats is ready: ${url}`,
          html: `<p>Hi ${svc.customerName}, your invoice from Squeaky Clean Boats is ready: <a href="${url}">${url}</a></p>`,
        })
        await db.update(invoices).set({ status: 'sent', sentAt: new Date() }).where(eq(invoices.id, invoiceId))
        await mcpLog({ userId: ownerId, action: 'send_invoice_via_reminder_contacts', entityType: 'invoice', entityId: invoiceId, metadata: { to } })
        return { ok: true, sentVia: 'reminder_contacts', to }
      }

      const qbo = await getQboClient()
      await new Promise<void>((resolve, reject) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qbo.sendInvoicePdf(inv.qboInvoiceId!, svc.email!, (err: unknown, _r: any) => (err ? reject(err) : resolve()))
      )
      await db.update(invoices).set({ status: 'sent', sentAt: new Date(), lastSyncedAt: new Date() }).where(eq(invoices.id, invoiceId))
      await mcpLog({ userId: ownerId, action: 'send_qbo_invoice', entityType: 'invoice', entityId: invoiceId })
      return { ok: true, sentVia: 'qbo_email', to: svc.email }
    }
  )

  tool(
    server,
    'void_invoice',
    'Void an invoice locally and in QuickBooks. Paid invoices cannot be voided.',
    {
      invoiceId: z.string().uuid().describe('Local invoice UUID'),
    },
    async ({ invoiceId }): Promise<Result> => {
      const ownerId = await getOwnerId()
      const result = await voidInvoiceById(invoiceId)
      if (!result.ok) return { ok: false, error: result.error }
      await mcpLog({ userId: ownerId, action: 'void_invoice', entityType: 'invoice', entityId: invoiceId, metadata: { serviceId: result.serviceId } })
      return { ok: true, invoiceId, serviceId: result.serviceId }
    }
  )
}
