import Link from 'next/link'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { boats, customers, services } from '@/lib/db/schema'
import { getClientSession } from '@/lib/auth/client-session'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getOpenInvoicesForCustomer } from '@/lib/qbo/open-invoices'
import { formatServiceType, formatServiceDate } from './format'
import { AddNoteButton } from './add-note-button'

export default async function ClientDashboardPage() {
  const session = await getClientSession()
  if (!session) redirect('/login')

  const [customer] = await db
    .select({ id: customers.id, qboCustomerId: customers.qboCustomerId })
    .from(customers)
    .where(eq(customers.id, session.customerId))
    .limit(1)
  if (!customer) redirect('/login')

  const [upcomingServices, customerBoats, openInvoices] = await Promise.all([
    db
      .select()
      .from(services)
      .where(and(eq(services.customerId, customer.id), eq(services.status, 'scheduled')))
      .orderBy(asc(services.serviceDate))
      .limit(5),
    db.select().from(boats).where(eq(boats.customerId, customer.id)).orderBy(boats.nickname),
    customer.qboCustomerId
      ? getOpenInvoicesForCustomer(customer.qboCustomerId).catch(() => [])
      : Promise.resolve([]),
  ])

  const next = upcomingServices[0]
  const totalDue = openInvoices.reduce((sum, inv) => sum + inv.balance, 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next service</CardTitle>
        </CardHeader>
        <CardContent>
          {next ? (
            <Link href={`/client/service/${next.id}`} className="block space-y-1">
              <p className="text-lg font-medium">{formatServiceType(next.serviceType)}</p>
              <p className="text-muted-foreground">{formatServiceDate(next.serviceDate)}</p>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing scheduled right now.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outstanding invoices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!customer.qboCustomerId ? (
            <p className="text-sm text-muted-foreground">No billing on file yet.</p>
          ) : openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">You&apos;re all paid up.</p>
          ) : (
            <>
              {openInvoices.map((inv) => (
                <div key={inv.qboInvoiceId} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{inv.docNumber ? `Invoice #${inv.docNumber}` : 'Invoice'}</p>
                    <p className="text-muted-foreground">${inv.balance.toFixed(2)}</p>
                  </div>
                  {inv.paymentLink && (
                    <Button asChild size="sm">
                      <a href={inv.paymentLink} target="_blank" rel="noopener noreferrer">
                        Pay now
                      </a>
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
                <span>Total due</span>
                <span>${totalDue.toFixed(2)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boats on file</CardTitle>
        </CardHeader>
        <CardContent>
          {customerBoats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No boats on file yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {customerBoats.map((b) => (
                <li key={b.id}>
                  {b.nickname}
                  {b.makeModel ? <span className="text-muted-foreground"> · {b.makeModel}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col flex-wrap gap-2 sm:flex-row">
        <Button asChild variant="secondary" className="flex-1">
          <Link href="/client/request">Request a service</Link>
        </Button>
        <AddNoteButton />
        <Button asChild variant="outline" className="flex-1">
          <Link href="/client/requests">My requests</Link>
        </Button>
      </div>
    </div>
  )
}
