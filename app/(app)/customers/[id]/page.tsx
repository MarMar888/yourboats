import { db } from '@/lib/db'
import { customers, boats, services, serviceBoats } from '@/lib/db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AddBoatButton from './customer-detail-client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: string) {
  if (status === 'complete') return 'success' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'secondary' as const
}

function formatServiceType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(d: string) {
  // d is a date string like "2025-05-10"
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Fetch customer
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1)

  if (!customer) notFound()

  // Fetch boats
  const customerBoats = await db
    .select()
    .from(boats)
    .where(eq(boats.customerId, id))
    .orderBy(boats.nickname)

  // Fetch last 20 services with their boats
  const recentServices = await db
    .select()
    .from(services)
    .where(eq(services.customerId, id))
    .orderBy(desc(services.serviceDate))
    .limit(20)

  // Fetch all serviceBoats for those services in one query
  const serviceIds = recentServices.map((s) => s.id)
  const allServiceBoats =
    serviceIds.length > 0
      ? await db
          .select()
          .from(serviceBoats)
          .where(inArray(serviceBoats.serviceId, serviceIds))
      : []

  // Build a map boatId -> nickname for display
  const boatNicknameMap = new Map(customerBoats.map((b) => [b.id, b.nickname]))
  // Also fetch any boats that might be in serviceBoats but not in current boats list
  // (edge case: deleted boat); just show IDs if not found

  // Group serviceBoats by serviceId
  const boatsByService = new Map<string, string[]>()
  for (const sb of allServiceBoats) {
    const existing = boatsByService.get(sb.serviceId) ?? []
    const name = boatNicknameMap.get(sb.boatId) ?? sb.boatId
    existing.push(name)
    boatsByService.set(sb.serviceId, existing)
  }

  const isQboSynced = !!customer.qboCustomerId

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/customers"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mb-3"
        >
          ← Customers
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
          {customer.isPrepaid && (
            <Badge variant="default" className="bg-blue-100 text-blue-800 border-0">
              Prepaid
            </Badge>
          )}
          <div className="ml-auto">
            <Button asChild variant="outline" size="sm">
              <Link href={`/customers/${id}/edit`}>Edit</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {customer.notes && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">
                Notes / Gate code
              </p>
              <p className="text-sm text-yellow-900 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Email</p>
              <p>{customer.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Phone</p>
              <p>{customer.phone ?? '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground text-xs mb-0.5">Address</p>
              <p>{customer.address ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">QBO sync</p>
              {isQboSynced ? (
                <Badge variant="success">Synced</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not synced to QBO
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Boats section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Boats</h2>
          <AddBoatButton customerId={id} />
        </div>

        {customerBoats.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground text-sm">
            No boats yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customerBoats.map((boat) => (
              <Card key={boat.id}>
                <CardContent className="pt-4 pb-4">
                  <p className="font-medium">{boat.nickname}</p>
                  {boat.makeModel && (
                    <p className="text-sm text-muted-foreground">{boat.makeModel}</p>
                  )}
                  {boat.lengthFt && (
                    <p className="text-sm text-muted-foreground">{boat.lengthFt} ft</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Service history */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Service history</h2>

        {recentServices.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground text-sm">
            No services yet.
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {recentServices.map((svc) => {
              const boatNames = boatsByService.get(svc.id) ?? []
              return (
                <div
                  key={svc.id}
                  className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{formatServiceType(svc.serviceType)}</span>
                      <Badge variant={statusVariant(svc.status)}>
                        {svc.status.charAt(0).toUpperCase() + svc.status.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{formatDate(svc.serviceDate)}</p>
                    {boatNames.length > 0 && (
                      <p className="text-muted-foreground">{boatNames.join(', ')}</p>
                    )}
                  </div>
                  {svc.totalPrice && (
                    <span className="font-medium tabular-nums shrink-0">
                      ${Number(svc.totalPrice).toFixed(2)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
