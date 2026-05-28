import { db } from '@/lib/db'
import { invoices, services } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { voidQboInvoice } from '@/lib/qbo/void-invoice'

export async function voidInvoiceById(invoiceId: string): Promise<{
  ok: true
  serviceId: string
} | {
  ok: false
  error: string
}> {
  const [invoice] = await db
    .select({
      id: invoices.id,
      serviceId: invoices.serviceId,
      qboInvoiceId: invoices.qboInvoiceId,
      status: invoices.status,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (!invoice) return { ok: false, error: 'Invoice not found.' }
  if (invoice.status === 'paid') return { ok: false, error: 'Paid invoices cannot be voided.' }
  if (invoice.status === 'void') return { ok: true, serviceId: invoice.serviceId }

  if (invoice.qboInvoiceId) {
    await voidQboInvoice(invoice.qboInvoiceId)
  }

  await db
    .update(invoices)
    .set({ status: 'void', qboNeedsSync: false, lastSyncedAt: new Date() })
    .where(eq(invoices.id, invoiceId))

  return { ok: true, serviceId: invoice.serviceId }
}

export async function voidInvoiceForService(serviceId: string): Promise<{
  ok: true
  invoiceId: string | null
} | {
  ok: false
  error: string
}> {
  const [service] = await db
    .select({ invoiceId: services.invoiceId })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)

  if (!service?.invoiceId) return { ok: true, invoiceId: null }

  const result = await voidInvoiceById(service.invoiceId)
  if (!result.ok) return result

  return { ok: true, invoiceId: service.invoiceId }
}
