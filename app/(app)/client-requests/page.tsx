import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { serviceRequests, customers, services } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RequestActions } from './request-actions'

const TYPE_LABEL: Record<string, string> = {
  reschedule: 'Move request',
  cancel: 'Cancellation request',
  note: 'Note',
  new_service: 'New service request',
}

function formatServiceType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusVariant(status: string) {
  if (status === 'approved') return 'success' as const
  if (status === 'denied') return 'destructive' as const
  return 'secondary' as const
}

export default async function ClientRequestsPage() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) redirect('/dashboard')

  const rows = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      status: serviceRequests.status,
      requestedDate: serviceRequests.requestedDate,
      serviceType: serviceRequests.serviceType,
      message: serviceRequests.message,
      staffResponse: serviceRequests.staffResponse,
      createdAt: serviceRequests.createdAt,
      customerId: serviceRequests.customerId,
      customerName: customers.name,
      svcDate: services.serviceDate,
      svcType: services.serviceType,
    })
    .from(serviceRequests)
    .innerJoin(customers, eq(serviceRequests.customerId, customers.id))
    .leftJoin(services, eq(serviceRequests.serviceId, services.id))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(100)

  const pending = rows.filter((r) => r.status === 'pending')
  const resolved = rows.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Client requests</h1>

      <div>
        <h2 className="text-lg font-semibold mb-3">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Nothing waiting on you.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-2 pt-4 pb-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <a href={`/customers/${r.customerId}`} className="font-medium hover:underline">
                        {r.customerName}
                      </a>
                      <span className="text-muted-foreground"> · {TYPE_LABEL[r.type]}</span>
                    </div>
                    <Badge variant={statusVariant(r.status)} className="capitalize">
                      {r.status}
                    </Badge>
                  </div>
                  {r.svcType && r.svcDate && (
                    <p className="text-muted-foreground">
                      Current: {formatServiceType(r.svcType)} · {formatDate(r.svcDate)}
                    </p>
                  )}
                  {r.serviceType && <p className="text-muted-foreground">Wants: {formatServiceType(r.serviceType)}</p>}
                  {r.requestedDate && <p className="text-muted-foreground">Requested date: {formatDate(r.requestedDate)}</p>}
                  {r.message && <p className="italic text-muted-foreground">&ldquo;{r.message}&rdquo;</p>}

                  <RequestActions
                    id={r.id}
                    type={r.type}
                    createServiceHref={
                      r.type === 'new_service'
                        ? `/schedule/new?customerId=${r.customerId}${r.requestedDate ? `&date=${r.requestedDate}` : ''}${
                            r.serviceType ? `&serviceType=${encodeURIComponent(r.serviceType)}` : ''
                          }${r.message ? `&notes=${encodeURIComponent(r.message)}` : ''}`
                        : undefined
                    }
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Resolved</h2>
          <div className="rounded-lg border bg-card divide-y">
            {resolved.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={`/customers/${r.customerId}`} className="font-medium hover:underline">
                      {r.customerName}
                    </a>
                    <span className="text-muted-foreground">{TYPE_LABEL[r.type]}</span>
                  </div>
                  {r.staffResponse && <p className="text-muted-foreground">{r.staffResponse}</p>}
                </div>
                <Badge variant={statusVariant(r.status)} className="capitalize shrink-0">
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
