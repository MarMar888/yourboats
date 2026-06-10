import { db } from '@/lib/db'
import {
  services, customers, serviceBoats, boats,
  serviceBoatAssignments, invoices, complaints, users, timeEntries,
} from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { Badge } from '@/components/ui/badge'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { deleteService } from '../actions'
import { BoatAssignment } from './boat-assignment'
import FlagComplaintButton from './flag-complaint-button'
import { AddTipForm } from './add-tip-form'
import { SyncTipButton } from './sync-tip-button'
import { MarkIncompleteButton } from './mark-incomplete-button'
import { EditServicePanel } from './edit-service-panel'
import { GenerateInvoiceButton } from './generate-invoice-button'
import { ServiceNotesEditor } from './service-notes-editor'
import { TimeTracker } from './time-tracker'

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

  const currentUser = await getCurrentUser()
  const canManage = currentUser?.role === 'owner' || currentUser?.role === 'manager'

  // Fetch service + customer
  const [svc] = await db
    .select({
      id:           services.id,
      serviceDate:  services.serviceDate,
      serviceType:  services.serviceType,
      status:       services.status,
      notes:        services.notes,
      totalPrice:   services.totalPrice,
      tipAmount:    services.tipAmount,
      approvedAt:           services.approvedAt,
      approvedBy:           services.approvedByUserId,
      completedAt:          services.completedAt,
      completedByUserId:    services.completedByUserId,
      reminderSentAt:       services.reminderSentAt,
      completionPhotoUrl:   services.completionPhotoUrl,
      customerName: customers.name,
      customerId:   customers.id,
      isPrepaid:    customers.isPrepaid,
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

  // Load all active users for assignment display and picker
  const allUsers = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.displayName))
  const userNames = Object.fromEntries(allUsers.map((u) => [u.id, u.displayName]))

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

  // Fetch all boats for this customer (for edit form boat picker)
  const allCustomerBoats = await db
    .select({ id: boats.id, nickname: boats.nickname, makeModel: boats.makeModel, lengthFt: boats.lengthFt })
    .from(boats)
    .innerJoin(customers, eq(boats.customerId, customers.id))
    .innerJoin(services, eq(services.customerId, customers.id))
    .where(eq(services.id, id))
    .orderBy(boats.nickname)

  const [invoice] = await db
    .select({
      id:              invoices.id,
      status:          invoices.status,
      amount:          invoices.amount,
      qboInvoiceId:    invoices.qboInvoiceId,
      sentAt:          invoices.sentAt,
      createdAt:       invoices.createdAt,
      createdByUserId: invoices.createdByUserId,
    })
    .from(invoices)
    .where(eq(invoices.serviceId, id))
    .limit(1)

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

  // Time entries for this service
  const timeEntryRows = await db
    .select({
      id:               timeEntries.id,
      userId:           timeEntries.userId,
      boatId:           timeEntries.boatId,
      clockIn:          timeEntries.clockIn,
      clockOut:         timeEntries.clockOut,
      notes:            timeEntries.notes,
      employeeName:     users.displayName,
      boatNickname:     boats.nickname,
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .leftJoin(boats, eq(timeEntries.boatId, boats.id))
    .where(eq(timeEntries.serviceId, id))
    .orderBy(timeEntries.clockIn)

  // Check if current user is assigned to this service (to show clock-in)
  const isAssigned = currentUser
    ? boatDetails.some((b) => b.assignedIds.includes(currentUser.id))
    : false
  // Anyone who can see the service can clock in (employees via assignment, managers always)
  const showTimeTracker = canManage || isAssigned

  return (
    <div className="max-w-4xl min-w-0">
    <div className="grid min-w-0 grid-cols-1 gap-6 items-start lg:grid-cols-[minmax(0,1fr)_260px]">
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/schedule"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mb-3"
        >
          ← Schedule
        </Link>
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{svc.customerName}</h1>
            <p className="text-muted-foreground mt-0.5">
              {SERVICE_LABELS[svc.serviceType] ?? svc.serviceType} · {fmtDate(svc.serviceDate)}
            </p>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2 sm:flex-shrink-0 sm:justify-end">
            <span className={cn(
              'text-xs px-2.5 py-1 rounded-full border font-medium',
              STATUS_STYLES[svc.status] ?? STATUS_STYLES.scheduled
            )}>
              {svc.status}
            </span>
            {canManage && svc.status === 'complete' && (
              <MarkIncompleteButton serviceId={svc.id} />
            )}
            <FlagComplaintButton serviceId={svc.id} customerId={svc.customerId} />
            {canManage && (
              <>
                <EditServicePanel
                  serviceId={svc.id}
                  initialValues={{
                    serviceDate: svc.serviceDate,
                    serviceType: svc.serviceType,
                    notes: svc.notes,
                    totalPrice: svc.totalPrice,
                    status: svc.status,
                  }}
                  boats={boatDetails}
                  allCustomerBoats={allCustomerBoats.map((b) => ({
                    boatId: b.id,
                    nickname: b.nickname,
                    makeModel: b.makeModel,
                    lengthFt: b.lengthFt,
                    description: boatMap.get(b.id)?.description ?? null,
                    notes: boatMap.get(b.id)?.notes ?? null,
                    rateType: boatMap.get(b.id)?.rateType ?? null,
                    rate: boatMap.get(b.id)?.rate ?? null,
                    assignedIds: boatMap.get(b.id)?.assignedIds ?? [],
                  }))}
                  employees={allUsers}
                />
                <ConfirmDeleteButton
                  action={deleteService.bind(null, svc.id, '/schedule')}
                  title="Delete service"
                  description={`Delete the service for ${svc.customerName} on ${fmtDate(svc.serviceDate)}? The associated invoice will also be deleted. This cannot be undone.`}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {(svc.approvedAt || svc.completedAt || svc.reminderSentAt) && (
        <div className="flex min-w-0 flex-wrap gap-3 text-xs">
          {svc.approvedAt && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 px-3 py-1 font-medium">
              <span className="truncate">
              ✓ Approved {fmtDateTime(svc.approvedAt)}
              {svc.approvedBy && ` by ${userNames[svc.approvedBy] ?? svc.approvedBy}`}
              </span>
            </span>
          )}
          {svc.completedAt && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 px-3 py-1 font-medium">
              <span className="truncate">
              ✓ Completed {fmtDateTime(svc.completedAt)}
              {svc.completedByUserId && ` by ${userNames[svc.completedByUserId] ?? svc.completedByUserId}`}
              </span>
            </span>
          )}
          {svc.reminderSentAt && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-3 py-1 font-medium">
              <span className="truncate">
              ✉ Reminder sent {fmtDateTime(svc.reminderSentAt)}
              </span>
            </span>
          )}
        </div>
      )}

      {canManage ? (
        <ServiceNotesEditor serviceId={svc.id} notes={svc.notes} />
      ) : svc.notes ? (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3">
          <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">Service notes</p>
          <p className="text-sm text-yellow-900 whitespace-pre-wrap">{svc.notes}</p>
        </div>
      ) : null}

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
                <div key={b.boatId} className="min-w-0 rounded-lg border bg-card px-4 py-3 space-y-2">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <span className="font-medium text-sm">{b.nickname}</span>
                      {b.makeModel && <span className="text-xs text-muted-foreground ml-2">{b.makeModel}</span>}
                      {b.lengthFt && <span className="text-xs text-muted-foreground ml-1">· {b.lengthFt} ft</span>}
                    </div>
                    {lineTotal > 0 && (
                      <span className="text-sm font-semibold tabular-nums sm:shrink-0">
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
                        employees={allUsers}
                        assignedIds={b.assignedIds}
                      />
                    </div>
                  ) : b.assignedIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {b.assignedIds.map((uid) => (
                        <span
                          key={uid}
                          className="bg-foreground text-background border-transparent shadow-sm rounded-full px-2.5 py-0.5 text-xs font-medium border"
                        >
                          {userNames[uid] ?? uid}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Invoice</h2>
        {svc.isPrepaid ? (
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Prepaid customer — no invoice required
          </div>
        ) : invoice ? (
          <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
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
              {invoice.createdByUserId && (
                <span className="text-xs text-muted-foreground">
                  Created by {userNames[invoice.createdByUserId] ?? invoice.createdByUserId}
                </span>
              )}
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
                className="min-w-0 truncate text-xs font-mono text-primary hover:underline"
              >
                #{invoice.qboInvoiceId}
              </a>
            )}
          </div>
        ) : svc.status === 'complete' && canManage ? (
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground mb-2">No invoice for this service.</p>
            <GenerateInvoiceButton serviceId={svc.id} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No invoice yet.</p>
        )}
      </div>

      {/* Tip section — shown for completed services */}
      {svc.status === 'complete' && (
        <div>
          <h2 className="text-base font-semibold mb-3">Tip</h2>
          <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
            {svc.tipAmount ? (
              <p className="text-sm font-medium">
                Tip: <span className="tabular-nums">${Number(svc.tipAmount).toFixed(2)}</span>
              </p>
            ) : canManage ? (
              <div>
                <p className="text-sm text-muted-foreground mb-1">No tip recorded yet.</p>
                <AddTipForm serviceId={svc.id} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tip recorded.</p>
            )}
            {canManage && invoice?.qboInvoiceId && (
              <SyncTipButton serviceId={svc.id} />
            )}
          </div>
        </div>
      )}

      {/* Audit trail */}
      {canManage && (svc.completedAt || svc.approvedAt || invoice?.createdByUserId) && (
        <div>
          <h2 className="text-base font-semibold mb-2">Audit trail</h2>
          <div className="rounded-lg border bg-card px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
            {svc.completedAt && (
              <p>
                <span className="font-medium text-foreground">Completed</span>{' '}
                by{' '}
                <span className="font-medium text-foreground">
                  {svc.completedByUserId ? (userNames[svc.completedByUserId] ?? svc.completedByUserId) : 'unknown'}
                </span>{' '}
                on {fmtDateTime(svc.completedAt)}
              </p>
            )}
            {svc.approvedAt && (
              <p>
                <span className="font-medium text-foreground">Approved</span>{' '}
                {svc.approvedBy ? (
                  <>
                    by{' '}
                    <span className="font-medium text-foreground">
                      {userNames[svc.approvedBy] ?? svc.approvedBy}
                    </span>{' '}
                  </>
                ) : null}
                on {fmtDateTime(svc.approvedAt)}
              </p>
            )}
            {invoice?.createdByUserId && (
              <p>
                <span className="font-medium text-foreground">Invoiced</span>{' '}
                by{' '}
                <span className="font-medium text-foreground">
                  {userNames[invoice.createdByUserId] ?? invoice.createdByUserId}
                </span>{' '}
                on {fmtDateTime(invoice.createdAt)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Time tracking ── */}
      {showTimeTracker && (
        <div>
          <h2 className="text-base font-semibold mb-3">Time</h2>
          <TimeTracker
            serviceId={svc.id}
            entries={timeEntryRows.map((e) => ({
              id: e.id,
              userId: e.userId,
              boatId: e.boatId ?? null,
              boatNickname: e.boatNickname ?? null,
              clockIn: e.clockIn,
              clockOut: e.clockOut ?? null,
              notes: e.notes ?? null,
              employeeName: e.employeeName ?? 'Unknown',
            }))}
            boats={boatDetails.map((b) => ({ boatId: b.boatId, nickname: b.nickname }))}
            employees={allUsers}
            currentUserId={currentUser?.id ?? null}
            canManage={canManage}
          />
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

      <div className="pt-2 border-t">
        <Link
          href={`/customers/${svc.customerId}`}
          className="text-sm text-primary hover:underline"
        >
          View customer profile →
        </Link>
      </div>
    </div>{/* end space-y-6 */}

    {/* Right column: completion photo */}
    {svc.completionPhotoUrl && (
      <div className="lg:sticky lg:top-6">
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b">
            <p className="text-xs font-medium text-muted-foreground">Completion photo</p>
          </div>
          <a href={svc.completionPhotoUrl} target="_blank" rel="noopener noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={svc.completionPhotoUrl}
              alt="Service completion photo"
              className="w-full object-cover hover:opacity-90 transition-opacity"
            />
          </a>
        </div>
      </div>
    )}
    </div>{/* end grid */}
    </div>
  )
}
