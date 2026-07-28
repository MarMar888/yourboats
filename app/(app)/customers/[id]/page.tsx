import { db } from '@/lib/db'
import { customers, boats, services, serviceBoats, invoices, customerReminderContacts, recurringSchedules } from '@/lib/db/schema'
import { eq, desc, asc, inArray, and, gte, sql, count } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AddBoatButton from './customer-detail-client'
import ReminderContacts from './reminder-contacts-client'
import { CustomerNotesEditor } from './customer-notes-editor'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { deleteScheduledServices } from './service-actions'
import { RecurringScheduleList } from './recurring-schedule-client'
import type { RecurringScheduleRow } from './recurring-schedule-client'
import { EditCustomerModal } from './edit-customer-modal'
import { EditBoatModal } from './edit-boat-modal'
import { SyncToQboButton } from './sync-to-qbo-button'
import { SendStatementButton } from './send-statement-button'
import { CopyContextButton } from './copy-context-button'
import { todayET } from '@/lib/date'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: string) {
  if (status === 'complete') return 'success' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'secondary' as const
}

function invoiceStatusVariant(status: string) {
  if (status === 'paid') return 'success' as const
  if (status === 'overdue') return 'destructive' as const
  if (status === 'sent') return 'default' as const
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

  const currentUser = await getCurrentUser()
  const canManage = currentUser?.role === 'owner' || currentUser?.role === 'manager'

  // Fetch customer
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1)

  if (!customer) notFound()

  // Fetch all independent data in parallel
  const today = todayET()
  const [customerBoats, scheduledServices, customerInvoices, recentServices, reminderContacts, customerSchedules, futureCounts] =
    await Promise.all([
      db.select().from(boats).where(eq(boats.customerId, id)).orderBy(boats.nickname),

      db
        .select()
        .from(services)
        .where(and(eq(services.customerId, id), eq(services.status, 'scheduled')))
        .orderBy(asc(services.serviceDate)),

      db
        .select({
          id:           invoices.id,
          status:       invoices.status,
          amount:       invoices.amount,
          qboInvoiceId: invoices.qboInvoiceId,
          sentAt:       invoices.sentAt,
          paidAt:       invoices.paidAt,
          createdAt:    invoices.createdAt,
          serviceId:    invoices.serviceId,
          serviceDate:  services.serviceDate,
          serviceType:  services.serviceType,
        })
        .from(invoices)
        .innerJoin(services, eq(invoices.serviceId, services.id))
        .where(and(eq(services.customerId, id), eq(services.status, 'complete')))
        .orderBy(desc(invoices.createdAt))
        .limit(50),

      db
        .select()
        .from(services)
        .where(eq(services.customerId, id))
        .orderBy(desc(services.serviceDate))
        .limit(20),

      db
        .select()
        .from(customerReminderContacts)
        .where(eq(customerReminderContacts.customerId, id))
        .orderBy(customerReminderContacts.createdAt),

      db
        .select()
        .from(recurringSchedules)
        .where(eq(recurringSchedules.customerId, id))
        .orderBy(desc(recurringSchedules.createdAt)),

      db
        .select({
          recurringScheduleId: services.recurringScheduleId,
          count: count(),
        })
        .from(services)
        .where(
          and(
            eq(services.customerId, id),
            eq(services.status, 'scheduled'),
            gte(services.serviceDate, today),
            sql`${services.recurringScheduleId} is not null`
          )
        )
        .groupBy(services.recurringScheduleId),
    ])

  // Fetch serviceBoats for recent services (depends on recentServices result)
  const serviceIds = recentServices.map((s) => s.id)
  const allServiceBoats =
    serviceIds.length > 0
      ? await db.select().from(serviceBoats).where(inArray(serviceBoats.serviceId, serviceIds))
      : []

  // Fetch existing boat config from the first scheduled service per recurring schedule
  // so the edit modal can pre-populate the boat picker
  const firstServiceBySchedule = new Map<string, string>()
  for (const svc of scheduledServices) {
    if (svc.recurringScheduleId && !firstServiceBySchedule.has(svc.recurringScheduleId)) {
      firstServiceBySchedule.set(svc.recurringScheduleId, svc.id)
    }
  }
  const templateServiceIds = Array.from(firstServiceBySchedule.values())
  const templateBoatRows = templateServiceIds.length > 0
    ? await db
        .select({
          serviceId: serviceBoats.serviceId,
          boatId:    serviceBoats.boatId,
          rateType:  serviceBoats.rateType,
          rate:      serviceBoats.rate,
        })
        .from(serviceBoats)
        .where(inArray(serviceBoats.serviceId, templateServiceIds))
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

  // Build future-count lookup
  const futureCountBySchedule = new Map(
    futureCounts.map((r) => [r.recurringScheduleId, Number(r.count)])
  )

  // Build existing-boat lookup per schedule from template service rows
  const existingBoatsBySchedule = new Map<string, { boatId: string; rateType: 'per_ft' | 'flat'; rate: string | null }[]>()
  for (const [schedId, svcId] of Array.from(firstServiceBySchedule.entries())) {
    existingBoatsBySchedule.set(
      schedId,
      templateBoatRows
        .filter((r) => r.serviceId === svcId)
        .map((r) => ({
          boatId: r.boatId,
          rateType: (r.rateType ?? 'per_ft') as 'per_ft' | 'flat',
          rate: r.rate ?? null,
        }))
    )
  }

  const recurringScheduleRows: RecurringScheduleRow[] = customerSchedules.map((s) => ({
    id: s.id,
    serviceType: s.serviceType,
    frequencyWeeks: s.frequencyWeeks,
    dayOfWeek: s.dayOfWeek,
    startDate: s.startDate,
    endDate: s.endDate,
    active: s.active,
    futureCount: futureCountBySchedule.get(s.id) ?? 0,
    existingBoats: existingBoatsBySchedule.get(s.id) ?? [],
  }))

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="break-words text-2xl font-semibold">{customer.name}</h1>
            {customer.isPrepaid && (
              <Badge variant="default" className="bg-blue-100 text-blue-800 border-0">
                Prepaid
              </Badge>
            )}
          </div>
          {canManage && (
            <div className="sm:ml-auto flex items-center gap-2">
              <CopyContextButton
                customerName={customer.name}
                notes={customer.notes ?? null}
                isPrepaid={customer.isPrepaid ?? false}
                boats={customerBoats.map((b) => ({
                  nickname: b.nickname,
                  makeModel: b.makeModel ?? null,
                  lengthFt: b.lengthFt ?? null,
                  notes: b.notes ?? null,
                }))}
                recurringSchedules={recurringScheduleRows.map((s) => ({
                  serviceType: s.serviceType,
                  frequencyWeeks: s.frequencyWeeks,
                  dayOfWeek: typeof s.dayOfWeek === 'number' ? s.dayOfWeek : Number(s.dayOfWeek),
                  startDate: s.startDate,
                  endDate: s.endDate ?? null,
                  active: s.active,
                }))}
                scheduledServices={scheduledServices.map((s) => ({
                  serviceDate: s.serviceDate,
                  serviceType: s.serviceType,
                  status: s.status,
                  totalPrice: s.totalPrice ?? null,
                  boats: boatsByService.get(s.id) ?? [],
                }))}
                recentServices={recentServices.map((s) => ({
                  serviceDate: s.serviceDate,
                  serviceType: s.serviceType,
                  status: s.status,
                  totalPrice: s.totalPrice ?? null,
                  boats: boatsByService.get(s.id) ?? [],
                }))}
                invoices={customerInvoices.map((inv) => ({
                  serviceDate: inv.serviceDate,
                  serviceType: inv.serviceType,
                  status: inv.status,
                  amount: inv.amount,
                  sentAt: inv.sentAt,
                  paidAt: inv.paidAt,
                }))}
              />
              <EditCustomerModal
                customerId={id}
                initialValues={{
                  name: customer.name,
                  phone: customer.phone,
                  email: customer.email,
                  address: customer.address,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage ? (
            <CustomerNotesEditor customerId={id} notes={customer.notes} />
          ) : customer.notes ? (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">
                Notes / Gate code
              </p>
              <p className="text-sm text-yellow-900 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Email</p>
              <p className="break-words">{customer.email ?? '—'}</p>
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
              ) : canManage ? (
                <SyncToQboButton customerId={id} />
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not synced to QBO
                </Badge>
              )}
            </div>
            {isQboSynced && canManage && (
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Statement</p>
                <SendStatementButton customerId={id} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reminder contacts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reminder contacts</CardTitle>
          <p className="text-xs text-muted-foreground">
            Voice/SMS email addresses that receive service reminders (e.g. a Google Voice number).
            Only these addresses are used — the primary email is not included.
          </p>
        </CardHeader>
        <CardContent>
          <ReminderContacts customerId={id} contacts={reminderContacts} />
        </CardContent>
      </Card>

      {/* Boats section */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
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
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{boat.nickname}</p>
                    {canManage && (
                      <EditBoatModal boat={boat} customerId={id} />
                    )}
                  </div>
                  {boat.makeModel && (
                    <p className="text-sm text-muted-foreground">{boat.makeModel}</p>
                  )}
                  {boat.lengthFt && (
                    <p className="text-sm text-muted-foreground">{boat.lengthFt} ft</p>
                  )}
                  {boat.notes ? (
                    <p className="text-xs text-muted-foreground italic">{boat.notes}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recurring schedules */}
      {canManage && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Recurring schedules</h2>
          <RecurringScheduleList
            schedules={recurringScheduleRows}
            canManage={canManage}
            boats={customerBoats.map((b) => ({ id: b.id, nickname: b.nickname, lengthFt: b.lengthFt }))}
          />
        </div>
      )}

      {/* Scheduled services */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Scheduled services</h2>
          {canManage && scheduledServices.length > 0 && (
            <ConfirmDeleteButton
              action={deleteScheduledServices.bind(null, id)}
              title="Delete all scheduled services?"
              description={`This will permanently delete all ${scheduledServices.length} upcoming scheduled service${scheduledServices.length === 1 ? '' : 's'} for ${customer.name}. This cannot be undone.`}
              triggerLabel="Delete all scheduled"
            />
          )}
        </div>
        {scheduledServices.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground text-sm">
            No upcoming services.
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {scheduledServices.map((svc) => {
              const boatNames = boatsByService.get(svc.id) ?? []
              return (
                <Link
                  key={svc.id}
                  href={`/schedule/${svc.id}`}
                  className="flex items-start justify-between gap-4 px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{formatServiceType(svc.serviceType)}</span>
                      {svc.approvedAt && (
                        <span className="text-xs text-green-600 font-medium">✓ Approved</span>
                      )}
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
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Invoices */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Invoices</h2>
        {customerInvoices.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground text-sm">
            No invoices yet.
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {customerInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices`}
                className="flex items-start justify-between gap-4 px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={invoiceStatusVariant(inv.status)} className="capitalize">
                      {inv.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      {formatServiceType(inv.serviceType)} · {formatDate(inv.serviceDate)}
                    </span>
                  </div>
                  {inv.sentAt && (
                    <p className="text-xs text-muted-foreground">
                      Sent {new Date(inv.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                  {inv.paidAt && (
                    <p className="text-xs text-green-600">
                      Paid {new Date(inv.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <span className="font-medium tabular-nums shrink-0">
                  ${Number(inv.amount).toFixed(2)}
                </span>
              </Link>
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
                <Link
                  key={svc.id}
                  href={`/schedule/${svc.id}`}
                  className="flex items-start justify-between gap-4 px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
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
                    <span className="shrink-0 font-medium tabular-nums">
                      ${Number(svc.totalPrice).toFixed(2)}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
