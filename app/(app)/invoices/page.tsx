import { db } from '@/lib/db'
import { services, customers, invoices } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { cn } from '@/lib/utils'
import { InvoiceActionsButton } from './invoice-actions-button'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { deleteInvoice } from './actions'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(ymd: string) {
  const [, m, d] = ymd.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${d}`
}

function qboInvoiceUrl(qboInvoiceId: string) {
  const base = process.env.QBO_ENVIRONMENT === 'production'
    ? 'https://app.qbo.intuit.com'
    : 'https://sandbox.qbo.intuit.com'
  return `${base}/app/invoice?txnId=${qboInvoiceId}`
}

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'

function statusClass(status: InvoiceStatus) {
  switch (status) {
    case 'draft':   return 'border-border bg-muted text-muted-foreground'
    case 'sent':    return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'paid':    return 'border-green-200 bg-green-50 text-green-700'
    case 'overdue': return 'border-red-200 bg-red-50 text-red-700'
    case 'void':    return 'border-border bg-muted text-muted-foreground'
  }
}

export default async function InvoicesPage() {
  // Draft invoices for completed services — ready to send
  const pending = await db
    .select({
      invoiceId:     invoices.id,
      qboInvoiceId:  invoices.qboInvoiceId,
      amount:        invoices.amount,
      status:        invoices.status,
      sentAt:        invoices.sentAt,
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
      amount:        invoices.amount,
      status:        invoices.status,
      sentAt:        invoices.sentAt,
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
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-sm">
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
                  <tr key={inv.invoiceId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <a href={`/schedule/${inv.serviceId}`} className="hover:underline">
                        {inv.customerName}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.serviceDate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      ${Number(inv.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <InvoiceActionsButton
                          invoiceId={inv.invoiceId}
                          hasQboId={!!inv.qboInvoiceId}
                          status={inv.status}
                        />
                        <ConfirmDeleteButton
                          action={deleteInvoice.bind(null, inv.invoiceId)}
                          title="Delete invoice"
                          description={`Delete the draft invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)})? This cannot be undone.`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-sm">
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
                  <tr key={inv.invoiceId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <a href={`/schedule/${inv.serviceId}`} className="hover:underline">
                        {inv.customerName}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.serviceDate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      ${Number(inv.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        statusClass(inv.status as InvoiceStatus)
                      )}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {inv.qboInvoiceId ? (
                        <a
                          href={qboInvoiceUrl(inv.qboInvoiceId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          #{inv.qboInvoiceId}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ConfirmDeleteButton
                        action={deleteInvoice.bind(null, inv.invoiceId)}
                        title="Delete invoice"
                        description={`Delete the ${inv.status} invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)})? This cannot be undone.`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
