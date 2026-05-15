import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { services, complaints, customers, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import FlagComplaintButton from './flag-complaint-button'

interface PageProps {
  params: Promise<{ id: string }>
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  recurring: 'Recurring',
  detailing: 'Detailing',
  buffing_waxing: 'Buffing & Waxing',
  acid_washing: 'Acid Washing',
  powerwashing: 'Powerwashing',
  gelcoat_wetsanding: 'Gelcoat Wetsanding',
  captaining: 'Captaining',
  other: 'Other',
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'secondary' | 'destructive'> = {
  scheduled: 'default',
  complete: 'success',
  cancelled: 'destructive',
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { id } = await params

  const service = await db.query.services.findFirst({
    where: eq(services.id, id),
    with: {
      customer: true,
      completedBy: true,
      assignments: { with: { user: true } },
      serviceBoats: { with: { boat: true } },
    },
  })

  if (!service) notFound()

  const serviceComplaints = await db
    .select({
      id: complaints.id,
      description: complaints.description,
      severity: complaints.severity,
      resolved: complaints.resolved,
      createdAt: complaints.createdAt,
      createdByName: users.displayName,
    })
    .from(complaints)
    .leftJoin(users, eq(complaints.createdByUserId, users.id))
    .where(eq(complaints.serviceId, id))
    .orderBy(complaints.createdAt)

  const statusVariant = STATUS_VARIANT[service.status] ?? 'secondary'

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {SERVICE_TYPE_LABELS[service.serviceType] ?? service.serviceType}
          </h1>
          <p className="text-muted-foreground mt-1">{service.customer.name}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Badge variant={statusVariant} className="capitalize">
            {service.status}
          </Badge>
          <FlagComplaintButton serviceId={service.id} customerId={service.customerId} />
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-lg border bg-card divide-y">
        <DetailRow label="Date" value={service.serviceDate} />
        <DetailRow
          label="Price"
          value={service.totalPrice ? `$${Number(service.totalPrice).toFixed(2)}` : '—'}
        />
        {service.notes && <DetailRow label="Notes" value={service.notes} />}
        {service.completedBy && (
          <DetailRow label="Completed by" value={service.completedBy.displayName} />
        )}
        {service.completedAt && (
          <DetailRow
            label="Completed at"
            value={new Date(service.completedAt).toLocaleString()}
          />
        )}
      </div>

      {/* Boats */}
      {service.serviceBoats.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Boats
          </h2>
          <div className="rounded-lg border bg-card divide-y">
            {service.serviceBoats.map(({ boat }) => (
              <div key={boat.id} className="px-4 py-3 text-sm">
                <span className="font-medium">{boat.nickname}</span>
                {boat.makeModel && (
                  <span className="text-muted-foreground ml-2">{boat.makeModel}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Assigned crew */}
      {service.assignments.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Crew
          </h2>
          <div className="rounded-lg border bg-card divide-y">
            {service.assignments.map(({ user, sharePct }) => (
              <div key={user.id} className="px-4 py-3 text-sm flex justify-between">
                <span className="font-medium">{user.displayName}</span>
                <span className="text-muted-foreground">{sharePct}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Complaints */}
      {serviceComplaints.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Complaints
          </h2>
          <div className="rounded-lg border bg-card divide-y">
            {serviceComplaints.map((c) => (
              <div key={c.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={c.severity === 'major' ? 'destructive' : 'warning'} className="capitalize">
                    {c.severity}
                  </Badge>
                  {c.resolved ? (
                    <Badge variant="success">Resolved</Badge>
                  ) : (
                    <Badge variant="outline">Open</Badge>
                  )}
                  {c.createdByName && (
                    <span className="text-xs text-muted-foreground ml-auto">{c.createdByName}</span>
                  )}
                </div>
                <p className="text-sm">{c.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex px-4 py-3 text-sm gap-4">
      <span className="w-36 flex-shrink-0 text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}
