import { db } from '@/lib/db'
import {
  services, customers, serviceBoats, boats,
  serviceBoatAssignments, invoices, complaints, users,
} from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { Badge } from '@/components/ui/badge'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { deleteService } from '../actions'
import { BoatAssignment } from './boat-assignment'
import FlagComplaintButton from './flag-complaint-button'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`
}

function fmtDateTime(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const SERVICE_LABELS: Record<string, string> = {
  recurring:         'Standard Clean',
  detailing:         'Detailing',
  buffing_waxing:    'Buffing & Waxing',
  acid_washing:      'Acid Washing',
  powerwashing:      'Powerwashing',
  gelcoat_wetsanding:'Gelcoat Wet-Sanding',
  captaining:        'Captaining',
  other:             'Other',
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  complete:  'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

function qboInvoiceUrl(qboInvoiceId: string) {
  const base = process.env.QBO_ENVIRONMENT === 'production'
    ? 'https://app.qbo.intuit.com'
    : 'https://sandbox.qbo.intuit.com'
  return `${base}/app/invoice?txnId=${qboInvoiceId}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const devUser = DEV_USERS.find((u) => u.id === devUserId)
  const canManage = devUser?.role === 'owner' || devUser?.role === 'manager'

  // Fetch service + customer
  const [svc] = await db
    .select({
      id:           services.id,
      serviceDate:  services.serviceDate,
      serviceType:  services.serviceType,
      status:       services.status,
      notes:        services.notes,
      totalPrice:   services.totalPrice,
      approvedAt:   services.approvedAt,
      approvedBy:   services.approvedByUserId,
      completedAt:  services.completedAt,
      customerName: customers.name,
      customerId:   customers.id,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(eq(services.id, id))
    .limit(1)

  if (!svc) notFound()

  // Fetch boats on this service with their assignments
  const boatRows = await db
    .select({
      boatId:      boats.id,
      nickname:    boats.nickname,
      makeModel:   boats.makeModel,
      lengthFt:    boats.lengthFt,
      description: serviceBoats.description,
      notes:       serviceBoats.notes,
      rateType:    serviceBoats.rateType,
      rate:        serviceBoats.rate,
      assignedUserId: serviceBoatAssignments.userId,
    })
    .from(serviceBoats)
    .innerJoin(boats, eq(boats.id, serviceBoats.boatId))
    .leftJoin(
      serviceBoatAssignments,
      and(
        eq(serviceBoatAssignments.serviceId, serviceBoats.serviceId),
        eq(serviceBoatAssignments.boatId, serviceBoats.boatId)
      )
    )
    .where(eq(serviceBoats.serviceId, id))
    .orderBy(boats.nickname)

  // Deduplicate boats (multiple rows per boat if multiple assignees)
  const userNames = Object.fromEntries(DEV_USERS.map((u) => [u.id, u.displayName]))

  type BoatDetail = {
    boatId: string; nickname: string; makeModel: string | null; lengthFt: number | null
    description: string | null; notes: string | null; rateType: string | null; rate: string | null
    assignedIds: string[]
  }
  const boatMap = new Map<string, BoatDetail>()
  for (const r of boatRows) {
    if (!boatMap.has(r.boatId)) {
      boatMap.set(r.boatId, {
        boatId: r.boatId, nickname: r.nickname, makeModel: r.makeModel,
        lengthFt: r.lengthFt, description: r.description, notes: r.notes,
        rateType: r.rateType, rate: r.rate, assignedIds: [],
      })
    }
    if (r.assignedUserId) {
      const b = boatMap.get(r.boatId)!
      if (!b.assignedIds.includes(r.assignedUserId)) b.assignedIds.push(r.assignedUserId)
    }
  }
  const boatDetails = Array.from(boatMap.values())

  // Fetch complaints
  const serviceComplaints = await db
    .select({
      id:            complaints.id,
      description:   complaints.description,
      severity:      complaints.severity,
      resolved:      complaints.resolved,
      createdAt:     complaints.createdAt,
      createdByName: users.displayName,
    })
    .from(complaints)
    .leftJoin(users, eq(complaints.createdByUserId, users.id))
    .where(eq(complaints.serviceId, id))
    .orderBy(complaints.createdAt)

  // Fetch invoice
  const [invoice] = await db
    .select({
      id:           invoices.id,
      status:       invoices.status,
      amount:       invoices.amount,
      qboInvoiceId: invoices.qboInvoiceId,
      sentAt:       invoices.sentAt,
    })
    .from(invoices)
    .where(eq(invoices.serviceId, id))
    .limit(1)

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/schedule"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mb-3"
        >
          ← Schedule
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{svc.customerName}</h1>
            <p className="text-muted-foreground mt-0.5">
              {SERVICE_LABELS[svc.serviceType] ?? svc.serviceType} · {fmtDate(svc.serviceDate)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={cn(
              'text-xs px-2.5 py-1 rounded-full border font-medium',
              STATUS_STYLES[svc.status] ?? STATUS_STYLES.scheduled
            )}>
              {svc.status}
            </span>
            {canManage && (
              <FlagComplaintButton serviceId={svc.id} customerId={svc.customerId} />
            )}
            {canManage && (
              <ConfirmDeleteButton
                action={deleteService.bind(null, svc.id, '/schedule')}
                title="Delete service"
                description={`Delete the service for ${svc.customerName} on ${fmtDate(svc.serviceDate)}? The associated invoice will also be deleted. This cannot be undone.`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Approval / completion */}
      {(svc.approvedAt || svc.completedAt) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {svc.approvedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 px-3 py-1 font-medium">
              ✓ Approved {fmtDateTime(svc.approvedAt)}
              {svc.approvedBy && ` by ${userNames[svc.approvedBy] ?? svc.approvedBy}`}
            </span>
          )}
          {svc.completedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 px-3 py-1 font-medium">
              ✓ Completed {fmtDateTime(svc.completedAt)}
            </span>
          )}
        </div>
      )}

      {/* Service notes */}
      {svc.notes && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3">
          <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">Service notes</p>
          <p className="text-sm text-yellow-900 whitespace-pre-wrap">{svc.notes}</p>
        </div>
      )}

      {/* Boats */}
      <div>
        <h2 className="text-base font-semibold mb-3">
          Boats
          {svc.totalPrice && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              Total: ${Number(svc.totalPrice).toFixed(2)}
            </span>
          )}
        </h2>

        {boatDetails.length === 0 ? (
          <p className="text-sm text-muted-foreground">No boats on this service.</p>
        ) : (
          <div className="space-y-3">
            {boatDetails.map((b) => {
              const rate = Number(b.rate ?? 0)
              const qty = b.rateType === 'per_ft' ? (b.lengthFt ?? 1) : 1
              const lineTotal = rate * qty

              return (
                <div key={b.boatId} className="rounded-lg border bg-card px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-medium text-sm">{b.nickname}</span>
                      {b.makeModel && <span className="text-xs text-muted-foreground ml-2">{b.makeModel}</span>}
                      {b.lengthFt && <span className="text-xs text-muted-foreground ml-1">· {b.lengthFt} ft</span>}
                    </div>
                    {lineTotal > 0 && (
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        ${lineTotal.toFixed(2)}
                        {b.rateType === 'per_ft' && b.lengthFt && (
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            ({b.lengthFt}ft × ${rate.toFixed(2)})
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  {b.description && (
                    <div className="flex flex-wrap gap-1.5">
                      {b.description.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (
                        <span key={s} className="text-xs bg-primary/10 text-primary rounded-full px-2.5 py-0.5 font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {b.notes && (
                    <p className="text-xs italic text-muted-foreground border-t pt-2">{b.notes}</p>
                  )}

                  {canManage ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Assign to</p>
                      <BoatAssignment
                        serviceId={svc.id}
                        boatId={b.boatId}
                        employees={DEV_USERS.map((u) => ({ id: u.id, displayName: u.displayName }))}
                        assignedIds={b.assignedIds}
                      />
                    </div>
                  ) : b.assignedIds.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Assigned to:{' '}
                      <span className="font-medium text-foreground">
                        {b.assignedIds.map((id) => userNames[id] ?? id).join(', ')}
                      </span>
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invoice */}
      {invoice && (
        <div>
          <h2 className="text-base font-semibold mb-3">Invoice</h2>
          <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                invoice.status === 'paid'    ? 'border-green-200 bg-green-50 text-green-700' :
                invoice.status === 'sent'    ? 'border-blue-200 bg-blue-50 text-blue-700' :
                invoice.status === 'overdue' ? 'border-red-200 bg-red-50 text-red-700' :
                'border-border bg-muted text-muted-foreground'
              )}>
                {invoice.status}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                ${Number(invoice.amount).toFixed(2)}
              </span>
              {invoice.sentAt && (
                <span className="text-xs text-muted-foreground">
                  Sent {fmtDateTime(invoice.sentAt)}
                </span>
              )}
            </div>
            {invoice.qboInvoiceId && (
              <a
                href={qboInvoiceUrl(invoice.qboInvoiceId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-primary hover:underline"
              >
                #{invoice.qboInvoiceId}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Debug / admin IDs */}
      {canManage && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground transition-colors">IDs</summary>
          <div className="mt-1.5 space-y-1 pl-1">
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0">Service ID</span>
              <span className="font-mono">{svc.id}</span>
            </div>
            {invoice && (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-24 shrink-0">Invoice ID</span>
                  <span className="font-mono">{invoice.id}</span>
                </div>
                {invoice.qboInvoiceId && (
                  <div className="flex items-center gap-2">
                    <span className="w-24 shrink-0">QBO Invoice</span>
                    <span className="font-mono">{invoice.qboInvoiceId}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </details>
      )}

      {/* Complaints */}
      {serviceComplaints.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Complaints</h2>
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

      {/* Customer link */}
      <div className="pt-2 border-t">
        <Link
          href={`/customers/${svc.customerId}`}
          className="text-sm text-primary hover:underline"
        >
          View customer profile →
        </Link>
      </div>
    </div>
  )
}
