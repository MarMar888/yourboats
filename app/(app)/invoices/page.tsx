import { db } from '@/lib/db'
import { services, customers, invoices } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { deleteInvoice } from './actions'
import { getCachedQboItems } from '@/lib/qbo/items'
import { InvoiceRow } from './invoice-row'


export default async function InvoicesPage() {
  const currentUser = await getCurrentUser()
  const canManage = currentUser?.role === 'owner' || currentUser?.role === 'manager'
  const qboEnv = process.env.QBO_ENVIRONMENT
  const qboItems = await getCachedQboItems()
  const qboItemOptions = qboItems.map((i) => ({ qboItemId: i.qboItemId, name: i.name }))

  // Draft invoices for completed services — ready to send
  const pending = await db
    .select({
      invoiceId:     invoices.id,
      qboInvoiceId:  invoices.qboInvoiceId,
      docNumber:     invoices.docNumber,
      amount:        invoices.amount,
      notes:         invoices.notes,
      status:        invoices.status,
      sentAt:        invoices.sentAt,
      paidAt:        invoices.paidAt,
      serviceDate:   services.serviceDate,
      serviceStatus: services.status,
      serviceId:     services.id,
      customerName:  customers.name,
      customerId:    customers.id,
    })
    .from(invoices)
    .innerJoin(services, eq(invoices.serviceId, services.id))
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(and(eq(invoices.status, 'draft'), eq(services.status, 'complete')))
    .orderBy(desc(invoices.createdAt))

  // Sent / paid / overdue / void
  const sent = await db
    .select({
      invoiceId:     invoices.id,
      qboInvoiceId:  invoices.qboInvoiceId,
      docNumber:     invoices.docNumber,
      amount:        invoices.amount,
      notes:         invoices.notes,
      status:        invoices.status,
      sentAt:        invoices.sentAt,
      paidAt:        invoices.paidAt,
      serviceDate:   services.serviceDate,
      serviceStatus: services.status,
      serviceId:     services.id,
      customerName:  customers.name,
      customerId:    customers.id,
    })
    .from(invoices)
    .innerJoin(services, eq(invoices.serviceId, services.id))
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(and(eq(services.status, 'complete')))
    .orderBy(desc(invoices.createdAt))
    .then((rows) => rows.filter((r) => r.status !== 'draft'))

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Invoices</h1>

      {/* ── Ready to send ── */}
      <section className="mb-10">
        <h2 className="text-lg font-medium mb-3">
          Ready to send
          {pending.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({pending.length})</span>
          )}
        </h2>

        {pending.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No invoices ready — mark services complete to queue them here.
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Service date</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {pending.map((inv) => (
                  <InvoiceRow
                    key={inv.invoiceId}
                    inv={{
                      invoiceId: inv.invoiceId,
                      qboInvoiceId: inv.qboInvoiceId,
                      docNumber: inv.docNumber,
                      amount: inv.amount,
                      notes: inv.notes,
                      status: inv.status,
                      sentAt: inv.sentAt,
                      paidAt: inv.paidAt,
                      serviceDate: inv.serviceDate,
                      serviceStatus: inv.serviceStatus,
                      serviceId: inv.serviceId,
                      customerName: inv.customerName,
                      customerId: inv.customerId,
                      canManage,
                      qboEnv,
                    }}
                    qboItemOptions={qboItemOptions}
                    deleteAction={deleteInvoice.bind(null, inv.invoiceId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Sent / paid / void ── */}
      <section>
        <h2 className="text-lg font-medium mb-3">
          Sent
          {sent.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({sent.length})</span>
          )}
        </h2>

        {sent.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No sent invoices yet.
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Service date</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">QuickBooks</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sent.map((inv) => (
                  <InvoiceRow
                    key={inv.invoiceId}
                    inv={{
                      invoiceId: inv.invoiceId,
                      qboInvoiceId: inv.qboInvoiceId,
                      docNumber: inv.docNumber,
                      amount: inv.amount,
                      notes: inv.notes,
                      status: inv.status,
                      sentAt: inv.sentAt,
                      paidAt: inv.paidAt,
                      serviceDate: inv.serviceDate,
                      serviceStatus: inv.serviceStatus,
                      serviceId: inv.serviceId,
                      customerName: inv.customerName,
                      customerId: inv.customerId,
                      canManage,
                      qboEnv,
                    }}
                    qboItemOptions={qboItemOptions}
                    deleteAction={deleteInvoice.bind(null, inv.invoiceId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
