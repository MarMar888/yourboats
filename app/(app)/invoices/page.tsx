import { db } from '@/lib/db'
import { boats, customers, invoices, serviceBoats, services } from '@/lib/db/schema'
import { eq, desc, asc, and, inArray } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getCachedQboItems } from '@/lib/qbo/items'
import { syncInvoiceStatuses } from '@/lib/qbo/sync-statuses'
import { InvoiceRow } from './invoice-row'

// Server action IDs are embedded in the page HTML — prevent CDN caching so
// clients always get the current build's IDs and actions round-trip correctly.
export const dynamic = 'force-dynamic'

export default async function InvoicesPage() {
  // Sync payment status from QBO before rendering — updates sent→paid/overdue silently
  const syncStatusesPromise = syncInvoiceStatuses()

  const [currentUser, qboItems] = await Promise.all([
    getCurrentUser(),
    getCachedQboItems(),
  ])
  const canManage = currentUser?.role === 'owner' || currentUser?.role === 'manager'
  const qboEnv = process.env.QBO_ENVIRONMENT
  const qboItemOptions = qboItems.map((i) => ({ qboItemId: i.qboItemId, name: i.name }))

  // Draft invoices for completed services — ready to send
  const invoiceSelect = {
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
    isPrepaid:     customers.isPrepaid,
  }

  await syncStatusesPromise

  const [pending, pastDue, sent, paid] = await Promise.all([
    db
      .select(invoiceSelect)
      .from(invoices)
      .innerJoin(services, eq(invoices.serviceId, services.id))
      .innerJoin(customers, eq(services.customerId, customers.id))
      .where(and(eq(invoices.status, 'draft'), eq(services.status, 'complete')))
      .orderBy(desc(invoices.createdAt)),
    // Accounts receivable: sent invoices that are unpaid and past their due date
    db
      .select(invoiceSelect)
      .from(invoices)
      .innerJoin(services, eq(invoices.serviceId, services.id))
      .innerJoin(customers, eq(services.customerId, customers.id))
      .where(and(eq(services.status, 'complete'), eq(invoices.status, 'overdue')))
      .orderBy(asc(services.serviceDate)),
    db
      .select(invoiceSelect)
      .from(invoices)
      .innerJoin(services, eq(invoices.serviceId, services.id))
      .innerJoin(customers, eq(services.customerId, customers.id))
      .where(and(eq(services.status, 'complete'), inArray(invoices.status, ['sent', 'void'])))
      .orderBy(desc(invoices.createdAt)),
    db
      .select(invoiceSelect)
      .from(invoices)
      .innerJoin(services, eq(invoices.serviceId, services.id))
      .innerJoin(customers, eq(services.customerId, customers.id))
      .where(and(eq(services.status, 'complete'), eq(invoices.status, 'paid')))
      .orderBy(desc(invoices.paidAt)),
  ])

  const pastDueTotal = pastDue.reduce((sum, inv) => sum + Number(inv.amount), 0)

  const allInvoices = [...pending, ...pastDue, ...sent, ...paid]
  const serviceIds = Array.from(new Set(allInvoices.map((inv) => inv.serviceId)))
  const lineRows = serviceIds.length > 0
    ? await db
      .select({
        serviceId: serviceBoats.serviceId,
        boatId: serviceBoats.boatId,
        nickname: boats.nickname,
        lengthFt: boats.lengthFt,
        description: serviceBoats.description,
        rateType: serviceBoats.rateType,
        rate: serviceBoats.rate,
      })
      .from(serviceBoats)
      .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
      .where(inArray(serviceBoats.serviceId, serviceIds))
    : []
  const linesByService = new Map<string, typeof lineRows>()
  for (const line of lineRows) {
    linesByService.set(line.serviceId, [...(linesByService.get(line.serviceId) ?? []), line])
  }

  const sumAmount = (rows: { amount: string }[]) => rows.reduce((sum, r) => sum + Number(r.amount), 0)
  const unpaidTotal = sumAmount(sent) + sumAmount(pastDue)
  const unpaidCount = sent.length + pastDue.length
  const pendingTotal = sumAmount(pending)
  const paidTotal = sumAmount(paid)

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Invoices</h1>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Outstanding (unpaid)"
          value={`$${unpaidTotal.toFixed(2)}`}
          sub={`${unpaidCount} invoice${unpaidCount === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Past due"
          value={`$${pastDueTotal.toFixed(2)}`}
          sub={`${pastDue.length} invoice${pastDue.length === 1 ? '' : 's'}`}
          highlight={pastDue.length > 0 ? 'red' : undefined}
        />
        <StatCard
          label="Ready to send"
          value={`$${pendingTotal.toFixed(2)}`}
          sub={`${pending.length} invoice${pending.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Paid"
          value={`$${paidTotal.toFixed(2)}`}
          sub={`${paid.length} invoice${paid.length === 1 ? '' : 's'}`}
          highlight="green"
        />
      </div>

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
                      isPrepaid: inv.isPrepaid ?? false,
                      canManage,
                      qboEnv,
                      lineItems: linesByService.get(inv.serviceId) ?? [],
                    }}
                    qboItemOptions={qboItemOptions}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Past due (accounts receivable) ── */}
      <section className="mb-10">
        <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
          Past due
          {pastDue.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({pastDue.length})</span>
          )}
          {pastDueTotal > 0 && (
            <span className="ml-1 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 tabular-nums">
              ${pastDueTotal.toFixed(2)} owed
            </span>
          )}
        </h2>

        {pastDue.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No past due invoices — all sent invoices are within terms.
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-card overflow-hidden">
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
                {pastDue.map((inv) => (
                  <InvoiceRow
                    key={inv.invoiceId}
                    inv={{ ...inv, canManage, qboEnv, lineItems: linesByService.get(inv.serviceId) ?? [] }}
                    qboItemOptions={qboItemOptions}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Sent / void ── */}
      <section className="mb-10">
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
                    inv={{ ...inv, canManage, qboEnv, lineItems: linesByService.get(inv.serviceId) ?? [] }}
                    qboItemOptions={qboItemOptions}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Paid ── */}
      <section>
        <h2 className="text-lg font-medium mb-3">
          Paid
          {paid.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({paid.length})</span>
          )}
        </h2>

        {paid.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No paid invoices yet.
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
                {paid.map((inv) => (
                  <InvoiceRow
                    key={inv.invoiceId}
                    inv={{ ...inv, canManage, qboEnv, lineItems: linesByService.get(inv.serviceId) ?? [] }}
                    qboItemOptions={qboItemOptions}
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

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${highlight === 'green' ? 'text-green-700' : highlight === 'red' ? 'text-red-600' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
